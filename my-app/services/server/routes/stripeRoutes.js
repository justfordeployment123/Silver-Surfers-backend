/**
 * Stripe Routes
 */

import express from 'express';
import { stripeWebhook } from '../controllers/stripeController.js';

const router = express.Router();

// Stripe webhook (needs raw body - handled in server.js before JSON middleware)
// This route is mounted but webhook is handled directly in server.js
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);

export default router;

