/**
 * Subscription Routes
 */

import express from 'express';
import { authRequired } from '../auth.js';
import * as subscriptionController from '../controllers/subscriptionController.js';

const router = express.Router();

// Get subscription
router.get('/subscription', authRequired, subscriptionController.getSubscription);

// Create checkout session
router.post('/create-checkout-session', authRequired, subscriptionController.createCheckoutSession);

// Create portal session
router.post('/create-portal-session', authRequired, subscriptionController.createPortalSession);

// Upgrade subscription
router.post('/subscription/upgrade', authRequired, subscriptionController.upgradeSubscription);

// Cancel subscription
router.post('/subscription/cancel', authRequired, subscriptionController.cancelSubscription);

// Get subscription plans
router.get('/subscription/plans', subscriptionController.getPlans);

// Payment success
router.get('/payment-success', authRequired, subscriptionController.paymentSuccess);

// Subscription success
router.get('/subscription-success', subscriptionController.subscriptionSuccess);

export default router;


