# Backend Structure Documentation

## Overview

The backend has been fully refactored into a clean, modular structure. The main `server.js` file is now minimal (only 148 lines) and focuses solely on setup and route mounting.

## Directory Structure

```
server/
├── config/              # Configuration constants
│   └── constants.js
├── controllers/         # Request handlers (business logic)
│   ├── adminController.js
│   ├── auditController.js
│   ├── contactController.js
│   ├── legalController.js
│   ├── subscriptionController.js
│   └── teamController.js
├── middleware/          # Custom middleware
│   ├── adminOnly.js
│   ├── cors.js
│   ├── securityHeaders.js
│   └── subscriptionAccess.js
├── models/              # Database models (unchanged)
├── routes/              # Route definitions
│   ├── adminAdditionalRoutes.js
│   ├── auditRoutes.js
│   ├── contactRoutes.js
│   ├── contentRoutes.js
│   ├── legalRoutes.js
│   ├── recordsRoutes.js
│   ├── stripeRoutes.js
│   ├── subscriptionRoutes.js
│   └── teamRoutes.js
├── services/            # Reusable business logic
│   ├── auditService.js
│   ├── stripeWebhookService.js
│   └── urlService.js
└── server.js            # Main entry point (clean & minimal)
```

## Route Organization

### Public Routes
- **Content Routes** (`routes/contentRoutes.js`)
  - `GET /blogs` - List blog posts
  - `GET /blogs/:slug` - Get single blog post
  - `GET /faqs` - List FAQs

- **Records Routes** (`routes/recordsRoutes.js`)
  - `GET /records` - List analysis records
  - `GET /records/:taskId` - Get specific record

- **Contact Routes** (`routes/contactRoutes.js`)
  - `POST /contact` - Submit contact form

- **Legal Routes** (`routes/legalRoutes.js`)
  - `GET /legal/:type` - Get legal document
  - `GET /legal` - Get all legal documents
  - `POST /legal/:type/accept` - Accept legal document
  - `GET /legal/acceptances` - Get user acceptances
  - `GET /debug/legal` - Debug legal documents

### Authentication Routes
- **Auth Routes** (`authRoutes.js`)
  - Handles user authentication

### Subscription Routes (`routes/subscriptionRoutes.js`)
- `POST /create-checkout-session` - Create Stripe checkout
- `GET /subscription` - Get user subscription
- `POST /create-portal-session` - Create Stripe portal session
- `POST /subscription/upgrade` - Upgrade subscription
- `POST /subscription/cancel` - Cancel subscription
- `GET /subscription/plans` - Get available plans
- `GET /payment-success` - One-time payment success
- `GET /subscription-success` - Subscription success

### Team Management Routes (`routes/teamRoutes.js`)
- `POST /subscription/team/add` - Add team member
- `POST /subscription/team/leave` - Leave team
- `POST /subscription/team/remove` - Remove team member
- `GET /subscription/team` - Get team members
- `GET /subscription/team/scans` - Get team scans
- `GET /subscription/team/invite/:token` - Get invitation details
- `POST /subscription/team/accept` - Accept invitation

### Audit Routes (`routes/auditRoutes.js`)
- `POST /precheck-url` - Precheck URL validity
- `POST /start-audit` - Start full audit (auth required)
- `POST /quick-audit` - Start quick scan (free)
- `POST /cleanup` - Cleanup report folders
- `GET /confirm-payment` - Confirm payment and start audit

### Stripe Routes (`routes/stripeRoutes.js`)
- `POST /stripe-webhook` - Stripe webhook handler

### Admin Routes
- **Admin Routes** (`adminRoutes.js`)
  - Blog, FAQ, Service, Analysis, Contact CRUD operations

- **Additional Admin Routes** (`routes/adminAdditionalRoutes.js`)
  - `POST /admin/subscription/update` - Update subscription
  - `POST /admin/analysis/:idOrTaskId/rerun` - Rerun analysis
  - `GET /admin/quick-scans` - Get quick scans
  - `GET /admin/subscription-scans` - Get subscription scans
  - `GET /admin/users` - List users
  - `GET /admin/users/:id` - Get user details
  - `POST /admin/users/:id/reset-usage` - Reset user usage
  - `PUT /admin/users/:id/role` - Update user role
  - `GET /admin/queue-status` - Get queue status
  - `POST /admin/queue-recovery` - Recover queue

## Services

### Audit Service (`services/auditService.js`)
- `runFullAuditProcess()` - Process full audit jobs
- `runQuickScanProcess()` - Process quick scan jobs

### Stripe Webhook Service (`services/stripeWebhookService.js`)
- `handleCheckoutSessionCompleted()` - Handle checkout completion
- `handleSubscriptionCreated()` - Handle subscription creation
- `handleSubscriptionUpdated()` - Handle subscription updates
- `handleSubscriptionDeleted()` - Handle subscription deletion
- `handlePaymentSucceeded()` - Handle successful payment
- `handlePaymentFailed()` - Handle failed payment

### URL Service (`services/urlService.js`)
- `buildCandidateUrls()` - Build URL candidates
- `tryFetch()` - Test URL reachability

## Middleware

- **CORS** (`middleware/cors.js`) - CORS configuration
- **Security Headers** (`middleware/securityHeaders.js`) - Security headers
- **Subscription Access** (`middleware/subscriptionAccess.js`) - Validate subscription access
- **Admin Only** (`middleware/adminOnly.js`) - Admin route protection

## Benefits

1. **Maintainability**: Easy to find and modify specific functionality
2. **Scalability**: Easy to add new features without cluttering
3. **Testability**: Each module can be tested independently
4. **Reusability**: Services can be reused across different routes
5. **Separation of Concerns**: Clear boundaries between routes, controllers, and services

## Migration Notes

- Original `server.js` backed up as `server.js.original.backup`
- All routes extracted and organized
- All business logic moved to controllers
- All reusable logic moved to services
- Middleware extracted to separate files
- Configuration constants extracted

## Next Steps

The backend is now fully organized. You can:
1. Test all endpoints to ensure functionality
2. Add new features by following the same pattern
3. Write unit tests for individual modules
4. Scale by adding more route/controller/service files as needed




