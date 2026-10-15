import { Router } from "express";
import {
  createMeaning,
  deleteMeaning,
  getActiveMeanings,
  getMeanings,
  updateMeaning,
} from "../controllers/meaning.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createMeaningSchema, updateMeaningSchema } from "../validations/meaning.validation";

const meaningRouter = Router();
meaningRouter.get("/", getActiveMeanings);

export const adminMeaningRouter = Router();
adminMeaningRouter.use(verifyJWT, verifyAdmin);
adminMeaningRouter.get("/", getMeanings);
adminMeaningRouter.post("/", validate(createMeaningSchema), createMeaning);
adminMeaningRouter.patch("/:id", validate(updateMeaningSchema), updateMeaning);
adminMeaningRouter.delete("/:id", deleteMeaning);

export default meaningRouter;
