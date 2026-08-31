import { Router, json, type Request } from "express";
import {
  createShipment,
  trackShipmentHandler,
  cancelShipmentHandler,
  downloadLabelHandler,
  generateInvoiceHandler,
  handleShiprocketWebhook,
  handleAftershipWebhook,
} from "../controllers/shipping.controller";
import { handleRazorpayWebhook } from "../controllers/order.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createShipmentSchema } from "../validations/shipping.validation";

// ─── Webhook routes — mounted at /api/v1/webhooks (before rate limiter) ──────

export const webhookRouter = Router();

webhookRouter.post("/shiprocket", json(), handleShiprocketWebhook);

webhookRouter.post(
  "/aftership",
  json({
    verify: (req: Request, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  handleAftershipWebhook
);

webhookRouter.post(
  "/razorpay",
  json({
    verify: (req: Request, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  handleRazorpayWebhook
);

// ─── Admin shipping routes — mounted at /api/v1/admin/orders ─────────────────

export const adminShippingRouter = Router({ mergeParams: true });

adminShippingRouter.use(verifyJWT, verifyAdmin);

adminShippingRouter.post("/:id/shipments", validate(createShipmentSchema), createShipment);
adminShippingRouter.get("/:id/shipments/track", trackShipmentHandler);
adminShippingRouter.post("/:id/shipments/cancel", cancelShipmentHandler);
adminShippingRouter.post("/:id/shipments/label", downloadLabelHandler);
adminShippingRouter.post("/:id/shipments/invoice", generateInvoiceHandler);
