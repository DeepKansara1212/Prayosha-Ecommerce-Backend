import { ApiError } from "../../utils/ApiError";
import { ShippingProvider } from "../../models/shippingProvider.model";
import { IShippingProvider } from "./types";
import { ShiprocketProvider, ShiprocketCredentials } from "./providers/shiprocket.provider";
import { AfterShipProvider, AftershipCredentials } from "./providers/aftership.provider";

export interface RegisteredProviderMeta {
  slug: string;
  name: string;
  description: string;
}

// Adding a new provider: create a `providers/<slug>.provider.ts` class
// implementing IShippingProvider, add one entry here, and one case in
// buildInstance() below. No controller or frontend change is required —
// the Admin "Shipping" page and Order Detail dropdown both read this list.
export const REGISTERED_PROVIDERS: RegisteredProviderMeta[] = [
  { slug: "shiprocket", name: "ShipRocket", description: "Order fulfillment & courier aggregation for India." },
  { slug: "aftership", name: "AfterShip Shipping", description: "Multi-carrier shipping & label purchase." },
];

function buildInstance(slug: string, credentials: Record<string, unknown>): IShippingProvider {
  switch (slug) {
    case "shiprocket":
      return new ShiprocketProvider(credentials as unknown as ShiprocketCredentials);
    case "aftership":
      return new AfterShipProvider(credentials as unknown as AftershipCredentials);
    default:
      throw new ApiError(400, `Unknown shipping provider "${slug}"`);
  }
}

export const ShippingFactory = {
  async getProvider(slug: string): Promise<IShippingProvider> {
    const providerDoc = await ShippingProvider.findOne({ slug }).select("+credentialsEncrypted");
    if (!providerDoc) {
      throw new ApiError(400, `Shipping provider "${slug}" is not registered`);
    }
    if (!providerDoc.isActive) {
      throw new ApiError(400, `Shipping provider "${providerDoc.name}" is disabled`);
    }

    const credentials = providerDoc.decryptCredentials();
    if (!credentials) {
      throw new ApiError(503, `Shipping provider "${providerDoc.name}" has no credentials configured`);
    }

    return buildInstance(slug, credentials);
  },
};
