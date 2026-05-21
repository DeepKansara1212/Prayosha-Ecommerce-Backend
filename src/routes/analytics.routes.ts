import { Router } from "express";
import {
  getOverview,
  getSalesOverTime,
  getOrdersByStatus,
  getLowStockProducts,
} from "../controllers/analytics.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

const router = Router();

router.use(verifyJWT, verifyAdmin);

router.get("/overview", getOverview);
router.get("/sales", getSalesOverTime);
router.get("/orders-by-status", getOrdersByStatus);
router.get("/low-stock", getLowStockProducts);

export default router;
