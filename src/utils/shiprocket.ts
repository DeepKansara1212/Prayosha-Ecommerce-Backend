import { env } from "../config/env";
import { ApiError } from "./ApiError";
import { IOrder } from "../models/order.model";
import { Product } from "../models/product.model";
import { User } from "../models/user.model";

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

interface ShiprocketToken {
  token: string;
  expiresAt: number;
}

let cachedToken: ShiprocketToken | null = null;

export function isShiprocketConfigured(): boolean {
  return !!(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD);
}

function assertShiprocketConfigured(): void {
  if (!isShiprocketConfigured()) {
    throw new ApiError(503, "Shipping service not configured");
  }
}

async function fetchToken(): Promise<string> {
  assertShiprocketConfigured();

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.SHIPROCKET_EMAIL,
      password: env.SHIPROCKET_PASSWORD,
    }),
  });

  const data = (await res.json()) as {
    token?: string;
    message?: string;
  };

  if (!res.ok || !data.token) {
    throw new ApiError(
      res.status || 502,
      data.message || "Failed to authenticate with ShipRocket"
    );
  }

  cachedToken = {
    token: data.token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };

  return data.token;
}

export async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  return fetchToken();
}

async function shiprocketRequest<T>(
  path: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<T> {
  assertShiprocketConfigured();

  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });

  if (res.status === 401 && retryOn401) {
    cachedToken = null;
    return shiprocketRequest<T>(path, options, false);
  }

  const data = (await res.json()) as T & {
    message?: string;
    errors?: unknown;
  };

  if (!res.ok) {
    const msg =
      (data as { message?: string }).message ||
      (typeof data === "object" && data !== null
        ? JSON.stringify(data)
        : "ShipRocket API error");
    throw new ApiError(res.status || 502, msg);
  }

  return data;
}

async function resolveOrderWeight(order: IOrder): Promise<number> {
  const defaultWeight = parseFloat(env.SHIPROCKET_DEFAULT_WEIGHT || "0.5");
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
      ? (product.category as unknown as { shipping?: { weight?: number } } | undefined)
          ?.shipping?.weight
      : product?.shipping?.weight;
    const itemWeight = resolvedWeight ?? defaultWeight;
    totalWeight += itemWeight * item.quantity;
  }

  return Math.max(totalWeight, 0.1);
}

export async function createShiprocketOrder(
  order: IOrder
): Promise<{ shiprocketOrderId: string; shiprocketShipmentId: string }> {
  const user = await User.findById(order.user).select("email");
  const weight = await resolveOrderWeight(order);

  const payload: Record<string, unknown> = {
    order_id: order.orderNumber,
    order_date: order.createdAt.toISOString().split("T")[0],
    pickup_location: env.SHIPROCKET_PICKUP_LOCATION || "Primary",
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
    length: parseFloat(env.SHIPROCKET_DEFAULT_LENGTH || "10"),
    breadth: parseFloat(env.SHIPROCKET_DEFAULT_BREADTH || "10"),
    height: parseFloat(env.SHIPROCKET_DEFAULT_HEIGHT || "10"),
    weight,
  };

  if (env.SHIPROCKET_CHANNEL_ID) {
    payload.channel_id = env.SHIPROCKET_CHANNEL_ID;
  }

  const data = await shiprocketRequest<{
    order_id?: number | string;
    shipment_id?: number | string;
    message?: string;
  }>("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const shiprocketOrderId = String(data.order_id ?? "");
  const shiprocketShipmentId = String(data.shipment_id ?? "");

  if (!shiprocketOrderId || !shiprocketShipmentId) {
    throw new ApiError(502, data.message || "ShipRocket did not return order IDs");
  }

  return { shiprocketOrderId, shiprocketShipmentId };
}

export async function generateLabel(shipmentIds: string[]): Promise<string> {
  const data = await shiprocketRequest<{
    label_url?: string;
    response?: { label_url?: string };
    message?: string;
  }>("/courier/generate/label", {
    method: "POST",
    body: JSON.stringify({ shipment_id: shipmentIds }),
  });

  const labelUrl = data.label_url || data.response?.label_url;
  if (!labelUrl) {
    throw new ApiError(502, data.message || "ShipRocket did not return a label URL");
  }

  return labelUrl;
}

export interface ShiprocketTrackingResult {
  status: string;
  awbCode: string;
  courierName: string;
  trackingUrl: string;
  etd: string;
  activities: Array<{ date: string; activity: string; location: string }>;
}

export async function trackShipment(
  shipmentId: string
): Promise<ShiprocketTrackingResult> {
  const data = await shiprocketRequest<{
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
  }>(`/courier/track/shipment/${shipmentId}`, { method: "GET" });

  const tracking = data.tracking_data ?? {};

  return {
    status: tracking.shipment_status || "Unknown",
    awbCode: tracking.awb_code || "",
    courierName: tracking.courier_name || "",
    trackingUrl: tracking.track_url || "",
    etd: tracking.etd || "",
    activities: (tracking.shipment_track_activities || []).map((a) => ({
      date: a.date || "",
      activity: a.activity || "",
      location: a.location || "",
    })),
  };
}

export async function cancelShiprocketOrder(
  shiprocketOrderIds: string[]
): Promise<void> {
  await shiprocketRequest("/orders/cancel", {
    method: "POST",
    body: JSON.stringify({ ids: shiprocketOrderIds }),
  });
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
