import { Router } from "express";
import {
  getRudrakshaTypes,
  createRudrakshaType,
  updateRudrakshaType,
  deleteRudrakshaType,
} from "../controllers/rudrakshaType.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createRudrakshaTypeSchema,
  updateRudrakshaTypeSchema,
} from "../validations/rudrakshaType.validation";

export const adminRudrakshaTypeRouter = Router();
adminRudrakshaTypeRouter.use(verifyJWT, verifyAdmin);
adminRudrakshaTypeRouter.get("/", getRudrakshaTypes);
adminRudrakshaTypeRouter.post("/", validate(createRudrakshaTypeSchema), createRudrakshaType);
adminRudrakshaTypeRouter.patch("/:id", validate(updateRudrakshaTypeSchema), updateRudrakshaType);
adminRudrakshaTypeRouter.delete("/:id", deleteRudrakshaType);
