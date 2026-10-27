import { Router } from "express";
import {
  createRazorpayOrder,
  getShippingQuote,
  verifyRazorpayPayment,
  failRazorpayPayment,
  getUserOrders,
  getOrderByNumber,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/order.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createOrderSchema,
  shippingQuoteSchema,
  razorpayVerifySchema,
  razorpayFailureSchema,
  updateOrderStatusSchema,
} from "../validations/order.validation";

// ─── User order routes — mounted at /api/v1/orders ───────────────────────────

export const orderRouter = Router();

orderRouter.use(verifyJWT);

orderRouter.post("/razorpay/create", validate(createOrderSchema), createRazorpayOrder);
orderRouter.post("/shipping-quote", validate(shippingQuoteSchema), getShippingQuote);
orderRouter.post("/razorpay/verify", validate(razorpayVerifySchema), verifyRazorpayPayment);
orderRouter.post("/razorpay/fail", validate(razorpayFailureSchema), failRazorpayPayment);
orderRouter.get("/", getUserOrders);
orderRouter.get("/:orderNumber", getOrderByNumber);

// ─── Admin order routes — mounted at /api/v1/admin/orders ────────────────────

export const adminOrderRouter = Router();

adminOrderRouter.use(verifyJWT, verifyAdmin);

adminOrderRouter.get("/", getAllOrders);
adminOrderRouter.get("/:id", getOrderById);
adminOrderRouter.patch("/:id/status", validate(updateOrderStatusSchema), updateOrderStatus);
