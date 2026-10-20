import { ApiError } from "../../utils/ApiError";
import { IOrder, Order } from "../../models/order.model";
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

function logShippingEvent(
  event: ShippingEvent,
  params: {
    provider: string;
    orderId: string;
    adminUserId?: string;
    meta?: Record<string, unknown>;
  },
): void {
  console.log(
    JSON.stringify({
      event,
      provider: params.provider,
      orderId: params.orderId,
      adminUserId: params.adminUserId,
      timestamp: new Date().toISOString(),
      ...(params.meta ? { meta: params.meta } : {}),
    }),
  );
}

async function touchLastSynced(slug: string): Promise<void> {
  await ShippingProvider.findOneAndUpdate(
    { slug },
    { lastSyncedAt: new Date() },
  );
}

export const ShippingService = {
  async createShipment(
    order: IOrder,
    providerSlug: string,
    adminUserId?: string,
  ): Promise<IOrder> {
    if (order.shippingProvider && order.shipmentId) {
      throw new ApiError(
        400,
        "This order already has a shipment — cancel it first to re-create",
      );
    }
    if (order.shippingProvider && !order.shipmentId) {
      throw new ApiError(
        409,
        `A previous ${order.shippingProvider} shipment attempt for this order did not finish saving ` +
          `(status: "${order.shippingStatus ?? "unknown"}"). Check ${order.shippingProvider} for ` +
          `order "${order.orderNumber}" before retrying, to avoid a duplicate shipment.`,
      );
    }
    if (!["confirmed", "processing"].includes(order.status)) {
      throw new ApiError(
        400,
        "Order must be in confirmed or processing status to ship",
      );
    }
    if (order.paymentMethod === "razorpay" && order.paymentStatus !== "paid") {
      throw new ApiError(400, "An unpaid Razorpay order cannot be shipped");
    }

    const provider = await ShippingFactory.getProvider(providerSlug);

    const reservation = await Order.updateOne(
      {
        _id: order._id,
        $or: [
          { shippingProvider: { $exists: false } },
          { shippingProvider: null },
        ],
      },
      { $set: { shippingProvider: providerSlug, shippingStatus: "Creating" } },
    );
    if (reservation.modifiedCount !== 1) {
      throw new ApiError(
        409,
        "Another shipment attempt has already started for this order. Refresh the order before retrying.",
      );
    }

    order.shippingProvider = providerSlug;
    order.shippingStatus = "Creating";

    let result: Awaited<ReturnType<typeof provider.createShipment>>;
    try {
      result = await provider.createShipment(order);
    } catch (err) {
      logShippingEvent("shipment_failed", {
        provider: providerSlug,
        orderId: order._id.toString(),
        adminUserId,
        meta: {
          stage: "provider_call",
          error: err instanceof Error ? err.message : String(err),
          reconciliationRequired: true,
        },
      });
      console.error(
        `[Shipping] Provider call failed after reserving order ${order._id} with ${providerSlug}. ` +
          `The provider may have created the shipment before the failure; reconcile it before retrying.`,
      );
      throw err;
    }

    order.shipmentId = result.shipmentId;
    order.awbNumber = result.trackingNumber;
    order.carrier = result.carrier;
    order.shippingStatus = result.status;
    order.labelUrl = result.labelUrl;
    order.manifestUrl = result.manifestUrl;
    order.invoiceUrl = result.invoiceUrl;
    order.shipmentCreatedAt = new Date();
    if (result.providerMeta) order.shippingMeta = result.providerMeta;
    order.status = "processing";
    order.statusHistory.push({
      status: "processing",
      note: `Shipment created via ${providerSlug}`,
      timestamp: new Date(),
    });

    try {
      await order.save();
    } catch (err) {
      console.error(
        `[Shipping] Provider shipment was created but the local save failed. ` +
          `Order ${order._id}, provider ${providerSlug}, shipmentId ${result.shipmentId}, ` +
          `trackingNumber ${result.trackingNumber ?? "n/a"}. Reconciliation is required.`,
      );
      logShippingEvent("shipment_failed", {
        provider: providerSlug,
        orderId: order._id.toString(),
        adminUserId,
        meta: {
          stage: "post_provider_save",
          shipmentId: result.shipmentId,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw new ApiError(
        502,
        `Shipment was created with ${providerSlug} (ID: ${result.shipmentId}) but failed to save locally. ` +
          `Do not retry; reconcile this order using the provider shipment ID.`,
      );
    }

    await touchLastSynced(providerSlug);
    logShippingEvent("shipment_created", {
      provider: providerSlug,
      orderId: order._id.toString(),
      adminUserId,
      meta: { shipmentId: result.shipmentId },
    });

    return order;
  },

  async cancelShipment(order: IOrder, adminUserId?: string): Promise<IOrder> {
    if (!order.shippingProvider) {
      throw new ApiError(400, "This order has no shipment to cancel");
    }
    if (order.status === "delivered") {
      throw new ApiError(
        400,
        "Cannot cancel a shipment that has already been delivered",
      );
    }

    const providerSlug = order.shippingProvider;

    // A shipment attempt can fail after the order was "reserved" for a
    // provider (shippingProvider set) but before the provider ever returned
    // a shipmentId — e.g. the provider's API rejected the request. There is
    // no real shipment on the provider's side to cancel in that case, and
    // calling provider.cancelShipment() would just fail again (it needs a
    // real shipment/order reference). Clear the stuck reservation locally
    // instead of treating this as a real cancellation.
    if (!order.shipmentId) {
      order.statusHistory.push({
        status: order.status,
        note: `Cleared incomplete ${providerSlug} shipment attempt (no shipment was ever created)`,
        timestamp: new Date(),
      });
      order.shippingProvider = undefined;
      order.shipmentId = undefined;
      order.awbNumber = undefined;
      order.carrier = undefined;
      order.shippingStatus = undefined;
      order.labelUrl = undefined;
      order.manifestUrl = undefined;
      order.invoiceUrl = undefined;
      order.shipmentCreatedAt = undefined;
      order.shippingMeta = undefined;
      order.trackingUrl = undefined;
      order.trackingCheckpoints = undefined;

      await order.save();
      logShippingEvent("shipment_cancelled", {
        provider: providerSlug,
        orderId: order._id.toString(),
        adminUserId,
        meta: { incompleteAttemptCleared: true },
      });

      return order;
    }

    const provider = await ShippingFactory.getProvider(providerSlug);

    try {
      await provider.cancelShipment(order);
    } catch (err) {
      logShippingEvent("shipment_failed", {
        provider: providerSlug,
        orderId: order._id.toString(),
        adminUserId,
        meta: {
          action: "cancel",
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }

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
    order.labelUrl = undefined;
    order.manifestUrl = undefined;
    order.invoiceUrl = undefined;
    order.shipmentCreatedAt = undefined;
    order.shippingMeta = undefined;
    order.trackingUrl = undefined;
    order.trackingCheckpoints = undefined;

    await order.save();
    logShippingEvent("shipment_cancelled", {
      provider: providerSlug,
      orderId: order._id.toString(),
      adminUserId,
    });

    return order;
  },

  async trackShipment(
    order: IOrder,
    adminUserId?: string,
  ): Promise<StandardTrackingResult> {
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

  async downloadLabel(
    order: IOrder,
    adminUserId?: string,
  ): Promise<{ labelUrl: string }> {
    if (!order.shippingProvider) {
      throw new ApiError(
        400,
        "This order has no shipment to generate a label for",
      );
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

  async generateInvoice(
    order: IOrder,
    adminUserId?: string,
  ): Promise<{ invoiceUrl: string }> {
    if (!order.shippingProvider) {
      throw new ApiError(
        400,
        "This order has no shipment to generate an invoice for",
      );
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
