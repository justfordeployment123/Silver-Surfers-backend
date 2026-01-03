import { Router } from 'express';
import { authRequired } from '../auth.js';
import * as subscriptionController from '../controllers/subscriptionController.js';

const router = Router();

router.post('/create-checkout-session', authRequired, subscriptionController.createCheckoutSession);
router.get('/subscription', authRequired, subscriptionController.getSubscription);
router.post('/create-portal-session', authRequired, subscriptionController.createPortalSession);
router.post('/subscription/upgrade', authRequired, subscriptionController.upgradeSubscription);
router.post('/subscription/cancel', authRequired, subscriptionController.cancelSubscription);
router.get('/subscription/plans', subscriptionController.getPlans);
router.get('/payment-success', authRequired, subscriptionController.paymentSuccess);
router.get('/subscription-success', subscriptionController.subscriptionSuccess);

export default router;




