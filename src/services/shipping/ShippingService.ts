import { ApiError } from "../../utils/ApiError";
import { IOrder, Order } from "../../models/order.model";
import { ShippingProvider } from "../../models/shippingProvider.model";
import { ShippingFactory } from "./ShippingFactory";
import { StandardTrackingResult } from "./types";
import {
  AfterShipTrackingData,
  getAfterShipTrackingUrl,
  mapAfterShipTagToOrderStatus,
} from "./aftership-tracking.service";

type ShippingEvent =
  | "shipment_created"
  | "shipment_cancelled"
  | "shipment_failed"
  | "tracking_registered"
  | "tracking_registration_cleared"
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
    trackingInput?: { carrierName: string; trackingNumber: string; courierSlug?: string },
  ): Promise<IOrder> {
    if (providerSlug === "aftership") {
      if (!trackingInput) {
        throw new ApiError(400, "Courier and tracking number are required for AfterShip");
      }
      return registerAfterShipTracking(order, trackingInput, adminUserId);
    }

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
    if (providerSlug === "aftership") {
      if (
        order.aftershipTrackingId ||
        order.shipmentId ||
        !["Registering tracking", "Registration outcome unknown"].includes(
          order.shippingStatus || "",
        )
      ) {
        throw new ApiError(
          400,
          "AfterShip does not book or cancel shipments. Contact the courier managing this parcel.",
        );
      }

      order.statusHistory.push({
        status: order.status,
        note: "Cleared pending AfterShip tracking registration locally; verify AfterShip before retrying",
        timestamp: new Date(),
      });
      order.shippingProvider = undefined;
      order.shippingStatus = undefined;
      order.trackingNumber = undefined;
      order.awbNumber = undefined;
      order.carrier = undefined;
      order.trackingUrl = undefined;
      order.trackingCheckpoints = undefined;
      order.shipmentCreatedAt = undefined;
      await order.save();
      logShippingEvent("tracking_registration_cleared", {
        provider: "aftership",
        orderId: order._id.toString(),
        adminUserId,
        meta: { reconciliationRequired: true },
      });
      return order;
    }

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

    if (order.shippingProvider === "aftership") {
      if (!order.aftershipTrackingId) {
        throw new ApiError(
          400,
          "This legacy AfterShip record has no tracking registration to refresh",
        );
      }
      const client = await ShippingFactory.getAfterShipTrackingClient();
      const tracking = await client.getTracking(order.aftershipTrackingId);
      applyAfterShipTracking(order, tracking);
      await order.save();
      await touchLastSynced("aftership");
      logShippingEvent("tracking_requested", {
        provider: "aftership",
        orderId: order._id.toString(),
        adminUserId,
        meta: { aftershipTrackingId: order.aftershipTrackingId },
      });
      return toStandardTrackingResult(tracking, order);
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
    if (order.shippingProvider === "aftership") {
      throw new ApiError(400, "AfterShip is tracking-only; labels must be obtained from the courier");
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
    if (order.shippingProvider === "aftership") {
      throw new ApiError(400, "AfterShip is tracking-only; invoices must be obtained from the courier");
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

async function registerAfterShipTracking(
  order: IOrder,
  input: { carrierName: string; trackingNumber: string; courierSlug?: string },
  adminUserId?: string,
): Promise<IOrder> {
  if (order.shippingProvider) {
    if (order.aftershipTrackingId) {
      throw new ApiError(400, "AfterShip tracking has already been registered for this order");
    }
    throw new ApiError(
      409,
      `This order already has a ${order.shippingProvider} shipment or a pending registration`,
    );
  }
  if (!["confirmed", "processing"].includes(order.status)) {
    throw new ApiError(400, "Order must be confirmed or processing before adding tracking");
  }
  if (order.paymentMethod === "razorpay" && order.paymentStatus !== "paid") {
    throw new ApiError(400, "An unpaid Razorpay order cannot be shipped");
  }

  const client = await ShippingFactory.getAfterShipTrackingClient();
  const reservation = await Order.updateOne(
    {
      _id: order._id,
      $or: [{ shippingProvider: { $exists: false } }, { shippingProvider: null }],
    },
    { $set: { shippingProvider: "aftership", shippingStatus: "Registering tracking" } },
  );
  if (reservation.modifiedCount !== 1) {
    throw new ApiError(
      409,
      "Another shipment or tracking registration has started. Refresh the order before retrying.",
    );
  }

  let tracking: AfterShipTrackingData;
  try {
    tracking = await client.createTracking({
      trackingNumber: input.trackingNumber,
      courierSlug: input.courierSlug,
      orderNumber: order.orderNumber,
      destinationCountry: "IND",
    });
  } catch (error) {
    await Order.updateOne(
      { _id: order._id, shippingProvider: "aftership" },
      { $set: { shippingStatus: "Registration outcome unknown" } },
    );
    logShippingEvent("shipment_failed", {
      provider: "aftership",
      orderId: order._id.toString(),
      adminUserId,
      meta: {
        stage: "tracking_registration",
        error: error instanceof Error ? error.message : String(error),
        reconciliationRequired: true,
      },
    });
    console.error(
      `[AfterShip] Tracking registration for order ${order._id} did not complete. ` +
        "Check the AfterShip dashboard before retrying to avoid duplicate tracking records.",
    );
    throw error;
  }

  order.aftershipTrackingId = tracking.id;
  order.shippingProvider = "aftership";
  order.aftershipCourierSlug = tracking.slug || input.courierSlug;
  order.trackingNumber = tracking.tracking_number;
  order.awbNumber = tracking.tracking_number;
  order.carrier = input.carrierName;
  order.trackingUrl = getAfterShipTrackingUrl(tracking, input.courierSlug);
  order.shippingStatus = tracking.tag || "InfoReceived";
  order.shipmentCreatedAt = new Date();
  applyAfterShipTracking(order, tracking, false);
  order.status = "shipped";
  order.statusHistory.push({
    status: "shipped",
    note: "Courier tracking registered with AfterShip",
    timestamp: new Date(),
  });

  try {
    await order.save();
  } catch (error) {
    console.error(
      `[AfterShip] Tracking ${tracking.id} was registered but could not be saved for order ${order._id}.`,
    );
    throw new ApiError(
      502,
      `Tracking was registered with AfterShip (ID: ${tracking.id}) but failed to save locally. Do not retry.`,
    );
  }

  await touchLastSynced("aftership");
  logShippingEvent("tracking_registered", {
    provider: "aftership",
    orderId: order._id.toString(),
    adminUserId,
    meta: { aftershipTrackingId: tracking.id, courierSlug: order.aftershipCourierSlug },
  });
  return order;
}

function applyAfterShipTracking(
  order: IOrder,
  tracking: AfterShipTrackingData,
  updateOrderStatus = true,
): void {
  order.shippingStatus = tracking.tag || order.shippingStatus || "InfoReceived";
  order.trackingNumber = tracking.tracking_number;
  order.awbNumber = tracking.tracking_number;
  if (tracking.slug) order.aftershipCourierSlug = tracking.slug;
  order.trackingUrl = getAfterShipTrackingUrl(tracking, order.aftershipCourierSlug);
  if (tracking.checkpoints?.length) {
    order.trackingCheckpoints = tracking.checkpoints.map((checkpoint) => {
      const parsed = new Date(checkpoint.checkpoint_time || "");
      return {
        time: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
        message: checkpoint.message || "",
        location: checkpoint.location || "",
      };
    });
  }

  const mappedStatus = updateOrderStatus
    ? mapAfterShipTagToOrderStatus(tracking.tag)
    : null;
  const statusRank: Partial<Record<IOrder["status"], number>> = {
    placed: 0,
    confirmed: 1,
    processing: 2,
    shipped: 3,
    delivered: 4,
  };
  const currentRank = statusRank[order.status];
  const nextRank = mappedStatus ? statusRank[mappedStatus] : undefined;
  if (
    mappedStatus &&
    currentRank !== undefined &&
    nextRank !== undefined &&
    nextRank > currentRank
  ) {
    order.status = mappedStatus;
    order.statusHistory.push({
      status: mappedStatus,
      note: `AfterShip tracking update: ${tracking.tag}`,
      timestamp: new Date(),
    });
  }
}

function toStandardTrackingResult(
  tracking: AfterShipTrackingData,
  order: IOrder,
): StandardTrackingResult {
  return {
    status: tracking.tag || "InfoReceived",
    trackingNumber: tracking.tracking_number,
    carrier: order.carrier || tracking.slug,
    trackingUrl: order.trackingUrl,
    checkpoints: (tracking.checkpoints || []).map((checkpoint) => ({
      time: checkpoint.checkpoint_time || "",
      message: checkpoint.message || "",
      location: checkpoint.location || "",
    })),
  };
}
