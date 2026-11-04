import { ApiError } from "../../utils/ApiError";
import { ShippingProvider } from "../../models/shippingProvider.model";
import { IShippingProvider } from "./types";
import { ShiprocketProvider, ShiprocketCredentials } from "./providers/shiprocket.provider";
import { AfterShipTrackingClient } from "./aftership-tracking.service";

export interface RegisteredProviderMeta {
  slug: string;
  name: string;
  description: string;
}

export const REGISTERED_PROVIDERS: RegisteredProviderMeta[] = [
  { slug: "shiprocket", name: "ShipRocket", description: "Order fulfillment & courier aggregation for India." },
  { slug: "aftership", name: "AfterShip Tracking", description: "Track shipments created with your chosen courier." },
];

function buildInstance(slug: string, credentials: Record<string, unknown>): IShippingProvider {
  switch (slug) {
    case "shiprocket":
      return new ShiprocketProvider(credentials as unknown as ShiprocketCredentials);
    default:
      throw new ApiError(400, `Unknown shipping provider "${slug}"`);
  }
}

function buildAfterShipTrackingClient(
  credentials: Record<string, unknown>,
): AfterShipTrackingClient {
  const apiKey = credentials.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new ApiError(503, "AfterShip Tracking API key is not configured");
  }
  return new AfterShipTrackingClient(apiKey);
}

export const ShippingFactory = {
  async getProvider(slug: string): Promise<IShippingProvider> {
    if (slug === "aftership") {
      throw new ApiError(400, "AfterShip is tracking-only and cannot create shipping labels");
    }

    const providerDoc = await ShippingProvider.findOne({ slug }).select("+credentialsEncrypted");
    if (!providerDoc) {
      throw new ApiError(400, `Shipping provider "${slug}" is not registered`);
    }
    if (!providerDoc.isActive) {
      throw new ApiError(400, `Shipping provider "${providerDoc.name}" is disabled`);
    }
    if (!providerDoc.isVerified) {
      throw new ApiError(
        400,
        `Shipping provider "${providerDoc.name}" has not passed a connection test`
      );
    }

    const credentials = providerDoc.decryptCredentials();
    if (!credentials) {
      throw new ApiError(503, `Shipping provider "${providerDoc.name}" has no credentials configured`);
    }

    return buildInstance(slug, credentials);
  },

  async getAfterShipTrackingClient(): Promise<AfterShipTrackingClient> {
    const providerDoc = await ShippingProvider.findOne({ slug: "aftership" })
      .select("+credentialsEncrypted");
    if (!providerDoc || !providerDoc.isActive) {
      throw new ApiError(400, "AfterShip Tracking is disabled");
    }
    if (!providerDoc.isVerified) {
      throw new ApiError(400, "AfterShip Tracking has not passed a connection test");
    }

    const credentials = providerDoc.decryptCredentials();
    if (!credentials) {
      throw new ApiError(503, "AfterShip Tracking has no API key configured");
    }
    return buildAfterShipTrackingClient(credentials);
  },

  async testProviderConnection(slug: string): Promise<void> {
    const providerDoc = await ShippingProvider.findOne({ slug }).select("+credentialsEncrypted");
    if (!providerDoc) {
      throw new ApiError(400, `Shipping provider "${slug}" is not registered`);
    }

    const credentials = providerDoc.decryptCredentials();
    if (!credentials) {
      throw new ApiError(400, `Add credentials for "${providerDoc.name}" before testing the connection`);
    }

    if (slug === "aftership") {
      await buildAfterShipTrackingClient(credentials).testConnection();
      return;
    }

    const instance = buildInstance(slug, credentials);
    await instance.testConnection();
  },
};
