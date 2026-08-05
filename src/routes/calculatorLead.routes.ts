import { Router } from "express";
import { getCalculatorLeads } from "../controllers/calculatorLead.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

export const adminCalculatorLeadRouter = Router();
adminCalculatorLeadRouter.use(verifyJWT, verifyAdmin);
adminCalculatorLeadRouter.get("/", getCalculatorLeads);
