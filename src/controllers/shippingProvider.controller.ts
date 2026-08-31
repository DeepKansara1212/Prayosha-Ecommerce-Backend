import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { ShippingProvider } from "../models/shippingProvider.model";

function toSafeProvider(doc: InstanceType<typeof ShippingProvider>) {
  const obj = doc.toObject();
  const { credentialsEncrypted, ...safe } = obj as unknown as Record<string, unknown>;
  return { ...safe, hasCredentials: !!credentialsEncrypted };
}

// ─── GET /api/v1/admin/shipping-providers ────────────────────────────────────

export const getShippingProviders = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const providers = await ShippingProvider.find()
      .select("+credentialsEncrypted")
      .sort({ name: 1 });

    res.status(200).json(
      new ApiResponse(
        200,
        { providers: providers.map(toSafeProvider) },
        "Shipping providers fetched"
      )
    );
  }
);

// ─── PATCH /api/v1/admin/shipping-providers/:id ──────────────────────────────

export const updateShippingProvider = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { isActive, credentials } = req.body as {
      isActive?: boolean;
      credentials?: Record<string, unknown>;
    };

    const provider = await ShippingProvider.findById(req.params.id);
    if (!provider) throw new ApiError(404, "Shipping provider not found");

    if (typeof isActive === "boolean") provider.isActive = isActive;
    if (credentials) {
      // Copy-pasted keys routinely carry a trailing newline/space, which
      // AfterShip's gateway rejects as a malformed token before it ever
      // reaches app-level validation.
      const trimmed = Object.fromEntries(
        Object.entries(credentials).map(([key, value]) => [
          key,
          typeof value === "string" ? value.trim() : value,
        ])
      );
      provider.encryptCredentials(trimmed);
    }

    await provider.save();

    res
      .status(200)
      .json(new ApiResponse(200, { provider: toSafeProvider(provider) }, "Shipping provider updated"));
  }
);

// ─── POST /api/v1/admin/shipping-providers/:id/set-default ──────────────────

export const setDefaultShippingProvider = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const provider = await ShippingProvider.findById(req.params.id);
    if (!provider) throw new ApiError(404, "Shipping provider not found");

    await ShippingProvider.updateMany(
      { _id: { $ne: provider._id } },
      { $set: { isDefault: false } }
    );
    provider.isDefault = true;
    await provider.save();

    res
      .status(200)
      .json(new ApiResponse(200, { provider: toSafeProvider(provider) }, "Default shipping provider updated"));
  }
);
