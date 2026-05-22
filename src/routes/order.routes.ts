import { Router } from "express";
import {
  createOrderCOD,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getUserOrders,
  getOrderByNumber,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/order.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

// ─── User order routes — mounted at /api/v1/orders ───────────────────────────

export const orderRouter = Router();

orderRouter.use(verifyJWT);

orderRouter.post("/cod", createOrderCOD);
orderRouter.post("/razorpay/create", createRazorpayOrder);
orderRouter.post("/razorpay/verify", verifyRazorpayPayment);
orderRouter.get("/", getUserOrders);
orderRouter.get("/:orderNumber", getOrderByNumber);

// ─── Admin order routes — mounted at /api/v1/admin/orders ────────────────────

export const adminOrderRouter = Router();

adminOrderRouter.use(verifyJWT, verifyAdmin);

adminOrderRouter.get("/", getAllOrders);
adminOrderRouter.get("/:id", getOrderById);
adminOrderRouter.patch("/:id/status", updateOrderStatus);
