import { Router } from "express";
import { getCustomers } from "../controllers/customer.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

export const adminCustomerRouter = Router();

adminCustomerRouter.use(verifyJWT, verifyAdmin);

adminCustomerRouter.get("/", getCustomers);
