import { Router } from "express";
import {
  getShippingProviders,
  updateShippingProvider,
  setDefaultShippingProvider,
} from "../controllers/shippingProvider.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { updateShippingProviderSchema } from "../validations/shippingProvider.validation";

export const adminShippingProviderRouter = Router();

adminShippingProviderRouter.use(verifyJWT, verifyAdmin);

adminShippingProviderRouter.get("/", getShippingProviders);
adminShippingProviderRouter.patch(
  "/:id",
  validate(updateShippingProviderSchema),
  updateShippingProvider
);
adminShippingProviderRouter.post("/:id/set-default", setDefaultShippingProvider);
