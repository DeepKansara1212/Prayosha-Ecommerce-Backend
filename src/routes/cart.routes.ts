import { Router } from "express";
import {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
  applyCoupon,
  removeCoupon,
} from "../controllers/cart.controller";
import { validateCoupon } from "../controllers/order.controller";
import { verifyJWT } from "../middleware/auth";

const router = Router();

// All cart routes require authentication
router.use(verifyJWT);

router.get("/", getCart);
router.post("/items", addItem);
router.patch("/items/:productId", updateItemQuantity);
router.delete("/items/:productId", removeItem);
router.delete("/", clearCart);
// /coupon/validate must be defined before /coupon to avoid prefix shadowing
router.post("/coupon/validate", validateCoupon);
router.post("/coupon", applyCoupon);
router.delete("/coupon", removeCoupon);

export default router;
