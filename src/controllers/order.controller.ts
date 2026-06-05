import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Order } from "../models/order.model";
import { Cart } from "../models/cart.model";
import { Product } from "../models/product.model";
import { User } from "../models/user.model";
import { Coupon, ICoupon } from "../models/coupon.model";
import { Reward } from "../models/reward.model";
import { Settings } from "../models/settings.model";
import { calculatePoints } from "../utils/rewardUtils";
import { env } from "../config/env";
import { paginate } from "../utils/pagination";
import { sendOrderConfirmationEmail } from "../utils/email";
import { FilterQuery, Types } from "mongoose";
import { IOrder } from "../models/order.model";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRazorpay(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(503, "Razorpay is not configured on this server");
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await Order.countDocuments();
  return `PC-${year}-${String(count + 1).padStart(6, "0")}`;
}

async function resolveCoupon(
  code: string,
  subtotal: number
): Promise<{ coupon: ICoupon; discountAmount: number }> {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon) throw new ApiError(404, "Coupon not found");
  if (!coupon.isActive) throw new ApiError(400, "Coupon is inactive");

  const now = new Date();
  if (now < coupon.validFrom) throw new ApiError(400, "Coupon is not yet valid");
  if (now > coupon.validUntil) throw new ApiError(400, "Coupon has expired");
  if (coupon.usedCount >= coupon.maxUsage)
    throw new ApiError(400, "Coupon usage limit has been reached");
  if (subtotal < coupon.minOrderValue)
    throw new ApiError(
      400,
      `Minimum order value for this coupon is ₹${coupon.minOrderValue}`
    );

  const discountAmount =
    coupon.discountType === "flat"
      ? Math.min(coupon.discountValue, subtotal)
      : Math.round((subtotal * coupon.discountValue) / 100);

  return { coupon, discountAmount };
}

// ─── Shared cart-validation logic (used by COD and Razorpay create) ───────────

async function buildOrderPayload(userId: Types.ObjectId, addressId: string) {
  // Cart
  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0)
    throw new ApiError(400, "Cart is empty");

  // User + address
  const user = await User.findById(userId).select("name email addresses");
  if (!user) throw new ApiError(404, "User not found");

  const address = user.addresses.id(addressId);
  if (!address) throw new ApiError(404, "Address not found");

  // Validate each product and build order items
  const orderItems: {
    product: Types.ObjectId;
    name: string;
    image: string;
    sku: string;
    price: number;
    quantity: number;
  }[] = [];

  for (const cartItem of cart.items) {
    const product = await Product.findById(cartItem.product);
    if (!product) throw new ApiError(404, `Product ${cartItem.product} not found`);
    if (!product.isActive)
      throw new ApiError(400, `Product "${product.name}" is no longer available`);
    if (product.stock < cartItem.quantity)
      throw new ApiError(
        400,
        `Insufficient stock for "${product.name}". Available: ${product.stock}`
      );

    orderItems.push({
      product: product._id as Types.ObjectId,
      name: product.name,
      image: product.images[0] || "",
      sku: product.sku,
      price: cartItem.priceAtAdd,
      quantity: cartItem.quantity,
    });
  }

  const subtotal = cart.items.reduce(
    (sum, i) => sum + i.priceAtAdd * i.quantity,
    0
  );

  return { cart, user, address, orderItems, subtotal };
}

// ─── Shared: award points + determine free gift after successful order ────────

async function applyRewardsAndGift(
  order: IOrder,
  userId: Types.ObjectId
): Promise<{ pointsEarned: number; newPointsBalance: number }> {
  const pointsEarned = calculatePoints(order.total);

  await User.findByIdAndUpdate(userId, { $inc: { rewardPoints: pointsEarned } });
  await Reward.create({
    user: userId,
    order: order._id,
    pointsEarned,
    orderTotal: order.total,
  });
  order.pointsEarned = pointsEarned;

  const settings = await Settings.getSettings();
  if (settings.freeGiftEnabled) {
    order.hasFreeGift = true;
  } else {
    const productIds = order.items.map((item) => item.product);
    const gifted = await Product.find({ _id: { $in: productIds }, hasFreeGift: true });
    order.hasFreeGift = gifted.length > 0;
  }

  await order.save();

  const updatedUser = await User.findById(userId).select("rewardPoints");
  return { pointsEarned, newPointsBalance: updatedUser?.rewardPoints ?? 0 };
}

// ─── POST /api/v1/cart/coupon/validate ────────────────────────────────────────

export const validateCoupon = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { code } = req.body as { code: string };

    if (!code) throw new ApiError(400, "Coupon code is required");

    const cart = await Cart.findOne({ user: userId });
    if (!cart || cart.items.length === 0)
      throw new ApiError(400, "Cart is empty — add items before validating a coupon");

    const subtotal = cart.items.reduce(
      (sum, i) => sum + i.priceAtAdd * i.quantity,
      0
    );

    const { coupon, discountAmount } = await resolveCoupon(code, subtotal);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discountAmount,
          subtotal,
          payable: subtotal - discountAmount,
        },
        "Coupon is valid"
      )
    );
  }
);

// ─── POST /api/v1/orders/cod ──────────────────────────────────────────────────

export const createOrderCOD = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id as Types.ObjectId;
    const { addressId, couponCode, notes } = req.body as {
      addressId: string;
      couponCode?: string;
      notes?: string;
    };

    if (!addressId) throw new ApiError(400, "addressId is required");

    const { cart, user, address, orderItems, subtotal } =
      await buildOrderPayload(userId, addressId);

    // Coupon
    let discount = 0;
    let appliedCoupon: ICoupon | null = null;
    if (couponCode) {
      const result = await resolveCoupon(couponCode, subtotal);
      discount = result.discountAmount;
      appliedCoupon = result.coupon;
    }

    const shippingCharge = subtotal - discount >= 999 ? 0 : 60;
    const tax = 0;
    const total = subtotal - discount + shippingCharge + tax;

    const orderNumber = await generateOrderNumber();

    const order = await Order.create({
      orderNumber,
      user: userId,
      items: orderItems,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      subtotal,
      discount,
      couponCode: appliedCoupon?.code,
      shippingCharge,
      tax,
      total,
      paymentMethod: "cod",
      paymentStatus: "pending",
      status: "placed",
      statusHistory: [
        { status: "placed", note: "Order placed via COD", timestamp: new Date() },
      ],
      notes,
    });

    // Decrement stock
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }

    // Increment coupon usage
    if (appliedCoupon) {
      await Coupon.findByIdAndUpdate(appliedCoupon._id, {
        $inc: { usedCount: 1 },
      });
    }

    // Clear cart
    cart.items = [] as unknown as typeof cart.items;
    cart.couponApplied = undefined;
    await cart.save();

    // Fire-and-forget — email.ts catches and logs failures internally
    void sendOrderConfirmationEmail(order, user);

    const { pointsEarned, newPointsBalance } = await applyRewardsAndGift(order, userId);

    res.status(201).json(
      new ApiResponse(
        201,
        { order, pointsEarned, newPointsBalance },
        "Order placed successfully"
      )
    );
  }
);

// ─── POST /api/v1/orders/razorpay/create ─────────────────────────────────────

export const createRazorpayOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id as Types.ObjectId;
    const { addressId, couponCode, notes } = req.body as {
      addressId: string;
      couponCode?: string;
      notes?: string;
    };

    if (!addressId) throw new ApiError(400, "addressId is required");

    const { address, orderItems, subtotal } = await buildOrderPayload(
      userId,
      addressId
    );

    let discount = 0;
    let appliedCoupon: ICoupon | null = null;
    if (couponCode) {
      const result = await resolveCoupon(couponCode, subtotal);
      discount = result.discountAmount;
      appliedCoupon = result.coupon;
    }

    const shippingCharge = subtotal - discount >= 999 ? 0 : 60;
    const tax = 0;
    const total = subtotal - discount + shippingCharge + tax;

    const orderNumber = await generateOrderNumber();
    const rzp = getRazorpay();

    const rzpOrder = (await rzp.orders.create({
      amount: Math.round(total * 100), // paise
      currency: "INR",
      receipt: orderNumber,
    })) as any;

    const order = await Order.create({
      orderNumber,
      user: userId,
      items: orderItems,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      subtotal,
      discount,
      couponCode: appliedCoupon?.code,
      shippingCharge,
      tax,
      total,
      paymentMethod: "razorpay",
      paymentStatus: "pending",
      razorpayOrderId: rzpOrder.id,
      status: "placed",
      statusHistory: [
        {
          status: "placed",
          note: "Razorpay payment initiated",
          timestamp: new Date(),
        },
      ],
      notes,
    });

    res.status(201).json(
      new ApiResponse(
        201,
        {
          razorpayOrderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          key: env.RAZORPAY_KEY_ID,
          orderNumber: order.orderNumber,
          orderId: order._id,
        },
        "Razorpay order created"
      )
    );
  }
);

// ─── POST /api/v1/orders/razorpay/verify ─────────────────────────────────────

export const verifyRazorpayPayment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body as {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      };

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) throw new ApiError(404, "Order not found");

    // Verify only if currently pending — prevents duplicate processing
    if (order.paymentStatus !== "pending")
      throw new ApiError(400, `Payment already ${order.paymentStatus}`);

    // HMAC SHA256 verification
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      order.paymentStatus = "failed";
      order.statusHistory.push({
        status: "failed",
        note: "Razorpay signature verification failed",
        timestamp: new Date(),
      });
      await order.save();
      throw new ApiError(400, "Payment signature is invalid");
    }

    // Payment verified — update order
    order.paymentStatus = "paid";
    order.status = "confirmed";
    order.razorpayPaymentId = razorpay_payment_id;
    order.statusHistory.push({
      status: "confirmed",
      note: "Payment verified via Razorpay",
      timestamp: new Date(),
    });
    await order.save();

    // Decrement stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }

    // Increment coupon usage
    if (order.couponCode) {
      await Coupon.findOneAndUpdate(
        { code: order.couponCode },
        { $inc: { usedCount: 1 } }
      );
    }

    // Clear cart
    await Cart.findOneAndUpdate(
      { user: order.user },
      { $set: { items: [], couponApplied: undefined } }
    );

    // Fire-and-forget — email.ts catches and logs failures internally
    const user = await User.findById(order.user).select("name email");
    if (user) void sendOrderConfirmationEmail(order, user);

    const { pointsEarned, newPointsBalance } = await applyRewardsAndGift(
      order,
      order.user as Types.ObjectId
    );

    res.status(200).json(
      new ApiResponse(
        200,
        { order, pointsEarned, newPointsBalance },
        "Payment verified successfully"
      )
    );
  }
);

// ─── GET /api/v1/orders ───────────────────────────────────────────────────────

export const getUserOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { user: userId };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-statusHistory"),
      Order.countDocuments(filter),
    ]);

    res.status(200).json(
      new ApiResponse(200, { orders, pagination: paginate(page, limit, total) }, "Orders fetched")
    );
  }
);

// ─── GET /api/v1/orders/:orderNumber ─────────────────────────────────────────

export const getOrderByNumber = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { orderNumber } = req.params;
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new ApiError(404, "Order not found");

    if (order.user.toString() !== req.user!._id.toString())
      throw new ApiError(403, "You do not have access to this order");

    res.status(200).json(new ApiResponse(200, order, "Order fetched"));
  }
);

// ─── GET /api/v1/admin/orders/:id ────────────────────────────────────────────

export const getOrderById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params
    const order = await Order.findById(id).populate("user", "name email phone")
    if (!order) throw new ApiError(404, "Order not found")
    res.status(200).json(new ApiResponse(200, { order }, "Order fetched"))
  }
)

// ─── GET /api/v1/admin/orders ─────────────────────────────────────────────────

export const getAllOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      status,
      paymentStatus,
      paymentMethod,
      dateFrom,
      dateTo,
      search,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter: FilterQuery<IOrder> = {};

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      const matchedUsers = await User.find({
        email: { $regex: search, $options: "i" },
      }).select("_id");
      const userIds = matchedUsers.map((u) => u._id);

      filter.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { user: { $in: userIds } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("user", "name email phone"),
      Order.countDocuments(filter),
    ]);

    res.status(200).json(
      new ApiResponse(
        200,
        { orders, pagination: paginate(pageNum, limitNum, total) },
        "Orders fetched"
      )
    );
  }
);

// ─── PATCH /api/v1/admin/orders/:id/status ────────────────────────────────────

export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { status, note, trackingNumber } = req.body as {
      status: string;
      note?: string;
      trackingNumber?: string;
    };

    const validStatuses = [
      "placed",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ];

    if (!status) throw new ApiError(400, "status is required");
    if (!validStatuses.includes(status))
      throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);

    if (status === "shipped" && !trackingNumber)
      throw new ApiError(400, "trackingNumber is required when status is 'shipped'");

    const order = await Order.findById(id);
    if (!order) throw new ApiError(404, "Order not found");

    order.status = status as IOrder["status"];
    order.statusHistory.push({
      status,
      note: note || "",
      timestamp: new Date(),
    });

    if (trackingNumber) order.trackingNumber = trackingNumber;

    await order.save();

    res.status(200).json(new ApiResponse(200, order, "Order status updated"));
  }
);
