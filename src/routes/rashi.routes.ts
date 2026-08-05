import { Router } from "express";
import { getRashis, createRashi, updateRashi, deleteRashi } from "../controllers/rashi.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createRashiSchema, updateRashiSchema } from "../validations/rashi.validation";

export const adminRashiRouter = Router();
adminRashiRouter.use(verifyJWT, verifyAdmin);
adminRashiRouter.get("/", getRashis);
adminRashiRouter.post("/", validate(createRashiSchema), createRashi);
adminRashiRouter.patch("/:id", validate(updateRashiSchema), updateRashi);
adminRashiRouter.delete("/:id", deleteRashi);
