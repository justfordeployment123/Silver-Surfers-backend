# Subscription System Setup Guide

## Overview
This guide will help you set up the subscription-based payment system using Stripe.

## Prerequisites
1. Stripe account with API keys
2. MongoDB database
3. Backend server running

## Environment Variables

Add these to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_or_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_live_or_test_your_publishable_key

# Subscription Plan Price IDs (Create these in Stripe Dashboard)
STRIPE_STARTER_MONTHLY_PRICE_ID=price_starter_monthly_id
STRIPE_STARTER_YEARLY_PRICE_ID=price_starter_yearly_id
STRIPE_PRO_MONTHLY_PRICE_ID=price_pro_monthly_id
STRIPE_PRO_YEARLY_PRICE_ID=price_pro_yearly_id

```

## Stripe Setup Steps

### 1. Create Products and Prices in Stripe Dashboard

#### SilverSurfers Starter Plan
1. Go to Products in Stripe Dashboard
2. Create Product: "SilverSurfers Starter"
3. Create Prices:
   - Monthly: $29.00/month
   - Yearly: $197.00/year
4. Copy the Price IDs to your `.env` file

#### SilverSurfers Pro Plan
1. Create Product: "SilverSurfers Pro"
2. Create Prices:
   - Monthly: $99.00/month
   - Yearly: $899.00/year
3. Copy the Price IDs to your `.env` file

### 2. Set Up Webhooks

1. Go to Webhooks in Stripe Dashboard
2. Add endpoint: `https://yourdomain.com/stripe-webhook`
3. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook secret to your `.env` file

### 3. Test the Integration

1. Start your backend server
2. Test subscription creation:
   ```bash
   curl -X POST http://localhost:5000/subscription/plans
   ```
3. Test subscription management in the frontend

## Features Implemented

### Backend Features
- ✅ Subscription model with usage tracking
- ✅ Stripe webhook handling
- ✅ Plan management and pricing
- ✅ Usage limits enforcement
- ✅ Subscription lifecycle management

### Frontend Features
- ✅ Subscription plans display
- ✅ Monthly/Yearly billing toggle
- ✅ Subscription management dashboard
- ✅ Plan upgrade/downgrade
- ✅ Subscription cancellation
- ✅ Usage tracking display

### API Endpoints

#### Subscription Management
- `GET /subscription` - Get current subscription
- `POST /subscription/update` - Update subscription plan
- `POST /subscription/cancel` - Cancel subscription
- `GET /subscription/plans` - Get available plans
- `POST /create-checkout-session` - Create Stripe checkout session
- `GET /subscription-success` - Confirm subscription activation

#### Webhook Endpoint
- `POST /stripe-webhook` - Handle Stripe events

## Usage Limits

### Starter Plan
- 10 scans per month
- 1 user
- Basic features

### Pro Plan
- 50 scans per month
- 5 users
- Advanced features

### Custom Plan
- Unlimited scans
- Unlimited users
- All features + custom integrations

## Testing

### Test Cards (Stripe Test Mode)
- Success: 4242424242424242
- Decline: 4000000000000002
- Requires authentication: 4000002500003155

### Test Scenarios
1. Create subscription
2. Upgrade plan
3. Downgrade plan
4. Cancel subscription
5. Payment failure handling
6. Webhook event processing

## Security Considerations

1. **Webhook Verification**: All webhooks are verified using Stripe signatures
2. **Authentication**: All subscription endpoints require authentication
3. **Usage Tracking**: Implemented to prevent abuse
4. **Data Validation**: All inputs are validated on both frontend and backend

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check webhook URL is correct
   - Verify webhook secret in environment variables
   - Check server logs for webhook errors

2. **Subscription not activating**
   - Verify Stripe price IDs are correct
   - Check webhook endpoint is accessible
   - Review subscription success callback

3. **Usage limits not enforced**
   - Check usage tracking implementation
   - Verify plan limits are correctly set
   - Review usage reset logic

### Debug Mode
Set `DEBUG=true` in environment variables for detailed logging.

## Production Checklist

- [ ] Update Stripe keys to live mode
- [ ] Set up production webhook endpoint
- [ ] Configure proper error handling
- [ ] Set up monitoring and alerts
- [ ] Test all subscription flows
- [ ] Implement backup payment methods
- [ ] Set up subscription analytics

## Support

For issues or questions:
1. Check server logs
2. Review Stripe Dashboard for payment issues
3. Test with Stripe test cards
4. Contact support if needed
