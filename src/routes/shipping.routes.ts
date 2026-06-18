import { Router, json, type Request } from "express";
import {
  shipOrder,
  generateShippingLabel,
  trackOrder,
  syncTracking,
  cancelShipment,
  handleShiprocketWebhook,
  handleAftershipWebhook,
} from "../controllers/shipping.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

// ─── Webhook routes — mounted at /api/v1/webhooks (before rate limiter) ──────

export const webhookRouter = Router();

webhookRouter.post(
  "/shiprocket",
  json(),
  handleShiprocketWebhook
);

webhookRouter.post(
  "/aftership",
  json({
    verify: (req: Request, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  handleAftershipWebhook
);

// ─── Admin shipping routes — mounted at /api/v1/admin/orders ─────────────────

export const adminShippingRouter = Router({ mergeParams: true });

adminShippingRouter.use(verifyJWT, verifyAdmin);

adminShippingRouter.post("/:id/ship", shipOrder);
adminShippingRouter.post("/:id/generate-label", generateShippingLabel);
adminShippingRouter.get("/:id/track", trackOrder);
adminShippingRouter.post("/:id/sync-tracking", syncTracking);
adminShippingRouter.post("/:id/cancel-shipment", cancelShipment);
