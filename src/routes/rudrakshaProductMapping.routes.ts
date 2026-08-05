import { Router } from "express";
import {
  getRudrakshaProductMappings,
  createRudrakshaProductMapping,
  updateRudrakshaProductMapping,
  deleteRudrakshaProductMapping,
} from "../controllers/rudrakshaProductMapping.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createRudrakshaProductMappingSchema,
  updateRudrakshaProductMappingSchema,
} from "../validations/rudrakshaProductMapping.validation";

export const adminRudrakshaProductMappingRouter = Router();
adminRudrakshaProductMappingRouter.use(verifyJWT, verifyAdmin);
adminRudrakshaProductMappingRouter.get("/", getRudrakshaProductMappings);
adminRudrakshaProductMappingRouter.post(
  "/",
  validate(createRudrakshaProductMappingSchema),
  createRudrakshaProductMapping
);
adminRudrakshaProductMappingRouter.patch(
  "/:id",
  validate(updateRudrakshaProductMappingSchema),
  updateRudrakshaProductMapping
);
adminRudrakshaProductMappingRouter.delete("/:id", deleteRudrakshaProductMapping);
