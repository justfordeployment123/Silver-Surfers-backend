import { Router } from 'express';
import express from 'express';
import Stripe from 'stripe';
import * as stripeWebhookService from '../services/stripeWebhookService.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// Stripe webhook endpoint - must use raw body
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  console.log(`Stripe webhook received from IP: ${req.ip}`);

  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).send('Webhook secret not configured');
    }
    
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log(`Webhook signature verified for event: ${event.type}`);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await stripeWebhookService.handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
        await stripeWebhookService.handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await stripeWebhookService.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await stripeWebhookService.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await stripeWebhookService.handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await stripeWebhookService.handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

export default router;

