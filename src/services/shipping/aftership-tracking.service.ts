import { ApiError } from "../../utils/ApiError";

const API_BASE_URL = "https://api.aftership.com/tracking/2026-07";
const REQUEST_TIMEOUT_MS = 10_000;

export interface AfterShipCourier {
  slug: string;
  name: string;
}

export interface AfterShipTrackingData {
  id: string;
  tracking_number: string;
  slug?: string;
  tag?: string;
  checkpoints?: Array<{
    checkpoint_time?: string;
    message?: string;
    location?: string;
  }>;
  aftership_tracking_url?: string;
  tracking_url?: string;
}

interface AfterShipResponse<T> {
  data?: T;
  meta?: { message?: string };
  message?: string;
}

export class AfterShipTrackingClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) throw new ApiError(503, "AfterShip Tracking is not configured");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "as-api-key": this.apiKey,
          ...init.headers,
        },
      });

      let payload: AfterShipResponse<T>;
      try {
        payload = (await response.json()) as AfterShipResponse<T>;
      } catch {
        throw new ApiError(502, "AfterShip returned an invalid response");
      }

      if (!response.ok) {
        throw new ApiError(
          502,
          payload.meta?.message || payload.message || "AfterShip Tracking request failed",
        );
      }

      return payload.data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError(504, "AfterShip Tracking request timed out");
      }
      if (error instanceof TypeError) {
        throw new ApiError(502, "Could not connect to AfterShip Tracking");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(): Promise<void> {
    await this.listCouriers();
  }

  async listCouriers(): Promise<AfterShipCourier[]> {
    const data = await this.request<{
      couriers?: Array<{ slug?: string; name?: string }>;
    }>("/couriers/all");

    if (!Array.isArray(data?.couriers)) {
      throw new ApiError(502, "AfterShip did not return a courier list");
    }

    return data.couriers
      .filter(
        (courier): courier is { slug: string; name: string } =>
          typeof courier.slug === "string" && typeof courier.name === "string",
      )
      .map(({ slug, name }) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createTracking(input: {
    trackingNumber: string;
    courierSlug?: string;
    orderNumber: string;
    destinationCountry?: string;
  }): Promise<AfterShipTrackingData> {
    const tracking: Record<string, string> = {
      tracking_number: input.trackingNumber,
      order_id: input.orderNumber,
      order_number: input.orderNumber,
    };
    if (input.courierSlug) tracking.slug = input.courierSlug;
    if (input.destinationCountry) {
      tracking.destination_country_region = input.destinationCountry;
    }

    const data = await this.request<AfterShipTrackingData>("/trackings", {
      method: "POST",
      body: JSON.stringify({ tracking }),
    });

    if (!data?.id || !data.tracking_number) {
      throw new ApiError(502, "AfterShip did not return a tracking record");
    }

    return data;
  }

  async getTracking(id: string): Promise<AfterShipTrackingData> {
    const data = await this.request<AfterShipTrackingData>(
      `/trackings/${encodeURIComponent(id)}`,
    );
    if (!data?.id || !data.tracking_number) {
      throw new ApiError(502, "AfterShip did not return tracking details");
    }
    return data;
  }
}

export function getAfterShipTrackingUrl(
  tracking: AfterShipTrackingData,
  fallbackSlug?: string,
): string {
  const providerUrl =
    tracking.aftership_tracking_url ||
    tracking.tracking_url;

  if (providerUrl) {
    try {
      const parsed = new URL(providerUrl);
      if (parsed.protocol === "https:") return parsed.toString();
    } catch {
      // Fall back to the public AfterShip tracking page for malformed URLs.
    }
  }

  const path = [fallbackSlug || tracking.slug, tracking.tracking_number]
    .filter((part): part is string => Boolean(part))
    .map(encodeURIComponent)
    .join("/");
  return `https://track.aftership.com/${path}`;
}

export function mapAfterShipTagToOrderStatus(
  tag?: string,
): "processing" | "shipped" | "delivered" | null {
  const map: Record<string, "processing" | "shipped" | "delivered"> = {
    Pending: "processing",
    InfoReceived: "processing",
    InTransit: "shipped",
    OutForDelivery: "shipped",
    Delivered: "delivered",
    AttemptFail: "shipped",
    Exception: "processing",
  };
  return tag ? map[tag.trim()] ?? null : null;
}
