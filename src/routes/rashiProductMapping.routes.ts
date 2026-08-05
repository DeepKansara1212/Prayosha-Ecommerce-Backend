import { Router } from "express";
import {
  getRashiProductMappings,
  createRashiProductMapping,
  updateRashiProductMapping,
  deleteRashiProductMapping,
} from "../controllers/rashiProductMapping.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createRashiProductMappingSchema,
  updateRashiProductMappingSchema,
} from "../validations/rashiProductMapping.validation";

export const adminRashiProductMappingRouter = Router();
adminRashiProductMappingRouter.use(verifyJWT, verifyAdmin);
adminRashiProductMappingRouter.get("/", getRashiProductMappings);
adminRashiProductMappingRouter.post(
  "/",
  validate(createRashiProductMappingSchema),
  createRashiProductMapping
);
adminRashiProductMappingRouter.patch(
  "/:id",
  validate(updateRashiProductMappingSchema),
  updateRashiProductMapping
);
adminRashiProductMappingRouter.delete("/:id", deleteRashiProductMapping);
