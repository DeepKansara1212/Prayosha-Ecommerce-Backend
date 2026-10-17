import { Request, Response } from "express";
import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Order, IOrder } from "../models/order.model";
import { env } from "../config/env";
import { ShippingService } from "../services/shipping/ShippingService";
import { mapShiprocketStatusToOrderStatus } from "../services/shipping/providers/shiprocket.provider";
import { mapAftershipTagToOrderStatus } from "../services/shipping/providers/aftership.provider";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

function parseCheckpointTime(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function loadOrder(id: string): Promise<IOrder> {
  const order = await Order.findById(id).select("+shippingMeta");
  if (!order) throw new ApiError(404, "Order not found");
  return order;
}

// ─── POST /api/v1/admin/orders/:id/shipments ─────────────────────────────────

export const createShipment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { provider } = req.body as { provider: string };
    const order = await loadOrder(req.params.id);

    const updated = await ShippingService.createShipment(
      order,
      provider,
      req.user?._id?.toString()
    );

    res
      .status(200)
      .json(new ApiResponse(200, updated, `Shipment created using ${provider}`));
  }
);

// ─── GET /api/v1/admin/orders/:id/shipments/track ────────────────────────────

export const trackShipmentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const order = await loadOrder(req.params.id);
    const tracking = await ShippingService.trackShipment(order, req.user?._id?.toString());

    res.status(200).json(new ApiResponse(200, tracking, "Tracking info fetched"));
  }
);

// ─── POST /api/v1/admin/orders/:id/shipments/cancel ──────────────────────────

export const cancelShipmentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const order = await loadOrder(req.params.id);
    const updated = await ShippingService.cancelShipment(order, req.user?._id?.toString());

    res.status(200).json(new ApiResponse(200, updated, "Shipment cancelled"));
  }
);

// ─── POST /api/v1/admin/orders/:id/shipments/label ───────────────────────────

export const downloadLabelHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const order = await loadOrder(req.params.id);
    const result = await ShippingService.downloadLabel(order, req.user?._id?.toString());

    res.status(200).json(new ApiResponse(200, result, "Shipping label generated"));
  }
);

// ─── POST /api/v1/admin/orders/:id/shipments/invoice ─────────────────────────

export const generateInvoiceHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const order = await loadOrder(req.params.id);
    const result = await ShippingService.generateInvoice(order, req.user?._id?.toString());

    res.status(200).json(new ApiResponse(200, result, "Invoice generated"));
  }
);

// ─── POST /api/v1/webhooks/shiprocket ────────────────────────────────────────

export const handleShiprocketWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const providedToken = req.header("x-shiprocket-token");
    if (
      !env.SHIPROCKET_WEBHOOK_TOKEN ||
      !providedToken ||
      providedToken !== env.SHIPROCKET_WEBHOOK_TOKEN
    ) {
      console.warn(
        env.SHIPROCKET_WEBHOOK_TOKEN
          ? "[ShipRocket Webhook] Rejected: missing or invalid token"
          : "[ShipRocket Webhook] Rejected: webhook token is not configured"
      );
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    try {
      const payload = req.body as Record<string, unknown>;
      const shiprocketOrderId = String(
        payload.order_id ?? payload.sr_order_id ?? ""
      );

      if (!shiprocketOrderId) {
        console.warn("[ShipRocket Webhook] Missing order_id in payload");
        res.status(200).json({ success: true });
        return;
      }

      const order = await Order.findOne({
        shippingProvider: "shiprocket",
        "shippingMeta.shiprocketOrderId": shiprocketOrderId,
      }).select("+shippingMeta");

      if (!order) {
        console.warn(
          `[ShipRocket Webhook] Order not found for ID ${shiprocketOrderId}`
        );
        res.status(200).json({ success: true });
        return;
      }

      const currentStatus = String(
        payload.current_status ?? payload.shipment_status ?? ""
      );
      const awb = String(payload.awb ?? payload.awb_code ?? "");
      const courierName = String(payload.courier_name ?? "");

      if (awb) order.awbNumber = awb;
      if (courierName) order.carrier = courierName;
      if (currentStatus) order.shippingStatus = currentStatus;

      const scans = payload.scans as
        | Array<{ date?: string; activity?: string; location?: string }>
        | undefined;
      if (Array.isArray(scans) && scans.length > 0) {
        order.trackingCheckpoints = scans.map((s) => ({
          time: parseCheckpointTime(s.date || ""),
          message: s.activity || "",
          location: s.location || "",
        }));
      }

      const mappedStatus = mapShiprocketStatusToOrderStatus(currentStatus);
      if (mappedStatus && mappedStatus !== order.status) {
        order.status = mappedStatus;
        order.statusHistory.push({
          status: mappedStatus,
          note: `ShipRocket webhook: ${currentStatus}`,
          timestamp: new Date(),
        });
      }

      await order.save();
    } catch (err) {
      console.error("[ShipRocket Webhook] Processing error:", err);
    }

    res.status(200).json({ success: true });
  }
);

// ─── POST /api/v1/webhooks/aftership ─────────────────────────────────────────

export const handleAftershipWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.header("aftership-hmac-sha256");
    if (!env.AFTERSHIP_WEBHOOK_SECRET || !signature) {
      console.warn(
        env.AFTERSHIP_WEBHOOK_SECRET
          ? "[AfterShip Webhook] Rejected: signature header is missing"
          : "[AfterShip Webhook] Rejected: webhook secret is not configured"
      );
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!req.rawBody) {
      console.warn("[AfterShip Webhook] Rejected: raw request body is unavailable");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const expected = crypto
      .createHmac("sha256", env.AFTERSHIP_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("base64");

    const providedSignature = Buffer.from(signature);
    const expectedSignature = Buffer.from(expected);
    if (
      providedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(providedSignature, expectedSignature)
    ) {
      console.warn("[AfterShip Webhook] Rejected: invalid HMAC signature");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    try {
      const payload = req.body as {
        msg?: {
          id?: string;
          tracking_number?: string;
          tag?: string;
          checkpoints?: Array<{
            checkpoint_time?: string;
            message?: string;
            location?: string;
          }>;
          courier_tracking_link?: string;
          tracking_url?: string;
        };
      };

      const msg = payload.msg;
      if (!msg) {
        res.status(200).json({ success: true });
        return;
      }

      const order =
        (msg.tracking_number
          ? await Order.findOne({
              $or: [
                { awbNumber: msg.tracking_number },
                { trackingNumber: msg.tracking_number },
              ],
            })
          : null) ||
        (msg.id
          ? await Order.findOne({ shippingProvider: "aftership", shipmentId: msg.id })
          : null);

      if (!order) {
        console.warn("[AfterShip Webhook] Order not found for tracking update");
        res.status(200).json({ success: true });
        return;
      }

      if (msg.tag) order.shippingStatus = msg.tag;

      const trackingUrl = msg.courier_tracking_link || msg.tracking_url;
      if (trackingUrl) order.trackingUrl = trackingUrl;

      if (Array.isArray(msg.checkpoints) && msg.checkpoints.length > 0) {
        order.trackingCheckpoints = msg.checkpoints.map((cp) => ({
          time: parseCheckpointTime(cp.checkpoint_time || ""),
          message: cp.message || "",
          location: cp.location || "",
        }));
      }

      const mappedStatus = msg.tag ? mapAftershipTagToOrderStatus(msg.tag) : null;
      if (mappedStatus && mappedStatus !== order.status) {
        order.status = mappedStatus;
        order.statusHistory.push({
          status: mappedStatus,
          note: `AfterShip webhook: ${msg.tag}`,
          timestamp: new Date(),
        });
      }

      await order.save();
    } catch (err) {
      console.error("[AfterShip Webhook] Processing error:", err);
    }

    res.status(200).json({ success: true });
  }
);
