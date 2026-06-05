import { Router } from "express";
import {
  getPublicSettings,
  getAdminSettings,
  updateAdminSettings,
} from "../controllers/settings.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { settingsUpdateSchema } from "../validations/settings.validation";

// ─── Public ───────────────────────────────────────────────────────────────────

const settingsRouter = Router();
settingsRouter.get("/", getPublicSettings);
export default settingsRouter;

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminSettingsRouter = Router();
adminSettingsRouter.use(verifyJWT, verifyAdmin);

adminSettingsRouter.get("/", getAdminSettings);
adminSettingsRouter.patch("/", validate(settingsUpdateSchema), updateAdminSettings);
