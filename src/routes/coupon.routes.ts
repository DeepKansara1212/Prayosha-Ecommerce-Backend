import { Router } from "express";
import { getCoupons, createCoupon, updateCoupon } from "../controllers/coupon.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

export const adminCouponRouter = Router();

adminCouponRouter.use(verifyJWT, verifyAdmin);

adminCouponRouter.get("/",    getCoupons);
adminCouponRouter.post("/",   createCoupon);
adminCouponRouter.patch("/:id", updateCoupon);
