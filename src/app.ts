import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { corsOptions } from "./config/corsOptions";
import { errorHandler } from "./middleware/errorHandler";
import { ApiResponse } from "./utils/ApiResponse";
import authRoutes from "./routes/auth.routes";
import categoryRoutes, { adminCategoryRouter } from "./routes/category.routes";
import productRoutes from "./routes/product.routes";
import cartRoutes from "./routes/cart.routes";
import wishlistRoutes from "./routes/wishlist.routes";
import { orderRouter, adminOrderRouter } from "./routes/order.routes";
import { adminReviewRouter } from "./routes/review.routes";
import { adminCouponRouter } from "./routes/coupon.routes";
import { adminCustomerRouter } from "./routes/customer.routes";
import searchRoutes from "./routes/search.routes";
import analyticsRoutes from "./routes/analytics.routes";
import newsletterRoutes from "./routes/newsletter.routes";

const app = express();

// Security & logging
app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan("dev"));

// Body parsers
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Cookie parser (required for refreshToken cookie reads)
app.use(cookieParser());

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { timestamp: new Date().toISOString() },
        "Prayosha API is running"
      )
    );
});

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/admin/orders", adminOrderRouter);
app.use("/api/v1/admin/reviews", adminReviewRouter);
app.use("/api/v1/admin/categories", adminCategoryRouter);
app.use("/api/v1/admin/coupons", adminCouponRouter);
app.use("/api/v1/admin/customers", adminCustomerRouter);
app.use("/api/v1/search", searchRoutes);
app.use("/api/v1/admin/analytics", analyticsRoutes);
app.use("/api/v1/newsletter", newsletterRoutes);

// Global error handler — must be last
app.use(errorHandler);

export default app;
