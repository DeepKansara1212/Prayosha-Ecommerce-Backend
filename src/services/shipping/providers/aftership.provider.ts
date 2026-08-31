import { ApiError } from "../../../utils/ApiError";
import { IOrder } from "../../../models/order.model";
import { User } from "../../../models/user.model";
import {
  IShippingProvider,
  StandardShipmentResult,
  StandardTrackingResult,
} from "../types";

/**
 * AfterShip SHIPPING (rate-shopping + label purchase), not AfterShip
 * Tracking. This is a different AfterShip product with its own account/API
 * surface — this codebase never called it before this integration.
 *
 * createShipment/cancelShipment/downloadLabel/generateInvoice below are
 * implemented against AfterShip's documented Shipping API shape to the best
 * of available knowledge, but — exactly like the original ShipRocket
 * integration before it was tested against a live account — have NOT been
 * verified against real credentials. Re-validate endpoint paths and payload
 * shapes against AfterShip's current Shipping API docs once the client
 * provides real AfterShip Shipping keys, and adjust here only; nothing else
 * in the app depends on these details (see ShippingFactory/ShippingService).
 *
 * trackShipment is the one part carried over from logic this codebase
 * already used successfully — it registers + polls via the AfterShip
 * Tracking API, which works for any carrier's AWB regardless of who created
 * the shipment, so it doesn't share the same uncertainty as the rest.
 *
 * TEMP MOCK MODE — set AFTERSHIP_MOCK_MODE=true in Backend/.env to bypass
 * every real network call below and return realistic fake data instead.
 * This exists solely so the rest of the app (ShippingService persistence,
 * Admin UI, customer tracking view) can be verified end-to-end while the
 * real AfterShip Shipping auth ("Bad token" from their jwt-authz gateway,
 * persisting across header and permission changes) gets sorted separately —
 * likely needs AfterShip support to confirm the actual token-exchange flow.
 * Remove every `if (isMockMode())` block and this whole comment once real
 * auth is confirmed working.
 */

function isMockMode(): boolean {
  return process.env.AFTERSHIP_MOCK_MODE === "true";
}

const SHIPPING_BASE_URL = "https://api.aftership.com/shipping/v1";
const TRACKING_BASE_URL = "https://api.aftership.com/tracking/2024-10";

export interface AftershipCredentials {
  apiKey: string;
}

export class AfterShipProvider implements IShippingProvider {
  readonly slug = "aftership";
  private readonly credentials: AftershipCredentials;

  constructor(credentials: AftershipCredentials) {
    if (!credentials.apiKey) {
      throw new ApiError(503, "AfterShip is not configured");
    }
    this.credentials = credentials;
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Per AfterShip's docs, both Shipping and Tracking use the as-api-key
    // header for standard API key auth (their separate OAuth flow — Client
    // ID + Client Secret exchanged for an access_token — uses a different
    // header, as-access-token, and doesn't apply to a plain API key).
    const authHeaders: Record<string, string> = { "as-api-key": this.credentials.apiKey };

    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(options.headers as Record<string, string>),
      },
    });

    const data = (await res.json()) as T & {
      meta?: { message?: string };
      message?: string;
    };

    if (!res.ok) {
      // TEMP DEBUG — remove once AfterShip Shipping auth is confirmed working.
      console.log("[AfterShip DEBUG] status:", res.status, "body:", JSON.stringify(data), "keyPrefix:", this.credentials.apiKey.slice(0, 6));
      // Always surface as 502 (upstream failure), never relay AfterShip's own
      // status code verbatim — a provider-side 401/403 must not be mistaken
      // for our own admin auth failing, which would wrongly log the admin out.
      const msg = data.meta?.message || data.message || "AfterShip API error";
      throw new ApiError(502, msg);
    }

    return data;
  }

  async createShipment(order: IOrder): Promise<StandardShipmentResult> {
    if (isMockMode()) {
      return {
        shipmentId: `MOCK-${Date.now()}`,
        trackingNumber: `MOCKAWB${Date.now()}`,
        carrier: "Mock Express",
        status: "Created",
        labelUrl: "https://example.com/mock-label.pdf",
      };
    }

    const user = await User.findById(order.user).select("email");

    const payload = {
      recipient: {
        contact_name: order.shippingAddress.fullName,
        phone_number: order.shippingAddress.phone,
        email: user?.email || "",
        street1: order.shippingAddress.line1,
        street2: order.shippingAddress.line2 || "",
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postal_code: order.shippingAddress.pincode,
        country: "IN",
      },
      parcels: [
        {
          items: order.items.map((item) => ({
            description: item.name,
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      ],
      order_id: order.orderNumber,
      cash_on_delivery: order.paymentMethod === "cod",
    };

    const data = await this.request<{
      data?: {
        shipment?: {
          id?: string;
          tracking_number?: string;
          carrier?: string;
          status?: string;
          label?: { url?: string };
        };
      };
      message?: string;
    }>(SHIPPING_BASE_URL, "/shipments", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const shipment = data.data?.shipment;
    if (!shipment?.id) {
      throw new ApiError(502, data.message || "AfterShip did not return a shipment id");
    }

    if (shipment.tracking_number) {
      await this.registerTrackingSafe(shipment.tracking_number, order.orderNumber);
    }

    return {
      shipmentId: shipment.id,
      trackingNumber: shipment.tracking_number,
      carrier: shipment.carrier,
      status: shipment.status || "Created",
      labelUrl: shipment.label?.url,
    };
  }

  async cancelShipment(order: IOrder): Promise<void> {
    if (isMockMode()) return;

    if (!order.shipmentId) {
      throw new ApiError(400, "Order has no AfterShip shipment id");
    }
    await this.request(SHIPPING_BASE_URL, `/shipments/${order.shipmentId}/cancel`, {
      method: "POST",
    });
  }

  async downloadLabel(order: IOrder): Promise<{ labelUrl: string }> {
    if (isMockMode()) return { labelUrl: "https://example.com/mock-label.pdf" };

    if (!order.shipmentId) {
      throw new ApiError(400, "Order has no AfterShip shipment id");
    }

    const data = await this.request<{
      data?: { shipment?: { label?: { url?: string } } };
      message?: string;
    }>(SHIPPING_BASE_URL, `/shipments/${order.shipmentId}`, { method: "GET" });

    const labelUrl = data.data?.shipment?.label?.url;
    if (!labelUrl) {
      throw new ApiError(502, data.message || "AfterShip did not return a label URL");
    }

    return { labelUrl };
  }

  async generateInvoice(order: IOrder): Promise<{ invoiceUrl: string }> {
    if (isMockMode()) return { invoiceUrl: "https://example.com/mock-invoice.pdf" };

    if (!order.shipmentId) {
      throw new ApiError(400, "Order has no AfterShip shipment id");
    }

    const data = await this.request<{
      data?: { shipment?: { invoice?: { url?: string } } };
      message?: string;
    }>(SHIPPING_BASE_URL, `/shipments/${order.shipmentId}`, { method: "GET" });

    const invoiceUrl = data.data?.shipment?.invoice?.url;
    if (!invoiceUrl) {
      throw new ApiError(502, data.message || "AfterShip did not return an invoice URL");
    }

    return { invoiceUrl };
  }

  async trackShipment(order: IOrder): Promise<StandardTrackingResult> {
    if (isMockMode()) {
      return {
        status: "InTransit",
        trackingNumber: order.awbNumber || order.trackingNumber,
        carrier: order.carrier || "Mock Express",
        trackingUrl: "https://example.com/mock-tracking",
        checkpoints: [
          { time: new Date(Date.now() - 3600_000).toISOString(), message: "Picked up from seller", location: "Mumbai Hub" },
          { time: new Date().toISOString(), message: "In transit to destination", location: "Delhi Hub" },
        ],
      };
    }

    const trackingNumber = order.awbNumber || order.trackingNumber;
    if (!trackingNumber) {
      throw new ApiError(400, "Order has no tracking number to look up");
    }

    const data = await this.request<{
      data?: {
        tag?: string;
        subtag_message?: string;
        checkpoints?: Array<{
          checkpoint_time?: string;
          message?: string;
          location?: string;
        }>;
        expected_delivery?: string;
        courier_tracking_link?: string;
        tracking_url?: string;
        slug?: string;
      };
    }>(TRACKING_BASE_URL, `/trackings/${encodeURIComponent(trackingNumber)}`, {
      method: "GET",
    });

    const tracking = data.data ?? {};

    return {
      status: tracking.subtag_message || tracking.tag || "Unknown",
      trackingNumber,
      carrier: tracking.slug,
      trackingUrl: tracking.courier_tracking_link || tracking.tracking_url,
      estimatedDelivery: tracking.expected_delivery,
      checkpoints: (tracking.checkpoints || []).map((cp) => ({
        time: cp.checkpoint_time || "",
        message: cp.message || "",
        location: cp.location || "",
      })),
    };
  }

  private async registerTrackingSafe(
    trackingNumber: string,
    orderId: string
  ): Promise<void> {
    try {
      await this.request(TRACKING_BASE_URL, "/trackings", {
        method: "POST",
        body: JSON.stringify({
          tracking_number: trackingNumber,
          order_id: orderId,
        }),
      });
    } catch (err) {
      console.warn("[AfterShip] Failed to register tracking:", err);
    }
  }
}

export function mapAftershipTagToOrderStatus(tag: string): IOrder["status"] | null {
  const normalized = tag.trim();

  const map: Record<string, IOrder["status"]> = {
    Pending: "processing",
    InfoReceived: "processing",
    InTransit: "shipped",
    OutForDelivery: "shipped",
    Delivered: "delivered",
    AttemptFail: "shipped",
    Exception: "processing",
    Expired: "cancelled",
  };

  return map[normalized] ?? null;
}
