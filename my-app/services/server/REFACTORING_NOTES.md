# Backend Refactoring Notes

## Completed Refactoring

The backend has been organized into a modular structure:

### Directory Structure
- `routes/` - Route definitions
- `controllers/` - Request handlers (business logic)
- `services/` - Reusable business logic services
- `middleware/` - Custom middleware functions
- `config/` - Configuration constants

### Extracted Modules

#### Services
- `services/auditService.js` - Full audit and quick scan processing logic
- `services/stripeWebhookService.js` - Stripe webhook event handlers
- `services/urlService.js` - URL validation and normalization utilities

#### Middleware
- `middleware/cors.js` - CORS configuration
- `middleware/securityHeaders.js` - Security headers middleware
- `middleware/subscriptionAccess.js` - Subscription access validation
- `middleware/adminOnly.js` - Admin-only route protection

#### Routes
- `routes/auditRoutes.js` - Audit-related routes (precheck-url, start-audit, quick-audit, cleanup, confirm-payment)
- `routes/stripeRoutes.js` - Stripe webhook route
- `routes/recordsRoutes.js` - Analysis record routes
- `routes/contentRoutes.js` - Blog and FAQ public routes

#### Controllers
- `controllers/auditController.js` - Audit request handlers

### Remaining Routes to Extract

The following routes are still in `server.js` and should be extracted into separate route files:

1. **Subscription Routes** (`routes/subscriptionRoutes.js`)
   - POST `/create-checkout-session`
   - GET `/subscription`
   - POST `/create-portal-session`
   - POST `/subscription/upgrade`
   - POST `/subscription/cancel`
   - GET `/subscription/plans`
   - GET `/payment-success`
   - GET `/subscription-success`

2. **Team Management Routes** (`routes/teamRoutes.js`)
   - POST `/subscription/team/add`
   - POST `/subscription/team/leave`
   - POST `/subscription/team/remove`
   - GET `/subscription/team`
   - GET `/subscription/team/scans`
   - GET `/subscription/team/invite/:token`
   - POST `/subscription/team/accept`

3. **Legal Document Routes** (`routes/legalRoutes.js`)
   - GET `/legal/:type`
   - GET `/legal`
   - POST `/legal/:type/accept`
   - GET `/legal/acceptances`
   - GET `/admin/legal`
   - POST `/admin/legal`
   - PUT `/admin/legal/:id`
   - POST `/admin/legal/:id/publish`
   - GET `/debug/legal`

4. **Contact Routes** (`routes/contactRoutes.js`)
   - POST `/contact`

5. **Admin Routes** (add to `adminRoutes.js` or create separate files)
   - POST `/admin/subscription/update`
   - POST `/admin/analysis/:idOrTaskId/rerun`
   - GET `/admin/contact` (already in adminRoutes.js)
   - GET `/admin/quick-scans`
   - GET `/admin/subscription-scans`
   - GET `/admin/users`
   - GET `/admin/users/:id`
   - POST `/admin/users/:id/reset-usage`
   - PUT `/admin/users/:id/role`
   - GET `/admin/queue-status`
   - POST `/admin/queue-recovery`

### Next Steps

1. Extract remaining routes into appropriate route files
2. Create corresponding controller files for each route group
3. Move business logic from route handlers to controllers
4. Update `server.js` to import and mount all route files
5. Test all endpoints to ensure functionality is preserved

### Benefits of This Structure

- **Separation of Concerns**: Routes, controllers, and services are clearly separated
- **Reusability**: Services can be reused across different routes
- **Maintainability**: Easier to find and modify specific functionality
- **Testability**: Each module can be tested independently
- **Scalability**: Easy to add new features without cluttering the main server file

