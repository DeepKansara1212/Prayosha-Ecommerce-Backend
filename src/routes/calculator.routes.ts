import { Router } from "express";
import { submitBraceletCalculator, submitRudrakshaCalculator } from "../controllers/calculator.controller";
import { validate } from "../middleware/validate";
import { braceletCalculatorSchema, rudrakshaCalculatorSchema } from "../validations/calculator.validation";

const calculatorRouter = Router();

calculatorRouter.post("/bracelet", validate(braceletCalculatorSchema), submitBraceletCalculator);
calculatorRouter.post("/rudraksha", validate(rudrakshaCalculatorSchema), submitRudrakshaCalculator);

export default calculatorRouter;
