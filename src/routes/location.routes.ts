import { Router } from "express";
import { searchLocationsHandler } from "../controllers/location.controller";
import { validate } from "../middleware/validate";
import { searchLocationQuerySchema } from "../validations/location.validation";

const locationRouter = Router();

locationRouter.get("/search", validate(searchLocationQuerySchema, "query"), searchLocationsHandler);

export default locationRouter;
