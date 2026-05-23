# Prayosha Backend

A production-ready REST API for the Prayosha Crystal e-commerce platform, built with Express, TypeScript, and MongoDB.

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT (access + refresh tokens), bcryptjs, OTP |
| Payments | Razorpay |
| Image hosting | Cloudinary |
| File upload | Multer + multer-storage-cloudinary |
| Validation | Zod |
| Email | Nodemailer |
| HTTP logging | Morgan |
| Security | Helmet, CORS, express-rate-limit, express-mongo-sanitize, hpp |
| Dev tooling | ts-node, nodemon |

## Getting started

Install dependencies:

```bash
cd Backend
npm install
```

Create a `.env` file at the project root (see [Environment variables](#environment-variables) below).

Start the development server:

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:8000
```

Health check:

```text
GET http://localhost:8000/api/health
```

Build for production:

```bash
npm run build
node dist/server.js
```

Run the database index script once after first deployment:

```bash
npx ts-node src/scripts/createIndexes.ts
```

## Scripts

- `dev` — start the server with nodemon (auto-reload on `.ts` / `.json` changes)
- `build` — compile TypeScript to `dist/`
- `start` — run the compiled production build
- `lint` — run ESLint across `src/`

## Environment variables

All variables are validated at startup via Zod. The server exits immediately if any required variable is missing.

```text
# Server
PORT=8000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/database_name

# JWT
JWT_SECRET=<your_secret_min_32_chars>
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=<your_refresh_secret_min_32_chars>
REFRESH_TOKEN_EXPIRY=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>
CLOUDINARY_API_SECRET=<api_secret>

# Razorpay (optional — Razorpay endpoints return 503 without these)
RAZORPAY_KEY_ID=<key_id>
RAZORPAY_KEY_SECRET=<key_secret>

# Email / Nodemailer (optional — order confirmation emails are silently skipped without these)
EMAIL_USER=<gmail_address>
EMAIL_PASS=<app_password>

# CORS origins
FRONTEND_URL=http://localhost:5173
ADMIN_URL=http://localhost:5174
```

## Architecture

The project follows an MVC pattern:

```
src/
    config/                 # env validation, DB connection, CORS options
    controllers/            # route handler logic
    middleware/             # auth, validation, error handling, upload, rate limiting
    models/                 # Mongoose schemas and instance methods
    routes/                 # Express routers
    scripts/                # one-time maintenance scripts (createIndexes.ts)
    utils/                  # ApiError, ApiResponse, asyncHandler, pagination, sms
    validations/            # Zod schemas shared by routes
    app.ts                  # Express app setup and route registration
    server.ts               # HTTP server bootstrap and DB connection
```

### Request lifecycle

```
Request → CORS → Helmet → Morgan → Body parser → Cookie parser
        → mongoSanitize → hpp → Rate limiter → Route match
        → verifyJWT (if protected) → verifyAdmin (if admin)
        → validate(schema) → controller → asyncHandler → errorHandler
```

### Error handling

All controllers are wrapped with `asyncHandler` to forward unhandled promise rejections to the global `errorHandler` middleware. Controllers throw `ApiError` instances for domain errors; the handler serialises them to a consistent JSON shape:

```json
{
    "statusCode": 422,
    "success": false,
    "message": "Validation failed",
    "errors": [{ "field": "phone", "message": "Invalid phone number" }]
}
```

Success responses use `ApiResponse<T>`:

```json
{
    "statusCode": 200,
    "success": true,
    "message": "Products fetched",
    "data": { ... }
}
```

## Security hardening

### Rate limiting (`src/middleware/rateLimiter.ts`)

| Limiter | Routes | Window | Max requests |
| --- | --- | --- | --- |
| `generalLimiter` | All `/api/v1/*` | 15 min | 100 per IP |
| `authLimiter` | `/api/v1/auth/*` | 15 min | 10 per IP |
| `uploadLimiter` | Product image upload | 15 min | 20 per IP |

Rate-limit headers follow the `RateLimit-*` standard (RFC draft). The `X-RateLimit-*` legacy headers are disabled. Exceeded limits return `429` with a JSON error body.

### Data sanitization

- **`express-mongo-sanitize`** — strips `$` and `.` characters from user input, preventing NoSQL injection attacks.
- **`hpp`** — removes duplicate query-string keys, preventing HTTP parameter pollution.

### Helmet

Helmet sets secure HTTP headers (including `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.). `contentSecurityPolicy` is disabled for now to avoid blocking frontend requests during development.

### Database indexes (`src/scripts/createIndexes.ts`)

Run once after the first deployment:

```bash
npx ts-node src/scripts/createIndexes.ts
```

Indexes created:

| Collection | Index | Options |
| --- | --- | --- |
| `products` | `{ slug: 1 }` | unique |
| `products` | `{ category: 1, isActive: 1 }` | |
| `products` | `{ isFeatured: 1, isActive: 1 }` | |
| `products` | text on `name`, `description`, `tags` | |
| `orders` | `{ user: 1, createdAt: -1 }` | |
| `orders` | `{ orderNumber: 1 }` | unique |
| `orders` | `{ status: 1 }` | |
| `orders` | `{ paymentStatus: 1 }` | |
| `users` | `{ email: 1 }` | unique, sparse |
| `reviews` | `{ product: 1, isApproved: 1 }` | |
| `reviews` | `{ product: 1, user: 1 }` | unique |
| `carts` | `{ user: 1 }` | unique |

## API reference

Base path: `/api/v1`

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | Public | Register (name, phone, password, email?) |
| POST | `/send-otp` | Public | Send OTP to phone (login / register / reset) |
| POST | `/verify-otp` | Public | Verify OTP and issue tokens |
| POST | `/refresh-token` | Public | Refresh access token |
| POST | `/forgot-password` | Public | Initiate password reset |
| POST | `/reset-password` | Public | Set new password with OTP |
| POST | `/logout` | JWT | Invalidate refresh token |
| GET | `/me` | JWT | Get current user profile |
| PATCH | `/me` | JWT | Update name, phone, avatar |
| PATCH | `/change-password` | JWT | Change password |
| POST | `/me/addresses` | JWT | Add delivery address |
| PATCH | `/me/addresses/:id` | JWT | Update address |
| DELETE | `/me/addresses/:id` | JWT | Delete address |

### Products — `/api/v1/products`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | List products (filter, sort, paginate) |
| GET | `/featured` | Public | Get featured products |
| GET | `/:slug` | Public | Get product by slug |
| GET | `/:slug/related` | Public | Get related products |
| POST | `/` | Admin | Create product |
| PATCH | `/:id` | Admin | Update product |
| DELETE | `/:id` | Admin | Delete product |
| POST | `/:id/images` | Admin | Upload images (max 6) |
| DELETE | `/:id/images` | Admin | Delete a product image |

**Product list query params:** `category`, `search`, `sort` (`price_asc`, `price_desc`, `newest`, `rating`), `minPrice`, `maxPrice`, `badge`, `chakra`, `inStock`, `page`, `limit`

### Reviews — `/api/v1/products/:slug/reviews`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | Get approved reviews for product |
| POST | `/` | JWT | Submit a review |

### Categories — `/api/v1/categories`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | Get all active categories |

### Cart — `/api/v1/cart`

All endpoints require JWT.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Get cart |
| POST | `/items` | Add item (productId, quantity) |
| PATCH | `/items/:productId` | Update item quantity |
| DELETE | `/items/:productId` | Remove item |
| DELETE | `/` | Clear cart |
| POST | `/coupon/validate` | Validate coupon code |
| POST | `/coupon` | Apply coupon |
| DELETE | `/coupon` | Remove coupon |

### Wishlist — `/api/v1/wishlist`

All endpoints require JWT.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Get wishlist |
| POST | `/:productId` | Add to wishlist |
| DELETE | `/:productId` | Remove from wishlist |
| DELETE | `/` | Clear wishlist |

### Orders — `/api/v1/orders`

All endpoints require JWT.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/cod` | Place COD order |
| POST | `/razorpay/create` | Create Razorpay order |
| POST | `/razorpay/verify` | Verify payment signature |
| GET | `/` | Get user orders (paginated) |
| GET | `/:orderNumber` | Get order by order number |

### Search — `/api/v1/search`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | Full-text product search (`q`, `limit`) |

### Newsletter — `/api/v1/newsletter`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/subscribe` | Public | Subscribe email |

### Admin — `/api/v1/admin/*`

All admin routes require JWT + `role: "admin"`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/orders` | List all orders (paginated) |
| GET | `/orders/:id` | Get order by ID |
| PATCH | `/orders/:id/status` | Update order status |
| GET | `/reviews` | List all reviews |
| PATCH | `/reviews/:id/approve` | Approve a review |
| DELETE | `/reviews/:id` | Delete a review |
| GET | `/categories` | List all categories (including inactive) |
| POST | `/categories` | Create category (with image) |
| PATCH | `/categories/:id` | Update category |
| DELETE | `/categories/:id` | Delete category |
| GET | `/coupons` | List all coupons |
| POST | `/coupons` | Create coupon |
| PATCH | `/coupons/:id` | Update coupon |
| GET | `/customers` | List customers (searchable, paginated) |
| GET | `/analytics/overview` | Sales overview metrics |
| GET | `/analytics/sales` | Sales over time (period-based) |
| GET | `/analytics/orders-by-status` | Order status breakdown |
| GET | `/analytics/low-stock` | Products below `lowStockThreshold` |

## Data models

### User

```
name                    string              required
email                   string              optional, unique (sparse)
phone                   string              required, unique
password                string              hashed, excluded from queries
role                    customer | admin    default: customer
avatar                  string              optional
isVerified              boolean             default: false
refreshToken            string              excluded from queries
otp                     string              hashed, excluded from queries
otpExpiry               Date                excluded from queries
addresses[]
    label               home | work | other
    fullName            string
    phone               string
    line1               string
    line2               string              optional
    city                string
    state               string
    pincode             string              6 digits
    isDefault           boolean
wishlist[]              ObjectId[]          references Product
```

Instance methods: `isPasswordCorrect(password)`, `generateAccessToken()`, `generateRefreshToken()`

### Product

```
name                                string              required
slug                                string              unique, auto-generated
sku                                 string              unique, uppercase
description                         string              required
shortDescription                    string              max 200 chars
price                               number              required, min 0
comparePrice                        number              optional
costPrice                           number              optional, excluded from queries
images[]                            string[]            max 6 URLs
category                            ObjectId            references Category
tags[]                              string[]
chakra                              string              optional
badge                               BESTSELLER | NEW | LIMITED | RARE | GIFT SET
stock                               number              default 0
lowStockThreshold                   number              default 5
weight                              number              optional
dimensions                          { l, w, h }         optional
careInstructions                    string              optional
metaphysicalProperties              string              optional
isFeatured                          boolean             default false
isActive                            boolean             default true
ratings                             { average, count }
```

Indexes: `slug`, `category + isActive`, `isFeatured + isActive`, full-text on `name + description + tags`

### Order

```
orderNumber             string              PC-YYYY-######, unique
user                    ObjectId            references User
items[]
    product             ObjectId
    name, image, sku, price, quantity
shippingAddress         { fullName, phone, line1, line2?, city, state, pincode }
subtotal                number
discount                number              default 0
couponCode              string              optional
shippingCharge          number              default 0
tax                     number              default 0
total                   number
paymentMethod           razorpay | cod
paymentStatus           pending | paid | failed | refunded
razorpayOrderId         string              optional
razorpayPaymentId       string              optional
status                  placed | confirmed | processing | shipped | delivered | cancelled | refunded
trackingNumber          string              optional
statusHistory[]         { status, note, timestamp }
notes                   string              optional
```

### Review

```
product                     ObjectId            references Product
user                        ObjectId            references User
rating                      number              1–5, required
title                       string              max 100 chars
body                        string              max 1000 chars
isVerifiedPurchase          boolean             default false
isApproved                  boolean             default false
```

Unique index on `product + user` (one review per product per user).

### Coupon

```
code                    string              unique, uppercase
discountType            flat | percent
discountValue           number              min 0
minOrderValue           number              default 0
maxUsage                number              default 1
usedCount               number              default 0
validFrom               Date
validUntil              Date
isActive                boolean             default true
```

### Cart

```
user                    ObjectId            unique, references User
items[]
    product             ObjectId            references Product
    quantity            number              min 1
    priceAtAdd          number
couponApplied           string              optional
```

### Category

```
name                string              required
slug                string              unique, auto-generated
description         string              optional
image               string              optional
isActive            boolean             default true
sortOrder           number              default 0
```

### Newsletter subscriber

```
email               string              unique, lowercase
subscribedAt        Date                default now
```

## Middleware

### `verifyJWT`

Reads the bearer token from the `Authorization` header or `accessToken` cookie, verifies the signature, loads the full user document (excluding sensitive fields), and attaches it to `req.user`. Returns `401` on missing, expired, or invalid tokens.

### `verifyAdmin`

Checks `req.user.role === "admin"`. Returns `403` if not. Applied after `verifyJWT`.

### `validate(schema, target?)`

Zod-based validation factory. Validates `req.body` (default), `req.query`, or `req.params` against the provided schema. Returns `422` with per-field errors on failure.

### `upload`

Multer instance backed by Cloudinary storage. Accepts JPG, PNG, and WebP up to 5 MB per file (max 6 files per request). Images are auto-transformed to 1200 × 1200 px with automatic quality optimisation and stored under the `prayosha-products` folder.

### `errorHandler`

Global Express error middleware. Serialises `ApiError` instances to structured JSON. In development, includes the stack trace.

### `generalLimiter` / `authLimiter` / `uploadLimiter`

`express-rate-limit` middleware. See [Rate limiting](#rate-limiting) above.

## CORS

Allowed origins: `localhost:5173`, `localhost:5174`, `FRONTEND_URL`, `ADMIN_URL`. Requests with no origin (Postman, mobile apps) are also permitted. Credentials (cookies) are enabled.

## Database

MongoDB via Mongoose. The connection module retries up to 3 times with 3-second delays before exiting. Slug fields on `Product` and `Category` are auto-generated from `name` via a `pre("save")` hook.

## Payment flow (Razorpay)

1. Client calls `POST /api/v1/orders/razorpay/create` → server creates a Razorpay order and returns `razorpay_order_id`.
2. Client opens Razorpay checkout and completes payment.
3. Client calls `POST /api/v1/orders/razorpay/verify` with `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
4. Server verifies the HMAC signature; on success, marks the order `paymentStatus: "paid"` and `status: "confirmed"` and clears the cart.

## Image upload flow (Cloudinary)

- Products: `POST /api/v1/products/:id/images` (admin) — multipart form, up to 6 files.
- Categories: `POST /api/v1/admin/categories` / `PATCH /api/v1/admin/categories/:id` — single file.
- Direct buffer upload helper `uploadToCloudinary(buffer, folder)` is available for programmatic uploads.
- `deleteFromCloudinary(publicId)` cleans up removed images.

## OTP / SMS

In development, OTPs are printed to the server console. The `sendSms` utility is a placeholder with commented examples for Twilio, MSG91, and Fast2SMS — replace with your chosen provider before deploying.

## Folder structure

```text
Backend/
    src/
        config/
            corsOptions.ts              # CORS allow-list
            db.ts                       # MongoDB connection with retry
            env.ts                      # Zod env schema validation
        controllers/
            analytics.controller.ts
            auth.controller.ts
            cart.controller.ts
            category.controller.ts
            coupon.controller.ts
            customer.controller.ts
            order.controller.ts
            product.controller.ts
            review.controller.ts
            search.controller.ts
            wishlist.controller.ts
        middleware/
            auth.ts                     # verifyJWT, verifyAdmin
            errorHandler.ts             # global error serialiser
            rateLimiter.ts              # express-rate-limit instances
            upload.ts                   # Multer + Cloudinary
            validate.ts                 # Zod request validator
        models/
            cart.model.ts
            category.model.ts
            coupon.model.ts
            newsletter.model.ts
            order.model.ts
            product.model.ts
            review.model.ts
            user.model.ts
        routes/
            analytics.routes.ts
            auth.routes.ts
            cart.routes.ts
            category.routes.ts
            coupon.routes.ts
            customer.routes.ts
            newsletter.routes.ts
            order.routes.ts
            product.routes.ts           # includes nested /reviews
            review.routes.ts
            search.routes.ts
            wishlist.routes.ts
        scripts/
            createIndexes.ts            # run once to ensure all DB indexes exist
        utils/
            ApiError.ts                 # structured error class
            ApiResponse.ts              # structured success class
            asyncHandler.ts             # async wrapper for controllers
            pagination.ts               # PaginationMeta helper
            sms.ts                      # OTP delivery (stub)
        validations/
            auth.validation.ts          # registerSchema, loginSchema, resetPasswordSchema
            order.validation.ts         # createOrderSchema, razorpayVerifySchema, updateOrderStatusSchema
            product.validation.ts       # createProductSchema, updateProductSchema
            review.validation.ts        # submitReviewSchema
        app.ts                          # Express app + middleware + route registration
        server.ts                       # HTTP server bootstrap
    dist/                               # compiled output (git-ignored)
    .env                                # local environment variables (git-ignored)
    nodemon.json
    package.json
    tsconfig.json
```

## Useful references

- Express: https://expressjs.com
- Mongoose: https://mongoosejs.com
- Zod: https://zod.dev
- Razorpay Node SDK: https://github.com/razorpay/razorpay-node
- Cloudinary Node SDK: https://cloudinary.com/documentation/node_integration
- JWT: https://github.com/auth0/node-jsonwebtoken
- Nodemailer: https://nodemailer.com
