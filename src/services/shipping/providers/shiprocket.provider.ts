import crypto from "crypto";
import { ApiError } from "../../../utils/ApiError";
import { IOrder } from "../../../models/order.model";
import { Product } from "../../../models/product.model";
import { User } from "../../../models/user.model";
import {
  IShippingProvider,
  StandardShipmentResult,
  StandardTrackingResult,
} from "../types";

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export interface ShiprocketCredentials {
  email: string;
  password: string;
  channelId?: string;
  pickupLocation?: string;
  defaultLength?: number;
  defaultBreadth?: number;
  defaultHeight?: number;
  defaultWeight?: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Keyed by a hash of the credentials so editing credentials in Admin
// invalidates any previously cached token for the old ones.
const tokenCache = new Map<string, CachedToken>();

function credentialsKey(creds: ShiprocketCredentials): string {
  return crypto
    .createHash("sha256")
    .update(`${creds.email}:${creds.password}`)
    .digest("hex");
}

export class ShiprocketProvider implements IShippingProvider {
  readonly slug = "shiprocket";
  private readonly credentials: ShiprocketCredentials;

  constructor(credentials: ShiprocketCredentials) {
    if (!credentials.email || !credentials.password) {
      throw new ApiError(503, "ShipRocket is not configured");
    }
    this.credentials = credentials;
  }

  private async fetchToken(): Promise<string> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.credentials.email,
        password: this.credentials.password,
      }),
    });

    const data = (await res.json()) as { token?: string; message?: string };

    if (!res.ok || !data.token) {
      // Always 502 (upstream failure) — never relay ShipRocket's own status
      // code, since a 401/403 here would otherwise be mistaken by the Admin
      // client for our own auth failing and wrongly log the admin out.
      throw new ApiError(502, data.message || "Failed to authenticate with ShipRocket");
    }

    tokenCache.set(credentialsKey(this.credentials), {
      token: data.token,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    });

    return data.token;
  }

  private async getToken(): Promise<string> {
    const cached = tokenCache.get(credentialsKey(this.credentials));
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    return this.fetchToken();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    retryOn401 = true
  ): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers as Record<string, string>),
      },
    });

    if (res.status === 401 && retryOn401) {
      tokenCache.delete(credentialsKey(this.credentials));
      return this.request<T>(path, options, false);
    }

    const data = (await res.json()) as T & {
      message?: string;
      errors?: unknown;
    };

    if (!res.ok) {
      // Always 502 — see fetchToken() above for why we never relay
      // ShipRocket's own status code as if it were our own API's.
      const msg =
        (data as { message?: string }).message ||
        (typeof data === "object" && data !== null
          ? JSON.stringify(data)
          : "ShipRocket API error");
      throw new ApiError(502, msg);
    }

    return data;
  }

  private async resolveOrderWeight(order: IOrder): Promise<number> {
    const defaultWeight = this.credentials.defaultWeight ?? 0.5;
    const productIds = order.items.map((item) => item.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select("useCategoryShipping shipping category")
      .populate("category", "shipping");

    let totalWeight = 0;
    for (const item of order.items) {
      const product = products.find(
        (p) => p._id.toString() === item.product.toString()
      );
      const resolvedWeight = product?.useCategoryShipping
        ? (
            product.category as unknown as
              | { shipping?: { weight?: number } }
              | undefined
          )?.shipping?.weight
        : product?.shipping?.weight;
      const itemWeight = resolvedWeight ?? defaultWeight;
      totalWeight += itemWeight * item.quantity;
    }

    return Math.max(totalWeight, 0.1);
  }

  async createShipment(order: IOrder): Promise<StandardShipmentResult> {
    const user = await User.findById(order.user).select("email");
    const weight = await this.resolveOrderWeight(order);

    const payload: Record<string, unknown> = {
      order_id: order.orderNumber,
      order_date: order.createdAt.toISOString().split("T")[0],
      pickup_location: this.credentials.pickupLocation || "Primary",
      billing_customer_name: order.shippingAddress.fullName,
      billing_last_name: "",
      billing_address: order.shippingAddress.line1,
      billing_address_2: order.shippingAddress.line2 || "",
      billing_city: order.shippingAddress.city,
      billing_state: order.shippingAddress.state,
      billing_pincode: order.shippingAddress.pincode,
      billing_country: "India",
      billing_email: user?.email || "",
      billing_phone: order.shippingAddress.phone,
      shipping_is_billing: true,
      shipping_customer_name: order.shippingAddress.fullName,
      shipping_last_name: "",
      shipping_address: order.shippingAddress.line1,
      shipping_address_2: order.shippingAddress.line2 || "",
      shipping_city: order.shippingAddress.city,
      shipping_state: order.shippingAddress.state,
      shipping_pincode: order.shippingAddress.pincode,
      shipping_country: "India",
      shipping_email: user?.email || "",
      shipping_phone: order.shippingAddress.phone,
      order_items: order.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0,
      })),
      payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
      sub_total: order.total,
      length: this.credentials.defaultLength ?? 10,
      breadth: this.credentials.defaultBreadth ?? 10,
      height: this.credentials.defaultHeight ?? 10,
      weight,
    };

    if (this.credentials.channelId) {
      payload.channel_id = this.credentials.channelId;
    }

    const data = await this.request<{
      order_id?: number | string;
      shipment_id?: number | string;
      message?: string;
    }>("/orders/create/adhoc", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const shiprocketOrderId = String(data.order_id ?? "");
    const shipmentId = String(data.shipment_id ?? "");

    if (!shiprocketOrderId || !shipmentId) {
      throw new ApiError(502, data.message || "ShipRocket did not return order IDs");
    }

    return {
      shipmentId,
      status: "Order Created",
      providerMeta: { shiprocketOrderId },
    };
  }

  async cancelShipment(order: IOrder): Promise<void> {
    const shiprocketOrderId = (order.shippingMeta as { shiprocketOrderId?: string } | undefined)
      ?.shiprocketOrderId;
    if (!shiprocketOrderId) {
      throw new ApiError(400, "No ShipRocket order reference found on this order");
    }

    await this.request("/orders/cancel", {
      method: "POST",
      body: JSON.stringify({ ids: [shiprocketOrderId] }),
    });
  }

  async trackShipment(order: IOrder): Promise<StandardTrackingResult> {
    if (!order.shipmentId) {
      throw new ApiError(400, "Order has no ShipRocket shipment id");
    }

    const data = await this.request<{
      tracking_data?: {
        shipment_status?: string;
        awb_code?: string;
        courier_name?: string;
        track_url?: string;
        etd?: string;
        shipment_track_activities?: Array<{
          date?: string;
          activity?: string;
          location?: string;
        }>;
      };
    }>(`/courier/track/shipment/${order.shipmentId}`, { method: "GET" });

    const tracking = data.tracking_data ?? {};

    return {
      status: tracking.shipment_status || "Unknown",
      trackingNumber: tracking.awb_code || undefined,
      carrier: tracking.courier_name || undefined,
      trackingUrl: tracking.track_url || undefined,
      estimatedDelivery: tracking.etd || undefined,
      checkpoints: (tracking.shipment_track_activities || []).map((a) => ({
        time: a.date || "",
        message: a.activity || "",
        location: a.location || "",
      })),
    };
  }

  async downloadLabel(order: IOrder): Promise<{ labelUrl: string }> {
    if (!order.shipmentId) {
      throw new ApiError(400, "Order has no ShipRocket shipment id");
    }

    const data = await this.request<{
      label_url?: string;
      response?: { label_url?: string };
      message?: string;
    }>("/courier/generate/label", {
      method: "POST",
      body: JSON.stringify({ shipment_id: [order.shipmentId] }),
    });

    const labelUrl = data.label_url || data.response?.label_url;
    if (!labelUrl) {
      throw new ApiError(502, data.message || "ShipRocket did not return a label URL");
    }

    return { labelUrl };
  }

  async generateInvoice(order: IOrder): Promise<{ invoiceUrl: string }> {
    const shiprocketOrderId = (order.shippingMeta as { shiprocketOrderId?: string } | undefined)
      ?.shiprocketOrderId;
    if (!shiprocketOrderId) {
      throw new ApiError(400, "No ShipRocket order reference found on this order");
    }

    const data = await this.request<{
      invoice_url?: string;
      message?: string;
    }>("/orders/print/invoice", {
      method: "POST",
      body: JSON.stringify({ ids: [shiprocketOrderId] }),
    });

    if (!data.invoice_url) {
      throw new ApiError(502, data.message || "ShipRocket did not return an invoice URL");
    }

    return { invoiceUrl: data.invoice_url };
  }
}

export function mapShiprocketStatusToOrderStatus(
  shiprocketStatus: string
): IOrder["status"] | null {
  const normalized = shiprocketStatus.toUpperCase().trim();

  const map: Record<string, IOrder["status"]> = {
    "PICKUP PENDING": "processing",
    "PICKUP SCHEDULED": "processing",
    "IN TRANSIT": "shipped",
    "OUT FOR DELIVERY": "shipped",
    DELIVERED: "delivered",
    CANCELLED: "cancelled",
    "RTO INITIATED": "cancelled",
    "RTO DELIVERED": "cancelled",
  };

  return map[normalized] ?? null;
}
