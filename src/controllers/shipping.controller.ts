import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Order, IOrder } from "../models/order.model";
import { User } from "../models/user.model";
import { env } from "../config/env";
import { ShippingService } from "../services/shipping/ShippingService";
import { mapShiprocketStatusToOrderStatus } from "../services/shipping/providers/shiprocket.provider";
import { sendShipmentTrackingEmail } from "../utils/email";

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
    const {
      provider,
      carrierName,
      courierSlug,
      trackingNumber,
    } = req.body as {
      provider: string;
      carrierName?: string;
      courierSlug?: string;
      trackingNumber?: string;
    };
    const order = await loadOrder(req.params.id);

    const updated = await ShippingService.createShipment(
      order,
      provider,
      req.user?._id?.toString(),
      provider === "aftership" && carrierName && trackingNumber
        ? { carrierName, trackingNumber, courierSlug }
        : undefined,
    );

    if (provider === "aftership") {
      let trackingEmailSent = false;
      let trackingEmailError: string | undefined;
      try {
        const customer = await User.findById(updated.user);
        if (!customer?.email) {
          throw new Error("Customer email is unavailable");
        }
        await sendShipmentTrackingEmail(updated, customer);
        trackingEmailSent = true;
      } catch (error) {
        trackingEmailError =
          error instanceof Error ? error.message : "Tracking email delivery failed";
        console.error(
          `[AfterShip] Tracking notification failed for order ${updated._id}:`,
          error,
        );
      }

      if (trackingEmailSent) {
        updated.trackingEmailSentAt = new Date();
        try {
          await updated.save();
        } catch (error) {
          trackingEmailError = "Customer was notified, but the notification time could not be saved";
          console.error(
            `[AfterShip] Email was sent but its notification time could not be saved for order ${updated._id}:`,
            error,
          );
        }
      }

      res.status(200).json(
        new ApiResponse(
          200,
          {
            ...updated.toObject(),
            trackingEmailSent,
            ...(trackingEmailError ? { trackingEmailError } : {}),
          },
          trackingEmailSent
            ? "Tracking registered and customer notified"
            : "Tracking registered; customer notification failed",
        ),
      );
      return;
    }

    res
      .status(200)
      .json(new ApiResponse(200, updated, `Shipment created using ${provider}`));
  }
);

// ─── POST /api/v1/admin/orders/:id/shipments/tracking-email ─────────────────

export const resendTrackingEmailHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const order = await loadOrder(req.params.id);
    if (order.shippingProvider !== "aftership" || !order.trackingUrl) {
      throw new ApiError(400, "This order has no AfterShip tracking link to email");
    }

    const customer = await User.findById(order.user);
    if (!customer?.email) {
      throw new ApiError(400, "The customer does not have an email address");
    }

    await sendShipmentTrackingEmail(order, customer);
    order.trackingEmailSentAt = new Date();
    let trackingEmailStatusSaved = true;
    try {
      await order.save();
    } catch (error) {
      trackingEmailStatusSaved = false;
      console.error(
        `[AfterShip] Email was resent but its notification time could not be saved for order ${order._id}:`,
        error,
      );
    }

    res.status(200).json(
      new ApiResponse(
        200,
        { trackingEmailSent: true, trackingEmailStatusSaved, trackingEmailSentAt: order.trackingEmailSentAt },
        "Tracking email sent",
      ),
    );
  },
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
