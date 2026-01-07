/**
 * Audit Routes
 */

import express from 'express';
import { authRequired } from '../auth.js';
import { startAudit, quickAudit, precheckUrl } from '../controllers/auditController.js';

const router = express.Router();

// URL precheck endpoint
router.post('/precheck-url', precheckUrl);

// Start full audit (requires auth and subscription)
router.post('/start-audit', authRequired, async (req, res, next) => {
  // Check subscription access inline
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const Subscription = (await import('../models/Subscription.js')).default;
    const User = (await import('../models/User.js')).default;

    // Check for active subscription
    const subscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] }
    }).lean();

    // Check for one-time scans
    const user = await User.findById(userId).lean();
    const hasOneTimeScans = user?.oneTimeScans > 0;

    if (!subscription && !hasOneTimeScans) {
      return res.status(403).json({ 
        error: 'No active subscription or one-time scans available. Please subscribe or purchase a scan.' 
      });
    }

    req.subscription = subscription;
    req.hasOneTimeScans = hasOneTimeScans;
    next();
  } catch (error) {
    console.error('Subscription access check error:', error);
    return res.status(500).json({ error: 'Failed to check subscription access' });
  }
}, startAudit);

// Quick audit (free)
router.post('/quick-audit', quickAudit);

export default router;

