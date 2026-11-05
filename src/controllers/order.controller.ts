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
import { WalletTransaction } from "../models/walletTransaction.model";
import { Settings } from "../models/settings.model";
import {
  calculateCashback,
  calculateCashbackRedemption,
} from "../utils/cashbackUtils";
import { env } from "../config/env";
import { paginate } from "../utils/pagination";
import { sendOrderConfirmationEmail } from "../utils/email";
import { FilterQuery, Types } from "mongoose";
import { IOrder, ORDER_VISIBILITY_FILTER } from "../models/order.model";
import { ShippingFactory } from "../services/shipping/ShippingFactory";
import {
  getCancellationRefundReceipt,
  getFullRefundAmountInPaise,
  getRefundFailureDetails,
  isCancellationRefundReceipt,
} from "../utils/razorpayRefund";

const REFUND_REQUEST_STALE_AFTER_MS = 2 * 60 * 1000;

interface CancellationRefundOutcome {
  status: "initiating" | "pending" | "processed" | "failed";
  refundId?: string;
  failureReason?: string;
}

function logRefundFailure(
  order: IOrder,
  details: ReturnType<typeof getRefundFailureDetails>,
  outcome: CancellationRefundOutcome["status"],
): void {
  console.error(
    JSON.stringify({
      event: "razorpay_refund_error",
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      paymentId: order.razorpayPaymentId,
      statusCode: details.statusCode,
      code: details.code,
      reason: details.reason,
      outcome,
      timestamp: new Date().toISOString(),
    }),
  );
}

async function requestCancellationRefund(
  order: IOrder,
): Promise<CancellationRefundOutcome> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - REFUND_REQUEST_STALE_AFTER_MS);
  const nextAttempt = (order.refundAttempt || 0) + 1;
  const receipt = getCancellationRefundReceipt(order._id.toString(), nextAttempt);

  if (
    ["initiating", "pending"].includes(order.refundStatus ?? "") &&
    order.refundStartedAt &&
    order.refundStartedAt > staleBefore
  ) {
    return {
      status: order.refundStatus as "initiating" | "pending",
      failureReason:
        order.refundFailureReason ||
        "Refund request is still being processed. Check Razorpay before retrying.",
    };
  }

  const reservation = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: "paid",
      $or: [
        { refundStatus: { $exists: false } },
        { refundStatus: "failed" },
        {
          refundStatus: { $in: ["initiating", "pending"] },
          $or: [
            { refundStartedAt: { $exists: false } },
            { refundStartedAt: { $lte: staleBefore } },
          ],
        },
      ],
    },
    {
      $set: {
        refundStatus: "initiating",
        refundStartedAt: now,
        razorpayRefundReceipt: receipt,
      },
      $inc: { refundAttempt: 1 },
      $unset: { refundFailureReason: "", razorpayRefundId: "" },
    },
    { new: true },
  ).select("+refundFailureReason +refundStartedAt +refundAttempt +razorpayRefundReceipt");

  if (!reservation) {
    const latestOrder = await Order.findById(order._id)
      .select("+refundFailureReason +refundStartedAt");
    if (!latestOrder) throw new ApiError(404, "Order not found");
    if (
      latestOrder.refundStatus === "processed" ||
      latestOrder.refundStatus === "pending" ||
      latestOrder.refundStatus === "initiating"
    ) {
      return {
        status: latestOrder.refundStatus,
        refundId: latestOrder.razorpayRefundId,
        failureReason: latestOrder.refundFailureReason,
      };
    }
    throw new ApiError(409, "Refund is already being processed. Refresh the order and try again.");
  }

  let outcome: CancellationRefundOutcome;
  try {
    const razorpay = getRazorpay();
    const [payment, refundList] = await Promise.all([
      razorpay.payments.fetch(order.razorpayPaymentId!),
      razorpay.payments.fetchMultipleRefund(order.razorpayPaymentId!, { count: 100 }),
    ]);

    const refunds = refundList.items ?? [];
    const cancellationRefunds = refunds.filter((refund) =>
      isCancellationRefundReceipt(order._id.toString(), refund.receipt),
    );
    const matchingRefund = [...cancellationRefunds]
      .reverse()
      .find((refund) => refund.status === "pending" || refund.status === "processed");
    if (matchingRefund?.status === "pending") {
      outcome = {
        status: "pending",
        refundId: matchingRefund.id,
        failureReason: "Razorpay has accepted this refund and is still processing it.",
      };
    } else if (matchingRefund?.status === "processed") {
      outcome = { status: "processed", refundId: matchingRefund.id };
    } else {
      const targetAmount = getFullRefundAmountInPaise(order.total);
      const paymentAmount = Number(payment.amount);
      const refundedAmount = Math.max(
        payment.status === "refunded" ? paymentAmount : 0,
        Number(payment.amount_refunded ?? 0),
        refunds
          .filter((refund) => refund.status === "processed")
          .reduce((sum, refund) => sum + Number(refund.amount ?? 0), 0),
      );

      if (!Number.isFinite(paymentAmount) || !Number.isFinite(refundedAmount)) {
        throw new ApiError(502, "Razorpay returned invalid payment/refund amounts.");
      }

      if (refundedAmount >= targetAmount) {
        const latestProcessedRefund = [...refunds]
          .reverse()
          .find((refund) => refund.status === "processed");
        outcome = {
          status: "processed",
          refundId: matchingRefund?.id || latestProcessedRefund?.id,
        };
      } else {
        const pendingRefund = refunds.find((refund) => refund.status === "pending");
        if (pendingRefund) {
          outcome = {
            status: "pending",
            refundId: pendingRefund.id,
            failureReason:
              "Another refund for this payment is still processing. Verify it in Razorpay before retrying.",
          };
        } else if (!payment.captured || !["captured", "refunded"].includes(payment.status)) {
          throw new ApiError(
            409,
            `Razorpay payment is not captured (current status: ${payment.status}).`,
          );
        } else if (payment.currency !== "INR") {
          throw new ApiError(
            409,
            `Cannot automatically refund a ${payment.currency} payment using this INR order.`,
          );
        } else if (paymentAmount < targetAmount) {
          throw new ApiError(
            409,
            "The Razorpay payment amount is less than the order total. Reconcile the payment before refunding.",
          );
        } else {
          const amount = Math.min(targetAmount - refundedAmount, paymentAmount - refundedAmount);
          if (amount <= 0) {
            throw new ApiError(
              409,
              "No refundable balance remains for this order. Check the existing refunds in Razorpay.",
            );
          }
          const refund = await razorpay.payments.refund(
            order.razorpayPaymentId!,
            {
              amount,
              receipt,
              notes: { orderNumber: order.orderNumber },
            },
          );
          outcome = {
            status: refund.status,
            refundId: refund.id,
            ...(refund.status === "failed"
              ? { failureReason: "Razorpay marked the refund as failed. Check the payment in Razorpay." }
              : {}),
          };
          if (refund.status === "failed") {
            logRefundFailure(
              order,
              getRefundFailureDetails(new Error(outcome.failureReason)),
              "failed",
            );
          }
        }
      }
    }
  } catch (error) {
    const details = getRefundFailureDetails(error);
    outcome = {
      status: details.definite ? "failed" : "pending",
      failureReason: details.definite
        ? details.reason
        : `Refund outcome is unconfirmed: ${details.reason}. Check Razorpay before retrying.`,
    };
    logRefundFailure(order, details, outcome.status);
  }

  const refundUpdate: Record<string, unknown> = {
    refundStatus: outcome.status,
    refundStartedAt: outcome.status === "pending" ? new Date() : null,
    ...(outcome.status === "processed" ? { paymentStatus: "refunded" } : {}),
    ...(outcome.refundId ? { razorpayRefundId: outcome.refundId } : {}),
    ...(outcome.failureReason
      ? { refundFailureReason: outcome.failureReason }
      : {}),
  };
  const savedOrder = await Order.findOneAndUpdate(
    { _id: order._id, refundStatus: "initiating" },
    {
      $set: refundUpdate,
      ...(!outcome.failureReason
        ? { $unset: { refundFailureReason: "" } }
        : {}),
    },
    { new: true },
  ).select("+refundFailureReason +refundStartedAt");

  if (savedOrder) {
    return {
      status: savedOrder.refundStatus || outcome.status,
      refundId: savedOrder.razorpayRefundId || outcome.refundId,
      failureReason: savedOrder.refundFailureReason,
    };
  }

  const latestOrder = await Order.findById(order._id)
    .select("+refundFailureReason +refundStartedAt");
  if (!latestOrder) throw new ApiError(404, "Order not found");
  return {
    status: latestOrder.refundStatus || outcome.status,
    refundId: latestOrder.razorpayRefundId || outcome.refundId,
    failureReason: latestOrder.refundFailureReason || outcome.failureReason,
  };
}

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

async function reserveCashback(
  userId: Types.ObjectId,
  eligibleSubtotal: number
): Promise<number> {
  const user = await User.findById(userId).select("cashbackBalance");
  if (!user) throw new ApiError(404, "User not found");

  const cashbackUsed = calculateCashbackRedemption(
    user.cashbackBalance,
    eligibleSubtotal
  );
  if (cashbackUsed === 0) return 0;

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, cashbackBalance: { $gte: cashbackUsed } },
    { $inc: { cashbackBalance: -cashbackUsed } },
    { new: true }
  );
  if (!updatedUser)
    throw new ApiError(409, "Wallet balance changed. Refresh checkout and try again.");

  return cashbackUsed;
}

async function releaseAttemptCashback(attemptId: Types.ObjectId): Promise<void> {
  const failedAttempt = await PaymentAttempt.findOneAndUpdate(
    { _id: attemptId, status: "pending" },
    { $set: { status: "failed" } },
    { new: true }
  );
  if (failedAttempt && failedAttempt.cashbackUsed > 0) {
    await User.findByIdAndUpdate(failedAttempt.user, {
      $inc: { cashbackBalance: failedAttempt.cashbackUsed },
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

async function calculateCheckoutShipping(
  items: Array<{
    product: Types.ObjectId;
    name: string;
    quantity: number;
  }>,
  deliveryPostcode: string,
  declaredValue: number,
): Promise<{ shippingCharge: number; shippingMeta?: Record<string, unknown> }> {
  const settings = await Settings.getSettings();
  if (settings.freeShippingEnabled) return { shippingCharge: 0 };

  const provider = await ShippingFactory.getProvider("shiprocket");
  if (!provider.calculateShippingRate) {
    throw new ApiError(503, "Shiprocket live rate calculation is not available");
  }

  const rate = await provider.calculateShippingRate(
    items,
    deliveryPostcode,
    "prepaid",
    declaredValue,
  );

  return {
    shippingCharge: rate.charge,
    shippingMeta: { quotedCourierCompanyId: rate.courierCompanyId },
  };
}

// ─── Shared: award cashback + determine free gift after successful order ──────

async function applyCashbackAndGift(
  order: IOrder,
  userId: Types.ObjectId
): Promise<{ cashbackEarned: number; cashbackBalance: number }> {
  const eligibleSpend = Math.max(
    0,
    order.subtotal - order.discount - order.cashbackUsed
  );
  const cashbackEarned = calculateCashback(eligibleSpend);

  if (order.cashbackUsed > 0) {
    await WalletTransaction.create({
      user: userId,
      order: order._id,
      cashbackAmount: order.cashbackUsed,
      orderTotal: order.total,
      type: "redeemed",
    });
  }
  if (cashbackEarned > 0) {
    await User.findByIdAndUpdate(userId, {
      $inc: { cashbackBalance: cashbackEarned },
    });
    await WalletTransaction.create({
      user: userId,
      order: order._id,
      cashbackAmount: cashbackEarned,
      orderTotal: order.total,
      type: "earned",
    });
  }
  order.cashbackEarned = cashbackEarned;

  const settings = await Settings.getSettings();
  if (settings.freeGiftEnabled) {
    order.hasFreeGift = true;
  } else {
    const productIds = order.items.map((item) => item.product);
    const gifted = await Product.find({ _id: { $in: productIds }, hasFreeGift: true });
    order.hasFreeGift = gifted.length > 0;
  }

  await order.save();

  const updatedUser = await User.findById(userId).select("cashbackBalance");
  return {
    cashbackEarned,
    cashbackBalance: updatedUser?.cashbackBalance ?? 0,
  };
}

// ─── Shared: mark a Razorpay order paid + run all post-payment side effects ───
// Used by both the client-driven /razorpay/verify endpoint and the
// payment.captured webhook, so a payment confirmed either way is processed
// exactly once (guarded by the paymentStatus !== "paid" check at each call site).

async function finalizePaidOrder(
  order: IOrder,
  razorpayPaymentId: string,
  note: string
): Promise<{ order: IOrder; cashbackEarned: number; cashbackBalance: number }> {
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

    const currentUser = await User.findById(currentOrder.user).select("cashbackBalance");
    return {
      order: currentOrder,
      cashbackEarned: currentOrder.cashbackEarned,
      cashbackBalance: currentUser?.cashbackBalance ?? 0,
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
    ...(await applyCashbackAndGift(paidOrder, paidOrder.user as Types.ObjectId)),
  };
}

async function completeRazorpayAttempt(
  attempt: IPaymentAttempt,
  razorpayPaymentId: string,
  note: string
): Promise<{ order: IOrder; cashbackEarned: number; cashbackBalance: number }> {
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
      shippingMeta: attempt.shippingMeta,
      tax: attempt.tax,
      total: attempt.total,
      cashbackUsed: attempt.cashbackUsed,
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

// ─── POST /api/v1/orders/shipping-quote ──────────────────────────────────────

export const getShippingQuote = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id as Types.ObjectId;
    const { addressId, couponCode } = req.body as {
      addressId: string;
      couponCode?: string;
    };
    const { address, orderItems, subtotal } = await buildOrderPayload(
      userId,
      addressId,
    );

    let discount = 0;
    if (couponCode) {
      discount = (await resolveCoupon(couponCode, subtotal)).discountAmount;
    }

    const shipping = await calculateCheckoutShipping(
      orderItems,
      address.pincode,
      Math.max(0, subtotal - discount),
    );

    res.status(200).json(
      new ApiResponse(
        200,
        { shippingCharge: shipping.shippingCharge },
        "Shipping rate calculated",
      ),
    );
  },
);

// ─── POST /api/v1/orders/razorpay/create ─────────────────────────────────────

export const createRazorpayOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id as Types.ObjectId;
    const {
      addressId,
      couponCode,
      notes,
      shippingCharge: quotedShippingCharge,
      useCashback = false,
    } = req.body as {
      addressId: string;
      couponCode?: string;
      notes?: string;
      shippingCharge?: number;
      useCashback?: boolean;
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

    const shipping = await calculateCheckoutShipping(
      orderItems,
      address.pincode,
      Math.max(0, subtotal - discount),
    );
    const shippingCharge = shipping.shippingCharge;
    if (
      quotedShippingCharge !== undefined &&
      Math.round(quotedShippingCharge * 100) !== Math.round(shippingCharge * 100)
    ) {
      throw new ApiError(
        409,
        "Shipping rate changed. Review the updated rate and try placing your order again.",
      );
    }
    const tax = 0;
    const eligibleSubtotal = Math.max(0, subtotal - discount);
    const orderTotal = eligibleSubtotal + shippingCharge + tax;
    const rzp = getRazorpay();
    const cashbackUsed = useCashback
      ? await reserveCashback(userId, eligibleSubtotal)
      : 0;
    const total = orderTotal - cashbackUsed;

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
        cashbackUsed,
        shippingMeta: shipping.shippingMeta,
        status: "pending",
        notes,
      });
    } catch (error) {
      if (cashbackUsed > 0) {
        await User.findByIdAndUpdate(userId, {
          $inc: { cashbackBalance: cashbackUsed },
        });
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
    }).select("+shippingMeta");
    if (!order && !attempt) throw new ApiError(404, "Order not found");

    // HMAC SHA256 verification
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      if (order?.paymentStatus === "pending") {
        order.paymentStatus = "failed";
        order.status = "cancelled";
        order.statusHistory.push({
          status: "cancelled",
          note: "Razorpay signature verification failed",
          timestamp: new Date(),
        });
        await order.save();
      }
      if (attempt?.status === "pending") {
        await releaseAttemptCashback(attempt._id as Types.ObjectId);
      }
      throw new ApiError(400, "Payment signature is invalid");
    }

    // Payment verified — update order and run post-payment side effects
    let result: {
      order: IOrder;
      cashbackEarned: number;
      cashbackBalance: number;
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
      await releaseAttemptCashback(attempt._id as Types.ObjectId);
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
          }).select("+shippingMeta");
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
        if (attempt) await releaseAttemptCashback(attempt._id as Types.ObjectId);
      }
    }
    if (event === "refund.processed" || event === "refund.failed") {
      const refund = req.body?.payload?.refund?.entity as
        | {
            id?: string;
            payment_id?: string;
            status?: string;
            receipt?: string;
            error_description?: string;
          }
        | undefined;

      if (refund?.payment_id && refund.id) {
        const order = await Order.findOne({
          razorpayPaymentId: refund.payment_id,
        }).select("+refundFailureReason +refundStartedAt +razorpayRefundReceipt");
        if (
          order &&
          (order.razorpayRefundId === refund.id ||
            refund.receipt === order.razorpayRefundReceipt ||
            (!order.razorpayRefundReceipt &&
              refund.receipt === getCancellationRefundReceipt(order._id.toString())))
        ) {
          const processed = event === "refund.processed";
          order.razorpayRefundId = refund.id;
          order.refundStatus = processed ? "processed" : "failed";
          if (processed) order.paymentStatus = "refunded";
          order.refundFailureReason = processed
            ? undefined
            : refund.error_description || "Razorpay reported that the refund failed.";
          order.refundStartedAt = undefined;
          await order.save();
        }
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
    const order = await Order.findById(id)
      .select("+refundFailureReason +refundStartedAt")
      .populate("user", "name email phone")
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

    const order = await Order.findById(id)
      .select("+refundFailureReason +refundStartedAt +refundAttempt +razorpayRefundReceipt");
    if (!order) throw new ApiError(404, "Order not found");

    if (status === "refunded" && order.paymentStatus !== "refunded")
      throw new ApiError(
        400,
        "An order can only be marked refunded after its payment is refunded"
      );

    if (
      order.paymentMethod === "razorpay" &&
      !["paid", "refunded"].includes(order.paymentStatus) &&
      status !== "cancelled"
    )
      throw new ApiError(400, "An unpaid Razorpay order cannot be processed");

    if (
      status === "cancelled" &&
      order.paymentMethod === "razorpay" &&
      ["paid", "refunded"].includes(order.paymentStatus)
    ) {
      if (order.paymentStatus === "paid" && !order.razorpayPaymentId) {
        throw new ApiError(409, "Paid order is missing its Razorpay payment ID");
      }

      let outcome: CancellationRefundOutcome = {
        status: order.refundStatus ?? "failed",
        refundId: order.razorpayRefundId,
        failureReason: order.refundFailureReason,
      };

      if (order.paymentStatus === "refunded") {
        outcome = { status: "processed", refundId: order.razorpayRefundId };
      } else if (order.refundStatus !== "processed") {
        outcome = await requestCancellationRefund(order);
      }

      const cancellationNote =
        note ||
        (outcome.status === "processed"
          ? "Admin cancelled order; Razorpay refund processed."
          : outcome.status === "failed"
            ? "Admin cancelled order; Razorpay refund failed. Check the payment details."
            : `Admin cancelled order; Razorpay refund ${outcome.status}.`);
      const update: Record<string, unknown> = {
        status: "cancelled",
        ...(trackingNumber ? { trackingNumber } : {}),
      };

      const cancelledOrder = await Order.findOneAndUpdate(
        { _id: order._id },
        {
          $set: update,
          $push: {
            statusHistory: {
              status: "cancelled",
              note: cancellationNote,
              timestamp: new Date(),
            },
          },
        },
        { new: true },
      ).select("+refundFailureReason +refundStartedAt");
      if (!cancelledOrder) throw new ApiError(404, "Order not found");

      const message =
        outcome.status === "processed"
          ? "Order cancelled and payment refunded"
          : outcome.status === "failed"
            ? "Order cancelled, but the refund failed. Review the Razorpay error and retry after correcting it."
            : outcome.status === "initiating"
              ? "Order cancelled; a refund request is already being processed. Check Razorpay before retrying."
              : "Order cancelled; the Razorpay refund is pending. Do not retry until its status is confirmed.";

      res.status(200).json(
        new ApiResponse(200, cancelledOrder, message),
      );
      return;
    }

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
