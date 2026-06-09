# Prayosha Backend

Production-ready REST API for the **Prayosha Crystal** e-commerce platform. Built with Express 4, TypeScript 5, and MongoDB (Mongoose 8). Powers the customer storefront, admin dashboard, payments (Razorpay), image hosting (Cloudinary), and content (blogs, hero banners).

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Getting started](#getting-started)
3. [Scripts](#scripts)
4. [Environment variables](#environment-variables)
5. [Architecture](#architecture)
6. [Security](#security)
7. [API reference](#api-reference)
8. [Data models](#data-models)
9. [Middleware](#middleware)
10. [Flows](#flows)
11. [Folder structure](#folder-structure)
12. [Feature checklist](#feature-checklist)
13. [Useful references](#useful-references)

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT (access + refresh), bcryptjs, phone OTP |
| Payments | Razorpay (optional — graceful 503 without keys) |
| Images | Cloudinary + Multer (`multer-storage-cloudinary` + buffer uploads) |
| Validation | Zod |
| Email | Nodemailer (optional — order emails skipped without credentials) |
| Logging | Morgan (`dev`) |
| Security | Helmet, CORS, `express-rate-limit`, `express-mongo-sanitize`, `hpp` |
| Dev | nodemon, ts-node |

---

## Getting started

```bash
cd Backend
npm install
```

Create a `.env` file at the project root (see [Environment variables](#environment-variables)).

Start development (nodemon, auto-reload on `.ts` / `.json` changes):

```bash
npm run dev
```

API base:

```text
http://localhost:8000
```

Health check (no rate limit):

```text
GET http://localhost:8000/api/health
```

Production:

```bash
npm run build
npm start
```

Create database indexes once after first deploy:

```bash
npm run indexes
# or: npx ts-node src/scripts/createIndexes.ts
```

---

## Scripts

| Script | Description |
|---|---|
| `dev` | Start server with nodemon |
| `build` | Compile TypeScript to `dist/` |
| `start` | Run `dist/server.js` |
| `lint` | ESLint on `src/**/*.ts` |
| `indexes` | Run `createIndexes.ts` against MongoDB |

---

## Environment variables

Validated at startup with Zod in `src/config/env.ts`. The process **exits immediately** if required variables are invalid or missing.

```text
# Server
PORT=8000
NODE_ENV=development

# MongoDB (required)
MONGODB_URI=mongodb://localhost:27017/prayosha

# JWT (required, min 32 chars each)
JWT_SECRET=<your_secret_min_32_chars>
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=<your_refresh_secret_min_32_chars>
REFRESH_TOKEN_EXPIRY=7d

# Cloudinary (required)
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>
CLOUDINARY_API_SECRET=<api_secret>

# CORS (optional — defaults shown)
FRONTEND_URL=http://localhost:5174
ADMIN_URL=http://localhost:5173

# Razorpay (optional — payment routes return 503 without these)
RAZORPAY_KEY_ID=<key_id>
RAZORPAY_KEY_SECRET=<key_secret>

# Email (optional — order confirmation emails skipped without these)
EMAIL_USER=<gmail_address>
EMAIL_PASS=<app_password>
```

**Defaults in code:** `FRONTEND_URL` defaults to `http://localhost:5174`, `ADMIN_URL` to `http://localhost:5173`. Set both to match your actual Vite ports.

---

## Architecture

### MVC layout

```text
src/
  config/           env (Zod), DB connection, CORS
  controllers/      request handlers
  middleware/       auth, validate, upload, rate limits, errors
  models/           Mongoose schemas
  routes/           Express routers
  scripts/          createIndexes.ts
  utils/            ApiError, ApiResponse, asyncHandler, pagination, sms, email
  validations/      shared Zod schemas (product, order, review, coupon)
  app.ts            Express app + middleware + route mounting
  server.ts         connect DB + listen
```

### Request lifecycle

```text
Request
  → Helmet
  → CORS
  → Morgan
  → express.json / urlencoded (16kb)
  → cookie-parser
  → express-mongo-sanitize
  → hpp
  → /api/health (no rate limit)
  → authLimiter on /api/v1/auth/*
  → generalLimiter on /api/v1/*
  → route match
  → verifyJWT (if protected)
  → verifyAdmin (if admin)
  → validate(schema) (where applied)
  → controller (asyncHandler)
  → errorHandler (global, last)
```

### Response shapes

**Error** (`ApiError` → `errorHandler`):

```json
{
  "statusCode": 422,
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "phone", "message": "Invalid phone number" }]
}
```

**Success** (`ApiResponse`):

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Products fetched",
  "data": { }
}
```

---

## Security

### Rate limiting (`src/middleware/rateLimiter.ts`)

| Limiter | Scope | Window | Max |
|---|---|---|---|
| `generalLimiter` | `/api/v1/*` | 15 min | 100 / IP |
| `authLimiter` | `/api/v1/auth/*` | 15 min | 10 / IP |
| `uploadLimiter` | `POST /api/v1/products/:id/images` | 15 min | 20 / IP |

Uses `RateLimit-*` standard headers. Returns `429` with JSON body.

### Data sanitization

- **`express-mongo-sanitize`** — strips `$` and `.` from user input (NoSQL injection).
- **`hpp`** — deduplicates query parameters (parameter pollution).

### Helmet

Secure HTTP headers enabled; `contentSecurityPolicy` disabled for easier local frontend development.

### CORS (`src/config/corsOptions.ts`)

Allowed origins:

- `http://localhost:5173`
- `http://localhost:5174`
- `env.FRONTEND_URL`
- `env.ADMIN_URL`

Requests with **no** `Origin` (Postman, curl, mobile) are allowed. `credentials: true` for cookies.

### Database indexes (`src/scripts/createIndexes.ts`)

| Collection | Index | Options |
|---|---|---|
| `products` | `{ slug: 1 }` | unique |
| `products` | `{ category: 1, isActive: 1 }` | |
| `products` | `{ isFeatured: 1, isActive: 1 }` | |
| `products` | text on `name`, `description`, `tags` | name: `product_text_search` |
| `orders` | `{ user: 1, createdAt: -1 }` | |
| `orders` | `{ orderNumber: 1 }` | unique |
| `orders` | `{ status: 1 }` | |
| `orders` | `{ paymentStatus: 1 }` | |
| `users` | `{ email: 1 }` | unique, sparse |
| `reviews` | `{ product: 1, isApproved: 1 }` | |
| `reviews` | `{ product: 1, user: 1 }` | unique |
| `carts` | `{ user: 1 }` | unique |

**Mongoose schema indexes** (created on model sync):

- `blogs`: `{ category: 1, isPublished: 1 }`, `{ featured: 1, isPublished: 1 }`
- `herobanners`: `{ isActive: 1, order: 1 }`

---

## API reference

Base path: **`/api/v1`** unless noted.

Legend: **Public** · **JWT** · **Admin** (JWT + `role: "admin"`)

---

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Liveness + timestamp |

---

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Register (`name`, `phone`, `password`, `email?`) |
| POST | `/send-otp` | Public | Send OTP (`phone`, `purpose`: `login` \| `register`, `adminOnly?`) |
| POST | `/verify-otp` | Public | Verify OTP + password; returns `user`, `accessToken`; sets `refreshToken` httpOnly cookie. Body may include `adminLogin: true` for admin panel |
| POST | `/refresh-token` | Public | New access token from refresh cookie |
| POST | `/forgot-password` | Public | Send reset OTP |
| POST | `/reset-password` | Public | Reset with OTP + `newPassword` |
| POST | `/logout` | JWT | Clear refresh token + cookie |
| GET | `/me` | JWT | Current user profile |
| PATCH | `/me` | JWT | Update `name`, `phone`, `avatar` |
| PATCH | `/change-password` | JWT | `currentPassword`, `newPassword` |
| POST | `/me/addresses` | JWT | Add address |
| PATCH | `/me/addresses/:id` | JWT | Update address |
| DELETE | `/me/addresses/:id` | JWT | Delete address |

**Admin login:** `POST /send-otp` with `adminOnly: true` — returns 403 if phone is not an admin. `POST /verify-otp` with `adminLogin: true` — requires `role: "admin"`.

**OTP:** 6 digits, 10-minute expiry, bcrypt-hashed in DB. In development, OTP is logged via `sendSms` stub.

---

### Products — `/api/v1/products`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | List products (active only) |
| GET | `/featured` | Public | Featured products (max 8) |
| GET | `/:slug` | Public | Product by slug + `lowStockWarning` |
| GET | `/:slug/related` | Public | Related products (same category, max 4) |
| POST | `/` | Admin | Create product (Zod body) |
| PATCH | `/:id` | Admin | Update product |
| DELETE | `/:id` | Admin | Delete product |
| POST | `/:id/images` | Admin | Upload/reorder images (`uploadLimiter`) |
| DELETE | `/:id/images` | Admin | Delete one image (`imageUrl` in body) |

**GET `/` query params:**

| Param | Description |
|---|---|
| `category` | Category **slug** |
| `search` | MongoDB `$text` search |
| `sort` | `newest` (default), `price_asc`, `price_desc`, `featured`, `name_asc` |
| `minPrice`, `maxPrice` | Price range |
| `badge` | Uppercased badge match |
| `chakra` | Case-insensitive exact |
| `inStock` | `true` → `stock > 0` |
| `page`, `limit` | Pagination (limit max 48, default 12) |

**Images `POST /:id/images`:** multipart field `images` (max 6 files) + body `existingImages` (JSON string array of URLs to keep). Removes dropped images from Cloudinary; final list capped at 6.

---

### Reviews — nested & admin

**Public / customer** — `/api/v1/products/:slug/reviews`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Approved reviews for product |
| POST | `/` | JWT | Submit review (pending approval) |

**Admin** — `/api/v1/admin/reviews`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin | List reviews (`status`: `pending` \| `approved`, `page`, `limit`) |
| PATCH | `/:id/approve` | Admin | Approve review |
| DELETE | `/:id` | Admin | Delete review |

---

### Categories — `/api/v1/categories`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Active categories only |
| POST | `/` | Admin | Create (multipart `image` optional) |
| PATCH | `/:id` | Admin | Update (multipart `image` optional) |
| DELETE | `/:id` | Admin | Delete category |

**Admin list (includes inactive)** — `/api/v1/admin/categories`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin | All categories |

---

### Cart — `/api/v1/cart` (all JWT)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Get cart with populated products |
| POST | `/items` | Add item (`productId`, `quantity`) |
| PATCH | `/items/:productId` | Update quantity |
| DELETE | `/items/:productId` | Remove item |
| DELETE | `/` | Clear cart |
| POST | `/coupon/validate` | Validate coupon without applying |
| POST | `/coupon` | Apply coupon to cart |
| DELETE | `/coupon` | Remove applied coupon |

---

### Wishlist — `/api/v1/wishlist` (all JWT)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Get wishlist |
| POST | `/:productId` | Add product |
| DELETE | `/:productId` | Remove product |
| DELETE | `/` | Clear wishlist |

---

### Orders — `/api/v1/orders` (all JWT)

| Method | Path | Description |
|---|---|---|
| POST | `/cod` | Place cash-on-delivery order |
| POST | `/razorpay/create` | Create Razorpay order |
| POST | `/razorpay/verify` | Verify payment signature |
| GET | `/` | User orders (paginated) |
| GET | `/:orderNumber` | Order by order number |

**Body (COD / Razorpay create):** `addressId`, `couponCode?`, `notes?` (Zod `createOrderSchema`).

**Admin** — `/api/v1/admin/orders`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List orders (`status`, `paymentStatus`, `paymentMethod`, `dateFrom`, `dateTo`, `search`, `page`, `limit`) |
| GET | `/:id` | Order by MongoDB `_id` |
| PATCH | `/:id/status` | Update status, optional `note`, `trackingNumber` |

---

### Search — `/api/v1/search`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Product search (`q`, `limit`) |

---

### Newsletter — `/api/v1/newsletter`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/subscribe` | Public | Subscribe email (upsert, idempotent) |

---

### Blogs

**Public** — `/api/v1/blogs`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Published blogs (`isPublished: true`), newest first |
| GET | `/:slug` | Single published post by slug |

**Admin** — `/api/v1/admin/blogs`

| Method | Path | Description |
|---|---|---|
| GET | `/` | All blogs (including drafts) |
| POST | `/` | Create blog (JSON body) |
| PATCH | `/:id` | Update any fields |
| DELETE | `/:id` | Delete blog |

**Blog body fields:** `slug?`, `title`, `subtitle?`, `excerpt`, `category`, `readTime`, `date`, `emoji`, `gradient`, `featured?`, `isPublished?`, `content[]` where each section has `type` (`paragraph` \| `heading` \| `subheading` \| `quote` \| `list`), `text?`, `items?`.

**Categories enum:** Crystal Guides, Rituals, Wellness, Gemstone Spotlight, Spiritual Practice.

Slug auto-generated from `title` on validate if omitted.

---

### Hero banners

**Public** — `/api/v1/hero-banners`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Active banners only, sorted by `order` |

**Admin** — `/api/v1/admin/hero-banners`

| Method | Path | Description |
|---|---|---|
| GET | `/` | All banners |
| POST | `/` | Create (`multipart` field `image` required; body: `title?`, `subtitle?`, `ctaText?`, `ctaLink?`, `order?`, `isActive?`) |
| PATCH | `/reorder` | Batch update order (`{ items: [{ id, order }] }`) — define **before** `/:id` routes |
| PATCH | `/:id/toggle` | Flip `isActive` |
| PATCH | `/:id` | Update metadata; optional new `image` file |
| DELETE | `/:id` | Delete banner + Cloudinary image |

Banner images upload to Cloudinary folder **`prayosha-banners`** via in-memory Multer + `uploadToCloudinary`.

---

### Rewards — `/api/v1/rewards` (all JWT)

| Method | Path | Description |
|---|---|---|
| GET | `/balance` | Current user's `rewardPoints` total |
| GET | `/history` | Paginated earn history, each entry linked to an order (`page`, `limit`) |

Reward points are credited on order completion via `rewardUtils.ts`. Points are stored on the `User` document (`rewardPoints` field) and each transaction is recorded in the `rewards` collection.

---

### Settings

**Public** — `/api/v1/settings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Active store settings (`freeGiftEnabled`, `whatsappNumber`, `whatsappDefaultMessage`) |

**Admin** — `/api/v1/admin/settings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin | Full settings document |
| PATCH | `/` | Admin | Update settings (Zod `settingsUpdateSchema`; accepts `freeGiftEnabled`, `whatsappNumber`, `whatsappDefaultMessage`) |

Settings is a singleton document — `Settings.getSettings()` creates one on first access if none exists.

---

### Admin coupons — `/api/v1/admin/coupons`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List coupons |
| POST | `/` | Create (Zod) |
| PATCH | `/:id` | Update (Zod) |

---

### Admin customers — `/api/v1/admin/customers`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Customers (`search` on name/email, `page`, `limit`) with aggregated order stats |

---

### Admin analytics — `/api/v1/admin/analytics`

| Method | Path | Query | Description |
|---|---|---|---|
| GET | `/overview` | — | Revenue, orders, customers, products, low stock, top products |
| GET | `/sales` | `period`: `7d`, `30d`, `90d`, `1yr` | Revenue + order count over time |
| GET | `/orders-by-status` | — | Count per order status |
| GET | `/low-stock` | — | Active products at/below threshold |
| GET | `/recent-orders` | `limit` (1–50, default 10) | Latest orders with customer summary |

---

## Data models

### User (`users`)

| Field | Type | Notes |
|---|---|---|
| `name` | string | required |
| `email` | string | optional, unique sparse |
| `phone` | string | required, unique |
| `password` | string | hashed, `select: false` |
| `role` | `customer` \| `admin` | default `customer` |
| `avatar` | string | optional URL |
| `isVerified` | boolean | set true after OTP login |
| `refreshToken` | string | `select: false` |
| `otp`, `otpExpiry` | string / Date | `select: false` |
| `addresses[]` | subdocs | label, fullName, phone, line1, line2?, city, state, pincode (6 digits), isDefault |
| `wishlist[]` | ObjectId[] | Product refs |

**Methods:** `isPasswordCorrect`, `generateAccessToken`, `generateRefreshToken`

---

### Product (`products`)

| Field | Type | Notes |
|---|---|---|
| `name`, `slug`, `sku` | string | slug unique; SKU uppercase unique |
| `description`, `shortDescription?` | string | short max 200 |
| `price`, `comparePrice?`, `costPrice?` | number | costPrice excluded from queries |
| `images[]` | string[] | max 6 Cloudinary URLs |
| `category` | ObjectId | Category ref |
| `tags[]`, `chakra?`, `badge?` | | badge enum: BESTSELLER, NEW, LIMITED, RARE, GIFT SET |
| `stock`, `lowStockThreshold` | number | defaults 0, 5 |
| `weight?`, `dimensions?` | | optional |
| `careInstructions?`, `metaphysicalProperties?` | string | |
| `isFeatured`, `isActive` | boolean | |
| `ratings` | `{ average, count }` | |

Slug auto-generated from `name` on save.

---

### Category (`categories`)

| Field | Type | Notes |
|---|---|---|
| `name`, `slug` | string | slug unique |
| `description?`, `image?` | string | |
| `isActive` | boolean | default true |
| `sortOrder` | number | default 0 |

---

### Order (`orders`)

| Field | Type | Notes |
|---|---|---|
| `orderNumber` | string | `PC-YYYY-######`, unique |
| `user` | ObjectId | |
| `items[]` | | product, name, image, sku, price, quantity (snapshot) |
| `shippingAddress` | object | fullName, phone, line1, line2?, city, state, pincode |
| `subtotal`, `discount`, `couponCode?`, `shippingCharge`, `tax`, `total` | number | |
| `paymentMethod` | `razorpay` \| `cod` | |
| `paymentStatus` | pending \| paid \| failed \| refunded | |
| `razorpayOrderId?`, `razorpayPaymentId?` | string | |
| `status` | placed \| confirmed \| processing \| shipped \| delivered \| cancelled \| refunded | |
| `trackingNumber?`, `notes?` | string | |
| `statusHistory[]` | | status, note?, timestamp |

---

### Review (`reviews`)

| Field | Type | Notes |
|---|---|---|
| `product`, `user` | ObjectId | unique together |
| `rating` | 1–5 | |
| `title`, `body` | string | max 100 / 1000 |
| `isVerifiedPurchase` | boolean | |
| `isApproved` | boolean | default false |

---

### Coupon (`coupons`)

| Field | Type | Notes |
|---|---|---|
| `code` | string | unique, uppercase |
| `discountType` | flat \| percent | |
| `discountValue`, `minOrderValue`, `maxUsage`, `usedCount` | number | |
| `validFrom`, `validUntil` | Date | |
| `isActive` | boolean | |

---

### Cart (`carts`)

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId | unique |
| `items[]` | | product, quantity, priceAtAdd |
| `couponApplied?` | string | |

---

### Newsletter (`newslettersubscribers` or collection name from model)

| Field | Type |
|---|---|
| `email` | string, unique, lowercase |
| `subscribedAt` | Date |

---

### Blog (`blogs`)

| Field | Type | Notes |
|---|---|---|
| `slug` | string | unique, lowercase |
| `title`, `excerpt` | string | required |
| `subtitle?` | string | |
| `category` | enum | 5 spiritual/wellness categories |
| `readTime`, `date`, `emoji`, `gradient` | string | display metadata |
| `featured`, `isPublished` | boolean | |
| `content[]` | sections | type + text/items |

---

### HeroBanner (`herobanners`)

| Field | Type | Notes |
|---|---|---|
| `imageUrl`, `imagePublicId` | string | Cloudinary |
| `title?`, `subtitle?`, `ctaText?`, `ctaLink?` | string | optional overlay copy |
| `order` | number | default 0 |
| `isActive` | boolean | default true |

---

### Reward (`rewards`)

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId | ref `User` |
| `order` | ObjectId | ref `Order` |
| `pointsEarned` | number | min 0 |
| `orderTotal` | number | order total at earn time |
| `type` | `"earned"` | only `earned` for now |

Index: `{ user: 1, createdAt: -1 }`. Current points total is denormalized onto `User.rewardPoints`.

---

### Settings (`settings`)

Singleton document — one row, created automatically on first read.

| Field | Type | Notes |
|---|---|---|
| `freeGiftEnabled` | boolean | default `false`; controls storefront free-gift banner |
| `whatsappNumber` | string | default `''`; international format without `+` (e.g. `919876543210`) |
| `whatsappDefaultMessage` | string | default `''`; optional override for the FAB's pre-filled message |

---

## Middleware

### `verifyJWT`

Reads token from `Authorization: Bearer` or `accessToken` cookie. Verifies JWT, loads user (excludes password, refreshToken, otp). Attaches `req.user`. Returns `401` on failure/expiry.

### `verifyAdmin`

Requires `req.user.role === "admin"`. Returns `403` otherwise. Use after `verifyJWT`.

### `validate(schema, target?)`

Zod validation on `body` (default), `query`, or `params`. Returns `422` with field errors.

### `upload` (products & categories)

Multer + Cloudinary storage, folder `prayosha-products`, 1200×1200 limit crop, JPG/PNG/WebP, 5 MB per file.

Helpers: `uploadToCloudinary(buffer, folder)`, `deleteFromCloudinary(publicId)`.

### `errorHandler`

Serialises `ApiError`; includes stack in development.

---

## Flows

### Razorpay payment

1. `POST /orders/razorpay/create` → Razorpay order id + internal order record.
2. Client completes Razorpay checkout.
3. `POST /orders/razorpay/verify` with `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
4. Server verifies HMAC → `paymentStatus: paid`, `status: confirmed`, cart cleared.
5. Order confirmation email sent if `EMAIL_USER` / `EMAIL_PASS` set and user has email.

### COD order

`POST /orders/cod` → order placed, stock decremented, cart cleared, optional email.

### Image upload

| Resource | Endpoint | Storage |
|---|---|---|
| Products | `POST /products/:id/images` | `prayosha-products` (Multer → Cloudinary) |
| Categories | `POST/PATCH /categories` | same via `upload.single("image")` |
| Hero banners | `POST/PATCH /admin/hero-banners` | `prayosha-banners` (buffer upload) |

### OTP / SMS (`src/utils/sms.ts`)

Development: OTP logged to console. Production: replace stub with Twilio, MSG91, Fast2SMS, etc. (commented examples in file).

### Email (`src/utils/email.ts`)

`sendOrderConfirmationEmail` — HTML order summary via Gmail/Nodemailer when credentials exist; otherwise no-op log.

---

## Folder structure

```text
Backend/
  src/
    config/
      corsOptions.ts
      db.ts
      env.ts
    controllers/
      analytics.controller.ts
      auth.controller.ts
      blog.controller.ts
      cart.controller.ts
      category.controller.ts
      coupon.controller.ts
      customer.controller.ts
      heroBanner.controller.ts
      order.controller.ts
      product.controller.ts
      review.controller.ts
      reward.controller.ts
      search.controller.ts
      settings.controller.ts
      wishlist.controller.ts
    middleware/
      auth.ts
      errorHandler.ts
      rateLimiter.ts
      upload.ts
      validate.ts
    models/
      blog.model.ts
      cart.model.ts
      category.model.ts
      coupon.model.ts
      heroBanner.model.ts
      newsletter.model.ts
      order.model.ts
      product.model.ts
      reward.model.ts
      review.model.ts
      settings.model.ts
      user.model.ts
    routes/
      analytics.routes.ts
      auth.routes.ts
      blog.routes.ts
      cart.routes.ts
      category.routes.ts
      coupon.routes.ts
      customer.routes.ts
      heroBanner.routes.ts
      newsletter.routes.ts
      order.routes.ts
      product.routes.ts
      review.routes.ts
      reward.routes.ts
      search.routes.ts
      settings.routes.ts
      wishlist.routes.ts
    scripts/
      createIndexes.ts
    utils/
      ApiError.ts
      ApiResponse.ts
      asyncHandler.ts
      email.ts
      pagination.ts
      rewardUtils.ts
      sms.ts
    validations/
      auth.validation.ts
      coupon.validation.ts
      order.validation.ts
      product.validation.ts
      review.validation.ts
      settings.validation.ts
    app.ts
    server.ts
  dist/                             # build output
  .env                              # local secrets (git-ignored)
  Backend-Readme.md
  nodemon.json
  package.json
  tsconfig.json
```

---

## Feature checklist

| Area | Status | Notes |
|---|---|---|
| Auth (register, OTP login, refresh, password reset) | ✓ | Admin: `adminOnly` + `adminLogin` |
| User profile & addresses | ✓ | |
| Products CRUD + images | ✓ | Public list active only |
| Categories CRUD + image | ✓ | Admin list at `/admin/categories` |
| Cart + coupons on cart | ✓ | |
| Wishlist | ✓ | |
| Orders COD + Razorpay | ✓ | Razorpay optional |
| Reviews (submit + moderate) | ✓ | |
| Admin orders & status | ✓ | Status history |
| Admin coupons | ✓ | |
| Admin customers + stats | ✓ | |
| Admin analytics | ✓ | Overview, sales, status, low stock, recent orders |
| Search | ✓ | |
| Newsletter | ✓ | |
| Blogs (public + admin) | ✓ | Structured content sections |
| Hero banners (public + admin) | ✓ | Reorder, toggle, Cloudinary |
| Rewards (balance + history) | ✓ | Points earned per order; `User.rewardPoints` |
| Store settings (public + admin) | ✓ | Singleton; `freeGiftEnabled` toggle, WhatsApp config (`whatsappNumber`, `whatsappDefaultMessage`) |
| Rate limiting & sanitization | ✓ | |
| Order confirmation email | ✓ | Optional |

---

## Useful references

- [Express](https://expressjs.com)
- [Mongoose](https://mongoosejs.com)
- [Zod](https://zod.dev)
- [Razorpay Node SDK](https://github.com/razorpay/razorpay-node)
- [Cloudinary Node SDK](https://cloudinary.com/documentation/node_integration)
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- [Nodemailer](https://nodemailer.com)
