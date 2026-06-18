import { env } from "../config/env";
import { ApiError } from "./ApiError";
import { IOrder } from "../models/order.model";

const BASE_URL = "https://api.aftership.com/tracking/2024-10";

export function isAftershipConfigured(): boolean {
  return !!env.AFTERSHIP_API_KEY;
}

async function aftershipRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!isAftershipConfigured()) {
    throw new ApiError(503, "AfterShip is not configured");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "as-api-key": env.AFTERSHIP_API_KEY!,
      ...(options.headers as Record<string, string>),
    },
  });

  const data = (await res.json()) as T & {
    meta?: { message?: string; code?: number };
    message?: string;
  };

  if (!res.ok) {
    const msg =
      data.meta?.message ||
      data.message ||
      "AfterShip API error";
    throw new ApiError(res.status || 502, msg);
  }

  return data;
}

export async function registerTracking(params: {
  trackingNumber: string;
  courierSlug?: string;
  orderId: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<{ trackingId: string }> {
  const body: Record<string, unknown> = {
    tracking_number: params.trackingNumber,
    order_id: params.orderId,
  };

  if (params.courierSlug) body.slug = params.courierSlug;
  if (params.customerEmail) body.emails = [params.customerEmail];
  if (params.customerPhone) body.smses = [params.customerPhone];

  const data = await aftershipRequest<{
    data?: { id?: string };
  }>("/trackings", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const trackingId = data.data?.id;
  if (!trackingId) {
    throw new ApiError(502, "AfterShip did not return a tracking ID");
  }

  return { trackingId };
}

export interface AftershipTrackingResult {
  status: string;
  tag: string;
  checkpoints: Array<{ time: string; message: string; location: string }>;
  estimatedDelivery?: string;
  trackingUrl: string;
}

export async function getTracking(
  trackingId: string
): Promise<AftershipTrackingResult> {
  const data = await aftershipRequest<{
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
    };
  }>(`/trackings/${trackingId}`, { method: "GET" });

  const tracking = data.data ?? {};

  return {
    status: tracking.subtag_message || tracking.tag || "Unknown",
    tag: tracking.tag || "Pending",
    checkpoints: (tracking.checkpoints || []).map((cp) => ({
      time: cp.checkpoint_time || "",
      message: cp.message || "",
      location: cp.location || "",
    })),
    estimatedDelivery: tracking.expected_delivery,
    trackingUrl:
      tracking.courier_tracking_link || tracking.tracking_url || "",
  };
}

export function mapAftershipTagToOrderStatus(
  tag: string
): IOrder["status"] | null {
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

export async function registerTrackingSafe(
  params: Parameters<typeof registerTracking>[0]
): Promise<{ trackingId: string } | null> {
  if (!isAftershipConfigured()) {
    console.warn("[AfterShip] API key not configured — skipping tracking registration");
    return null;
  }

  try {
    return await registerTracking(params);
  } catch (err) {
    console.warn("[AfterShip] Failed to register tracking:", err);
    return null;
  }
}
