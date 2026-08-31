import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import { corsOptions } from "./config/corsOptions";
import { errorHandler } from "./middleware/errorHandler";
import { generalLimiter } from "./middleware/rateLimiter";
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
import blogRoutes, { adminBlogRouter } from "./routes/blog.routes";
import heroBannerRoutes, { adminHeroBannerRouter } from "./routes/heroBanner.routes";
import rewardRouter from "./routes/reward.routes";
import settingsRouter, { adminSettingsRouter } from "./routes/settings.routes";
import { webhookRouter, adminShippingRouter } from "./routes/shipping.routes";
import { adminShippingProviderRouter } from "./routes/shippingProvider.routes";
import calculatorRoutes from "./routes/calculator.routes";
import locationRoutes from "./routes/location.routes";
import purposeRoutes, { adminPurposeRouter } from "./routes/purpose.routes";
import { adminRashiRouter } from "./routes/rashi.routes";
import { adminRudrakshaTypeRouter } from "./routes/rudrakshaType.routes";
import { adminRashiProductMappingRouter } from "./routes/rashiProductMapping.routes";
import { adminPurposeProductMappingRouter } from "./routes/purposeProductMapping.routes";
import { adminPurposeRudrakshaMappingRouter } from "./routes/purposeRudrakshaMapping.routes";
import { adminRudrakshaProductMappingRouter } from "./routes/rudrakshaProductMapping.routes";
import { adminCalculatorLeadRouter } from "./routes/calculatorLead.routes";

const app = express();

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(morgan("dev"));

// Webhook routes — before global body parser (each route has its own parser)
app.use("/api/v1/webhooks", webhookRouter);

// Body parsers
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Cookie parser (required for refreshToken cookie reads)
app.use(cookieParser());

// Data sanitization — must run after body parsers
app.use(mongoSanitize());
app.use(hpp());

// Health check (no rate limit)
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

// Rate limiting
app.use("/api/v1", generalLimiter);

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/admin/orders", adminShippingRouter);
app.use("/api/v1/admin/orders", adminOrderRouter);
app.use("/api/v1/admin/shipping-providers", adminShippingProviderRouter);
app.use("/api/v1/admin/reviews", adminReviewRouter);
app.use("/api/v1/admin/categories", adminCategoryRouter);
app.use("/api/v1/admin/coupons", adminCouponRouter);
app.use("/api/v1/admin/customers", adminCustomerRouter);
app.use("/api/v1/search", searchRoutes);
app.use("/api/v1/admin/analytics", analyticsRoutes);
app.use("/api/v1/newsletter", newsletterRoutes);
app.use("/api/v1/blogs", blogRoutes);
app.use("/api/v1/admin/blogs", adminBlogRouter);
app.use("/api/v1/hero-banners", heroBannerRoutes);
app.use("/api/v1/admin/hero-banners", adminHeroBannerRouter);
app.use("/api/v1/rewards", rewardRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/admin/settings", adminSettingsRouter);
app.use("/api/v1/calculators", calculatorRoutes);
app.use("/api/v1/location", locationRoutes);
app.use("/api/v1/purposes", purposeRoutes);
app.use("/api/v1/admin/purposes", adminPurposeRouter);
app.use("/api/v1/admin/rashis", adminRashiRouter);
app.use("/api/v1/admin/rudraksha-types", adminRudrakshaTypeRouter);
app.use("/api/v1/admin/rashi-product-mappings", adminRashiProductMappingRouter);
app.use("/api/v1/admin/purpose-product-mappings", adminPurposeProductMappingRouter);
app.use("/api/v1/admin/purpose-rudraksha-mappings", adminPurposeRudrakshaMappingRouter);
app.use("/api/v1/admin/rudraksha-product-mappings", adminRudrakshaProductMappingRouter);
app.use("/api/v1/admin/calculator-leads", adminCalculatorLeadRouter);

// Global error handler — must be last
app.use(errorHandler);

export default app;
