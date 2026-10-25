import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Order } from "../models/order.model";
import { PaymentAttempt, IPaymentAttempt } from "../models/paymentAttempt.model";
import { Cart } from "../models/cart.model";
import { Product } from "../models/product.model";
import { User } from "../models/user.model";
import { Coupon, ICoupon } from "../models/coupon.model";
import { Reward } from "../models/reward.model";
import { Settings } from "../models/settings.model";
import { calculatePoints, MIN_REDEMPTION_POINTS } from "../utils/rewardUtils";
import { env } from "../config/env";
import { paginate } from "../utils/pagination";
import { sendOrderConfirmationEmail } from "../utils/email";
import { FilterQuery, Types } from "mongoose";
import { IOrder, ORDER_VISIBILITY_FILTER } from "../models/order.model";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_CHARGE = 149;

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

async function reserveRewardPoints(
  userId: Types.ObjectId,
  requestedPoints: number,
  total: number
): Promise<number> {
  if (!Number.isSafeInteger(requestedPoints) || requestedPoints < 0)
    throw new ApiError(400, "Redeemed points must be a non-negative whole number");
  if (requestedPoints > 0 && requestedPoints < MIN_REDEMPTION_POINTS)
    throw new ApiError(400, `At least ${MIN_REDEMPTION_POINTS} points are required to redeem`);

  const maxRedeemablePoints = Math.floor(total * 10 + 1e-8);
  if (requestedPoints > maxRedeemablePoints)
    throw new ApiError(400, "Redeemed points exceed the order total");
  if (requestedPoints === 0) return 0;

  const user = await User.findOneAndUpdate(
    { _id: userId, rewardPoints: { $gte: requestedPoints } },
    { $inc: { rewardPoints: -requestedPoints } },
    { new: true }
  );
  if (!user) throw new ApiError(400, "Insufficient reward points");

  return Math.round(requestedPoints * 10) / 100;
}

async function releaseAttemptPoints(attemptId: Types.ObjectId): Promise<void> {
  const failedAttempt = await PaymentAttempt.findOneAndUpdate(
    { _id: attemptId, status: "pending" },
    { $set: { status: "failed" } },
    { new: true }
  );
  if (failedAttempt && failedAttempt.pointsRedeemed > 0) {
    await User.findByIdAndUpdate(failedAttempt.user, {
      $inc: { rewardPoints: failedAttempt.pointsRedeemed },
    });
  }
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
    if (product.price == null)
      throw new ApiError(
        400,
        `"${product.name}" is available by inquiry and cannot be checked out`
      );
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
  if (order.pointsRedeemed > 0) {
    await Reward.create({
      user: userId,
      order: order._id,
      pointsEarned: order.pointsRedeemed,
      orderTotal: order.total,
      type: "redeemed",
    });
  }
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

// ─── Shared: mark a Razorpay order paid + run all post-payment side effects ───
// Used by both the client-driven /razorpay/verify endpoint and the
// payment.captured webhook, so a payment confirmed either way is processed
// exactly once (guarded by the paymentStatus !== "paid" check at each call site).

async function finalizePaidOrder(
  order: IOrder,
  razorpayPaymentId: string,
  note: string
): Promise<{ order: IOrder; pointsEarned: number; newPointsBalance: number }> {
  const paidOrder = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ["pending", "failed"] } },
    {
      $set: {
        paymentStatus: "paid",
        status: "confirmed",
        razorpayPaymentId,
      },
      $push: {
        statusHistory: { status: "confirmed", note, timestamp: new Date() },
      },
    },
    { new: true }
  );

  if (!paidOrder) {
    const currentOrder = await Order.findById(order._id);
    if (!currentOrder || currentOrder.paymentStatus !== "paid")
      throw new ApiError(409, "Order payment is already being processed");

    const currentUser = await User.findById(currentOrder.user).select("rewardPoints");
    return {
      order: currentOrder,
      pointsEarned: currentOrder.pointsEarned,
      newPointsBalance: currentUser?.rewardPoints ?? 0,
    };
  }

  // Decrement stock
  for (const item of paidOrder.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity },
    });
  }

  // Increment coupon usage
  if (paidOrder.couponCode) {
    await Coupon.findOneAndUpdate(
      { code: paidOrder.couponCode },
      { $inc: { usedCount: 1 } }
    );
  }

  // Clear cart
  await Cart.findOneAndUpdate(
    { user: paidOrder.user },
    { $set: { items: [], couponApplied: undefined } }
  );

  // Fire-and-forget — email.ts catches and logs failures internally
  const user = await User.findById(paidOrder.user).select("name email");
  if (user) void sendOrderConfirmationEmail(paidOrder, user);

  return {
    order: paidOrder,
    ...(await applyRewardsAndGift(paidOrder, paidOrder.user as Types.ObjectId)),
  };
}

async function completeRazorpayAttempt(
  attempt: IPaymentAttempt,
  razorpayPaymentId: string,
  note: string
): Promise<{ order: IOrder; pointsEarned: number; newPointsBalance: number }> {
  let order = await Order.findOne({ razorpayOrderId: attempt.razorpayOrderId });

  if (!order) {
    const orderNumber = await generateOrderNumber();
    order = await Order.create({
      orderNumber,
      user: attempt.user,
      items: attempt.items,
      shippingAddress: attempt.shippingAddress,
      subtotal: attempt.subtotal,
      discount: attempt.discount,
      couponCode: attempt.couponCode,
      shippingCharge: attempt.shippingCharge,
      tax: attempt.tax,
      total: attempt.total,
      pointsRedeemed: attempt.pointsRedeemed,
      pointsDiscount: attempt.pointsDiscount,
      paymentMethod: "razorpay",
      paymentStatus: "pending",
      razorpayOrderId: attempt.razorpayOrderId,
      status: "placed",
      statusHistory: [
        { status: "placed", note: "Razorpay payment captured", timestamp: new Date() },
      ],
      notes: attempt.notes,
    });
  }

  const finalized = await finalizePaidOrder(order, razorpayPaymentId, note);

  attempt.status = "paid";
  attempt.razorpayPaymentId = razorpayPaymentId;
  await attempt.save();

  return finalized;
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

// ─── POST /api/v1/orders/razorpay/create ─────────────────────────────────────

export const createRazorpayOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id as Types.ObjectId;
    const { addressId, couponCode, notes, redeemPoints = 0 } = req.body as {
      addressId: string;
      couponCode?: string;
      notes?: string;
      redeemPoints?: number;
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

    const shippingCharge =
      subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_CHARGE;
    const tax = 0;
    const orderTotal = subtotal - discount + shippingCharge + tax;
    const rzp = getRazorpay();
    const pointsDiscount = await reserveRewardPoints(userId, redeemPoints, orderTotal);
    const total = orderTotal - pointsDiscount;

    let rzpOrder: { id: string; amount: number; currency: string };
    try {
      rzpOrder = (await rzp.orders.create({
        amount: Math.round(total * 100), // paise
        currency: "INR",
        receipt: `checkout_${new Types.ObjectId().toString()}`,
      })) as { id: string; amount: number; currency: string };

      await PaymentAttempt.create({
        razorpayOrderId: rzpOrder.id,
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
        pointsRedeemed: redeemPoints,
        pointsDiscount,
        status: "pending",
        notes,
      });
    } catch (error) {
      if (redeemPoints > 0) {
        await User.findByIdAndUpdate(userId, { $inc: { rewardPoints: redeemPoints } });
      }
      throw error;
    }

    res.status(201).json(
      new ApiResponse(
        201,
        {
          razorpayOrderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          key: env.RAZORPAY_KEY_ID,
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

    const order = await Order.findOne({
      razorpayOrderId: razorpay_order_id,
      user: req.user!._id,
    });
    const attempt = await PaymentAttempt.findOne({
      razorpayOrderId: razorpay_order_id,
      user: req.user!._id,
    });
    if (!order && !attempt) throw new ApiError(404, "Order not found");

    // Verify only if currently pending — prevents duplicate processing
    if (order && order.paymentStatus !== "pending")
      throw new ApiError(400, `Payment already ${order.paymentStatus}`);
    if (attempt && attempt.status === "paid")
      throw new ApiError(400, "Payment already paid");

    // HMAC SHA256 verification
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      if (order) {
        order.paymentStatus = "failed";
        order.status = "cancelled";
        order.statusHistory.push({
          status: "cancelled",
          note: "Razorpay signature verification failed",
          timestamp: new Date(),
        });
        await order.save();
      }
      if (attempt) {
        await releaseAttemptPoints(attempt._id as Types.ObjectId);
      }
      throw new ApiError(400, "Payment signature is invalid");
    }

    // Payment verified — update order and run post-payment side effects
    let result: {
      order: IOrder;
      pointsEarned: number;
      newPointsBalance: number;
    };
    if (attempt) {
      result = await completeRazorpayAttempt(
        attempt,
        razorpay_payment_id,
        "Payment verified via Razorpay"
      );
    } else if (order) {
      result = await finalizePaidOrder(
        order,
        razorpay_payment_id,
        "Payment verified via Razorpay"
      );
    } else {
      throw new ApiError(404, "Payment attempt not found");
    }

    res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Payment verified successfully"
      )
    );
  }
);

// ─── POST /api/v1/orders/razorpay/fail ────────────────────────────────────────

export const failRazorpayPayment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { razorpay_order_id } = req.body as { razorpay_order_id: string };
    const legacyOrder = await Order.findOne({
      razorpayOrderId: razorpay_order_id,
      user: req.user!._id,
    });
    const attempt = await PaymentAttempt.findOne({
      razorpayOrderId: razorpay_order_id,
      user: req.user!._id,
    });

    if (!legacyOrder && !attempt) throw new ApiError(404, "Payment attempt not found");

    if (legacyOrder?.paymentStatus === "pending") {
      legacyOrder.paymentStatus = "failed";
      legacyOrder.status = "cancelled";
      legacyOrder.statusHistory.push({
        status: "cancelled",
        note: "Razorpay payment failed or was cancelled",
        timestamp: new Date(),
      });
      await legacyOrder.save();
    }
    if (attempt?.status === "pending") {
      await releaseAttemptPoints(attempt._id as Types.ObjectId);
    }

    res.status(200).json(
      new ApiResponse(200, null, "Payment failure recorded")
    );
  }
);

// ─── POST /api/v1/webhooks/razorpay ───────────────────────────────────────────
// Reconciles orders whose payment succeeds on Razorpay's side but never reach
// /razorpay/verify (browser closed mid-checkout, network drop, etc). Always
// acks with 200 once the signature check has run — including on bad
// signatures or unhandled event types — so Razorpay doesn't retry-storm us;
// the ack is not proof of processing, just proof of receipt.

export const handleRazorpayWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      console.warn("[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not configured — ignoring webhook");
      res.status(200).json({ success: true });
      return;
    }

    const signature = req.header("x-razorpay-signature");
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));

    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (!signature || signature !== expectedSignature) {
      console.warn("[Razorpay Webhook] Invalid signature");
      res.status(200).json({ success: true });
      return;
    }

    const event = req.body?.event as string | undefined;

    if (event === "payment.captured") {
      const payment = req.body?.payload?.payment?.entity as
        | { id?: string; order_id?: string }
        | undefined;

      if (payment?.order_id && payment?.id) {
        const order = await Order.findOne({ razorpayOrderId: payment.order_id });

        // Skip if already paid — either the client already verified it, or
        // an earlier delivery of this same webhook already processed it.
        if (order) {
          if (!["paid", "refunded"].includes(order.paymentStatus)) {
            await finalizePaidOrder(
              order,
              payment.id,
              "Payment confirmed via Razorpay webhook (payment.captured)"
            );
          }

          const attempt = await PaymentAttempt.findOne({
            razorpayOrderId: payment.order_id,
          });
          if (attempt && order.paymentStatus !== "refunded" && attempt.status !== "paid") {
            attempt.status = "paid";
            attempt.razorpayPaymentId = payment.id;
            await attempt.save();
          }
        } else {
          const attempt = await PaymentAttempt.findOne({
            razorpayOrderId: payment.order_id,
          });
          if (attempt) {
            await completeRazorpayAttempt(
              attempt,
              payment.id,
              "Payment confirmed via Razorpay webhook (payment.captured)"
            );
          }
        }
      }
    }
    if (event === "payment.failed") {
      const payment = req.body?.payload?.payment?.entity as
        | { order_id?: string }
        | undefined;
      if (payment?.order_id) {
        const attempt = await PaymentAttempt.findOne({
          razorpayOrderId: payment.order_id,
        });
        if (attempt) await releaseAttemptPoints(attempt._id as Types.ObjectId);
      }
    }

    res.status(200).json({ success: true });
  }
);

// ─── GET /api/v1/orders ───────────────────────────────────────────────────────

export const getUserOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { user: userId, ...ORDER_VISIBILITY_FILTER };
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

function toCustomerOrderResponse(order: IOrder) {
  const obj = order.toObject();
  const { shipmentId: _shipmentId, shippingMeta: _shippingMeta, ...safe } = obj;
  return safe;
}

export const getOrderByNumber = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { orderNumber } = req.params;
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new ApiError(404, "Order not found");

    if (order.user.toString() !== req.user!._id.toString())
      throw new ApiError(403, "You do not have access to this order");
    if (
      order.paymentMethod === "razorpay" &&
      !["paid", "refunded"].includes(order.paymentStatus)
    )
      throw new ApiError(404, "Order not found");

    res
      .status(200)
      .json(
        new ApiResponse(200, toCustomerOrderResponse(order), "Order fetched")
      );
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
    const clauses: FilterQuery<IOrder>[] = [];

    if (!paymentStatus) clauses.push(ORDER_VISIBILITY_FILTER);

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

      clauses.push({
        $or: [
          { orderNumber: { $regex: search, $options: "i" } },
          { user: { $in: userIds } },
        ],
      });
    }

    if (clauses.length) filter.$and = clauses;

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

    if (
      order.paymentMethod === "razorpay" &&
      !["paid", "refunded"].includes(order.paymentStatus) &&
      status !== "cancelled"
    )
      throw new ApiError(400, "An unpaid Razorpay order cannot be processed");

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
