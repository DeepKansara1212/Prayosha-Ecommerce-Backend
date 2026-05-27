import { Router } from "express";
import { getCoupons, createCoupon, updateCoupon } from "../controllers/coupon.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createCouponSchema, updateCouponSchema } from "../validations/coupon.validation";

export const adminCouponRouter = Router();

adminCouponRouter.use(verifyJWT, verifyAdmin);

adminCouponRouter.get("/",      getCoupons);
adminCouponRouter.post("/",     validate(createCouponSchema), createCoupon);
adminCouponRouter.patch("/:id", validate(updateCouponSchema), updateCoupon);
