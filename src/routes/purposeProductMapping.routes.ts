import { Router } from "express";
import {
  getPurposeProductMappings,
  createPurposeProductMapping,
  updatePurposeProductMapping,
  deletePurposeProductMapping,
} from "../controllers/purposeProductMapping.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createPurposeProductMappingSchema,
  updatePurposeProductMappingSchema,
} from "../validations/purposeProductMapping.validation";

export const adminPurposeProductMappingRouter = Router();
adminPurposeProductMappingRouter.use(verifyJWT, verifyAdmin);
adminPurposeProductMappingRouter.get("/", getPurposeProductMappings);
adminPurposeProductMappingRouter.post(
  "/",
  validate(createPurposeProductMappingSchema),
  createPurposeProductMapping
);
adminPurposeProductMappingRouter.patch(
  "/:id",
  validate(updatePurposeProductMappingSchema),
  updatePurposeProductMapping
);
adminPurposeProductMappingRouter.delete("/:id", deletePurposeProductMapping);
