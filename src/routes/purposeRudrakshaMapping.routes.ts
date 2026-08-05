import { Router } from "express";
import {
  getPurposeRudrakshaMappings,
  createPurposeRudrakshaMapping,
  updatePurposeRudrakshaMapping,
  deletePurposeRudrakshaMapping,
} from "../controllers/purposeRudrakshaMapping.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createPurposeRudrakshaMappingSchema,
  updatePurposeRudrakshaMappingSchema,
} from "../validations/purposeRudrakshaMapping.validation";

export const adminPurposeRudrakshaMappingRouter = Router();
adminPurposeRudrakshaMappingRouter.use(verifyJWT, verifyAdmin);
adminPurposeRudrakshaMappingRouter.get("/", getPurposeRudrakshaMappings);
adminPurposeRudrakshaMappingRouter.post(
  "/",
  validate(createPurposeRudrakshaMappingSchema),
  createPurposeRudrakshaMapping
);
adminPurposeRudrakshaMappingRouter.patch(
  "/:id",
  validate(updatePurposeRudrakshaMappingSchema),
  updatePurposeRudrakshaMapping
);
adminPurposeRudrakshaMappingRouter.delete("/:id", deletePurposeRudrakshaMapping);
