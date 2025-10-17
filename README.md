# Silver Surfers Backend

This is the backend service for Silver Surfers.

## Prerequisites
- Node.js 18+
- MongoDB connection string
- Stripe Secret Key
- SMTP credentials for email

## Environment
Create a `.env` in the backend root with values similar to:

```
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-strong-secret
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
FRONTEND_URL=http://localhost:3001
API_BASE_URL=http://localhost:5000
ADDITIONAL_ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
```

### Security Configuration
- **FRONTEND_URL**: The primary frontend URL that can make requests to the API
- **ADDITIONAL_ALLOWED_ORIGINS**: Comma-separated list of additional allowed origins (optional)
- **STRIPE_WEBHOOK_SECRET**: Required for Stripe webhook signature verification
- CORS is configured to only allow requests from specified origins
- Security headers are automatically applied to all responses

## Run
```
npm install
npm start
```

## Routes
- POST `/start-audit` queue a full audit
- POST `/create-checkout-session` (auth required) create Stripe Checkout
- GET `/confirm-payment` confirm Stripe payment and queue audit
- POST `/cleanup` cleanup a report folder
- Auth under `/auth` (register, login, verify, resend)
