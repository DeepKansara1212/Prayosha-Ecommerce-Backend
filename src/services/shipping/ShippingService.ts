import { ApiError } from "../../utils/ApiError";
import { IOrder } from "../../models/order.model";
import { ShippingProvider } from "../../models/shippingProvider.model";
import { ShippingFactory } from "./ShippingFactory";
import { StandardTrackingResult } from "./types";

type ShippingEvent =
  | "shipment_created"
  | "shipment_cancelled"
  | "shipment_failed"
  | "tracking_requested"
  | "label_requested"
  | "invoice_requested";

function logShippingEvent(event: ShippingEvent, params: {
  provider: string;
  orderId: string;
  adminUserId?: string;
  meta?: Record<string, unknown>;
}): void {
  console.log(
    JSON.stringify({
      event,
      provider: params.provider,
      orderId: params.orderId,
      adminUserId: params.adminUserId,
      timestamp: new Date().toISOString(),
      ...(params.meta ? { meta: params.meta } : {}),
    })
  );
}

async function touchLastSynced(slug: string): Promise<void> {
  await ShippingProvider.findOneAndUpdate({ slug }, { lastSyncedAt: new Date() });
}

export const ShippingService = {
  async createShipment(
    order: IOrder,
    providerSlug: string,
    adminUserId?: string
  ): Promise<IOrder> {
    if (order.shippingProvider) {
      throw new ApiError(400, "This order already has a shipment — cancel it first to re-create");
    }
    if (!["confirmed", "processing"].includes(order.status)) {
      throw new ApiError(400, "Order must be in confirmed or processing status to ship");
    }

    const provider = await ShippingFactory.getProvider(providerSlug);

    try {
      const result = await provider.createShipment(order);

      order.shippingProvider = providerSlug;
      order.shipmentId = result.shipmentId;
      order.awbNumber = result.trackingNumber;
      order.carrier = result.carrier;
      order.shippingStatus = result.status;
      order.labelUrl = result.labelUrl;
      order.invoiceUrl = result.invoiceUrl;
      order.shipmentCreatedAt = new Date();
      if (result.providerMeta) order.shippingMeta = result.providerMeta;
      order.status = "processing";
      order.statusHistory.push({
        status: "processing",
        note: `Shipment created via ${providerSlug}`,
        timestamp: new Date(),
      });

      await order.save();
      await touchLastSynced(providerSlug);
      logShippingEvent("shipment_created", {
        provider: providerSlug,
        orderId: order._id.toString(),
        adminUserId,
        meta: { shipmentId: result.shipmentId },
      });

      return order;
    } catch (err) {
      logShippingEvent("shipment_failed", {
        provider: providerSlug,
        orderId: order._id.toString(),
        adminUserId,
        meta: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  },

  async cancelShipment(order: IOrder, adminUserId?: string): Promise<IOrder> {
    if (!order.shippingProvider) {
      throw new ApiError(400, "This order has no shipment to cancel");
    }
    if (order.status === "delivered") {
      throw new ApiError(400, "Cannot cancel a shipment that has already been delivered");
    }

    const provider = await ShippingFactory.getProvider(order.shippingProvider);

    try {
      await provider.cancelShipment(order);
    } catch (err) {
      logShippingEvent("shipment_failed", {
        provider: order.shippingProvider,
        orderId: order._id.toString(),
        adminUserId,
        meta: { action: "cancel", error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }

    const providerSlug = order.shippingProvider;
    order.status = "cancelled";
    order.statusHistory.push({
      status: "cancelled",
      note: `Shipment cancelled via ${providerSlug}`,
      timestamp: new Date(),
    });
    order.shippingProvider = undefined;
    order.shipmentId = undefined;
    order.awbNumber = undefined;
    order.carrier = undefined;
    order.shippingStatus = undefined;
    order.shippingMeta = undefined;

    await order.save();
    logShippingEvent("shipment_cancelled", {
      provider: providerSlug,
      orderId: order._id.toString(),
      adminUserId,
    });

    return order;
  },

  async trackShipment(order: IOrder, adminUserId?: string): Promise<StandardTrackingResult> {
    if (!order.shippingProvider) {
      throw new ApiError(400, "This order has no shipment to track");
    }

    const provider = await ShippingFactory.getProvider(order.shippingProvider);
    const result = await provider.trackShipment(order);

    order.shippingStatus = result.status;
    if (result.trackingNumber) order.awbNumber = result.trackingNumber;
    if (result.carrier) order.carrier = result.carrier;
    if (result.trackingUrl) order.trackingUrl = result.trackingUrl;
    if (result.checkpoints.length > 0) {
      order.trackingCheckpoints = result.checkpoints.map((cp) => {
        const parsed = new Date(cp.time);
        return {
          time: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
          message: cp.message,
          location: cp.location,
        };
      });
    }
    await order.save();
    await touchLastSynced(order.shippingProvider);

    logShippingEvent("tracking_requested", {
      provider: order.shippingProvider,
      orderId: order._id.toString(),
      adminUserId,
    });

    return result;
  },

  async downloadLabel(order: IOrder, adminUserId?: string): Promise<{ labelUrl: string }> {
    if (!order.shippingProvider) {
      throw new ApiError(400, "This order has no shipment to generate a label for");
    }

    const provider = await ShippingFactory.getProvider(order.shippingProvider);
    const result = await provider.downloadLabel(order);

    order.labelUrl = result.labelUrl;
    await order.save();

    logShippingEvent("label_requested", {
      provider: order.shippingProvider,
      orderId: order._id.toString(),
      adminUserId,
    });

    return result;
  },

  async generateInvoice(order: IOrder, adminUserId?: string): Promise<{ invoiceUrl: string }> {
    if (!order.shippingProvider) {
      throw new ApiError(400, "This order has no shipment to generate an invoice for");
    }

    const provider = await ShippingFactory.getProvider(order.shippingProvider);
    const result = await provider.generateInvoice(order);

    order.invoiceUrl = result.invoiceUrl;
    await order.save();

    logShippingEvent("invoice_requested", {
      provider: order.shippingProvider,
      orderId: order._id.toString(),
      adminUserId,
    });

    return result;
  },
};
