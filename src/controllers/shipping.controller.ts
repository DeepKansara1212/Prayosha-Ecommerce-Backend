import { Request, Response } from "express";
import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Order, IOrder } from "../models/order.model";
import { User } from "../models/user.model";
import { env } from "../config/env";
import {
  createShiprocketOrder,
  generateLabel,
  trackShipment,
  cancelShiprocketOrder,
  mapShiprocketStatusToOrderStatus,
  isShiprocketConfigured,
} from "../utils/shiprocket";
import {
  getTracking,
  registerTrackingSafe,
  mapAftershipTagToOrderStatus,
  isAftershipConfigured,
} from "../utils/aftership";

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

async function registerAfterShipIfNeeded(order: IOrder): Promise<void> {
  const awb = order.awbCode || order.trackingNumber;
  if (!awb || order.aftershipTrackingId) return;

  const user = await User.findById(order.user).select("email phone");
  const result = await registerTrackingSafe({
    trackingNumber: awb,
    orderId: order.orderNumber,
    customerEmail: user?.email,
    customerPhone: user?.phone || order.shippingAddress.phone,
  });

  if (result) {
    order.aftershipTrackingId = result.trackingId;
  }
}

async function syncShiprocketTracking(order: IOrder): Promise<void> {
  if (!order.shiprocketShipmentId || !isShiprocketConfigured()) return;

  const tracking = await trackShipment(order.shiprocketShipmentId);

  if (tracking.awbCode) {
    order.awbCode = tracking.awbCode;
    order.trackingNumber = tracking.awbCode;
  }
  if (tracking.courierName) order.courierName = tracking.courierName;
  if (tracking.trackingUrl) order.trackingUrl = tracking.trackingUrl;
  order.shiprocketStatus = tracking.status;

  if (tracking.activities.length > 0) {
    order.trackingCheckpoints = tracking.activities.map((a) => ({
      time: parseCheckpointTime(a.date),
      message: a.activity,
      location: a.location,
    }));
  }

  const mappedStatus = mapShiprocketStatusToOrderStatus(tracking.status);
  if (mappedStatus && mappedStatus !== order.status) {
    order.status = mappedStatus;
    order.statusHistory.push({
      status: mappedStatus,
      note: `ShipRocket status: ${tracking.status}`,
      timestamp: new Date(),
    });
  }

  await registerAfterShipIfNeeded(order);
}

async function syncAftershipTracking(order: IOrder): Promise<void> {
  if (!order.aftershipTrackingId || !isAftershipConfigured()) return;

  const tracking = await getTracking(order.aftershipTrackingId);

  order.aftershipStatus = tracking.tag;
  if (tracking.trackingUrl) order.trackingUrl = tracking.trackingUrl;

  if (tracking.checkpoints.length > 0) {
    order.trackingCheckpoints = tracking.checkpoints.map((cp) => ({
      time: parseCheckpointTime(cp.time),
      message: cp.message,
      location: cp.location,
    }));
  }

  const mappedStatus = mapAftershipTagToOrderStatus(tracking.tag);
  if (mappedStatus && mappedStatus !== order.status) {
    order.status = mappedStatus;
    order.statusHistory.push({
      status: mappedStatus,
      note: `AfterShip status: ${tracking.tag}`,
      timestamp: new Date(),
    });
  }
}

// ─── POST /api/v1/admin/orders/:id/ship ──────────────────────────────────────

export const shipOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!isShiprocketConfigured()) {
      throw new ApiError(503, "Shipping service not configured");
    }

    const order = await Order.findById(req.params.id).populate(
      "user",
      "email"
    );
    if (!order) throw new ApiError(404, "Order not found");

    if (!["confirmed", "processing"].includes(order.status)) {
      throw new ApiError(
        400,
        "Order must be in confirmed or processing status to ship"
      );
    }

    if (order.shiprocketOrderId) {
      throw new ApiError(400, "Order has already been pushed to ShipRocket");
    }

    const { shiprocketOrderId, shiprocketShipmentId } =
      await createShiprocketOrder(order);

    order.shiprocketOrderId = shiprocketOrderId;
    order.shiprocketShipmentId = shiprocketShipmentId;
    order.status = "processing";
    order.statusHistory.push({
      status: "processing",
      note: "Order pushed to ShipRocket for fulfillment",
      timestamp: new Date(),
    });

    await order.save();

    res
      .status(200)
      .json(new ApiResponse(200, order, "Order pushed to ShipRocket"));
  }
);

// ─── POST /api/v1/admin/orders/:id/generate-label ────────────────────────────

export const generateShippingLabel = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!isShiprocketConfigured()) {
      throw new ApiError(503, "Shipping service not configured");
    }

    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    if (!order.shiprocketShipmentId) {
      throw new ApiError(400, "Order has not been pushed to ShipRocket yet");
    }

    const labelUrl = await generateLabel([order.shiprocketShipmentId]);
    order.labelUrl = labelUrl;
    await order.save();

    res
      .status(200)
      .json(new ApiResponse(200, { labelUrl }, "Shipping label generated"));
  }
);

// ─── GET /api/v1/admin/orders/:id/track ──────────────────────────────────────

export const trackOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    if (order.shiprocketShipmentId && isShiprocketConfigured()) {
      await syncShiprocketTracking(order);
      await order.save();
    }

    res.status(200).json(
      new ApiResponse(
        200,
        {
          awbCode: order.awbCode,
          courierName: order.courierName,
          shiprocketStatus: order.shiprocketStatus,
          aftershipStatus: order.aftershipStatus,
          trackingUrl: order.trackingUrl,
          labelUrl: order.labelUrl,
          trackingCheckpoints: order.trackingCheckpoints,
          status: order.status,
        },
        "Tracking info fetched"
      )
    );
  }
);

// ─── POST /api/v1/admin/orders/:id/sync-tracking ─────────────────────────────

export const syncTracking = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    if (order.shiprocketShipmentId && isShiprocketConfigured()) {
      await syncShiprocketTracking(order);
    }

    if (order.aftershipTrackingId && isAftershipConfigured()) {
      await syncAftershipTracking(order);
    } else if (order.awbCode || order.trackingNumber) {
      await registerAfterShipIfNeeded(order);
      if (order.aftershipTrackingId) {
        await syncAftershipTracking(order);
      }
    }

    await order.save();

    res
      .status(200)
      .json(new ApiResponse(200, order, "Tracking synced successfully"));
  }
);

// ─── POST /api/v1/admin/orders/:id/cancel-shipment ───────────────────────────

export const cancelShipment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!isShiprocketConfigured()) {
      throw new ApiError(503, "Shipping service not configured");
    }

    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    if (!order.shiprocketOrderId) {
      throw new ApiError(400, "Order has no ShipRocket shipment to cancel");
    }

    await cancelShiprocketOrder([order.shiprocketOrderId]);

    order.shiprocketOrderId = undefined;
    order.shiprocketShipmentId = undefined;
    order.awbCode = undefined;
    order.status = "cancelled";
    order.statusHistory.push({
      status: "cancelled",
      note: "ShipRocket shipment cancelled",
      timestamp: new Date(),
    });

    await order.save();

    res
      .status(200)
      .json(new ApiResponse(200, order, "Shipment cancelled"));
  }
);

// ─── POST /api/v1/webhooks/shiprocket ────────────────────────────────────────

export const handleShiprocketWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (env.SHIPROCKET_WEBHOOK_TOKEN) {
        const token = req.header("x-shiprocket-token");
        if (token !== env.SHIPROCKET_WEBHOOK_TOKEN) {
          console.warn("[ShipRocket Webhook] Invalid token");
          res.status(200).json({ success: true });
          return;
        }
      }

      const payload = req.body as Record<string, unknown>;
      const shiprocketOrderId = String(
        payload.order_id ?? payload.sr_order_id ?? ""
      );

      if (!shiprocketOrderId) {
        console.warn("[ShipRocket Webhook] Missing order_id in payload");
        res.status(200).json({ success: true });
        return;
      }

      const order = await Order.findOne({ shiprocketOrderId });
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

      if (awb) {
        order.awbCode = awb;
        order.trackingNumber = awb;
      }
      if (courierName) order.courierName = courierName;
      if (currentStatus) order.shiprocketStatus = currentStatus;

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
      if (mappedStatus) {
        if (mappedStatus !== order.status) {
          order.status = mappedStatus;
          order.statusHistory.push({
            status: mappedStatus,
            note: `ShipRocket webhook: ${currentStatus}`,
            timestamp: new Date(),
          });
        }
      }

      await registerAfterShipIfNeeded(order);
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
    try {
      if (isAftershipConfigured()) {
        const signature = req.header("aftership-hmac-sha256");
        const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));

        if (signature) {
          const expected = crypto
            .createHmac("sha256", env.AFTERSHIP_API_KEY!)
            .update(rawBody)
            .digest("base64");

          if (signature !== expected) {
            console.warn("[AfterShip Webhook] Invalid HMAC signature");
            res.status(200).json({ success: true });
            return;
          }
        }
      }

      const payload = req.body as {
        event?: string;
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

      let order =
        (msg.id
          ? await Order.findOne({ aftershipTrackingId: msg.id })
          : null) ||
        (msg.tracking_number
          ? await Order.findOne({
              $or: [
                { awbCode: msg.tracking_number },
                { trackingNumber: msg.tracking_number },
              ],
            })
          : null);

      if (!order) {
        console.warn("[AfterShip Webhook] Order not found for tracking update");
        res.status(200).json({ success: true });
        return;
      }

      if (msg.id) order.aftershipTrackingId = msg.id;
      if (msg.tag) order.aftershipStatus = msg.tag;

      const trackingUrl = msg.courier_tracking_link || msg.tracking_url;
      if (trackingUrl) order.trackingUrl = trackingUrl;

      if (Array.isArray(msg.checkpoints) && msg.checkpoints.length > 0) {
        order.trackingCheckpoints = msg.checkpoints.map((cp) => ({
          time: parseCheckpointTime(cp.checkpoint_time || ""),
          message: cp.message || "",
          location: cp.location || "",
        }));
      }

      const mappedStatus = msg.tag
        ? mapAftershipTagToOrderStatus(msg.tag)
        : null;
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
