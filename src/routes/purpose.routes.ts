import { Router } from "express";
import {
  getActivePurposes,
  getPurposes,
  createPurpose,
  updatePurpose,
  deletePurpose,
} from "../controllers/purpose.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createPurposeSchema, updatePurposeSchema } from "../validations/purpose.validation";

const purposeRouter = Router();
purposeRouter.get("/", getActivePurposes);

export const adminPurposeRouter = Router();
adminPurposeRouter.use(verifyJWT, verifyAdmin);
adminPurposeRouter.get("/", getPurposes);
adminPurposeRouter.post("/", validate(createPurposeSchema), createPurpose);
adminPurposeRouter.patch("/:id", validate(updatePurposeSchema), updatePurpose);
adminPurposeRouter.delete("/:id", deletePurpose);

export default purposeRouter;
