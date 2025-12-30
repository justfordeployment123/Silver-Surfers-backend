import { Router } from 'express';
import { authRequired } from '../auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import * as adminController from '../controllers/adminController.js';

const router = Router();

router.post('/subscription/update', authRequired, adminOnly, adminController.updateSubscription);
router.post('/analysis/:idOrTaskId/rerun', authRequired, adminOnly, adminController.rerunAnalysis);
router.get('/quick-scans', authRequired, adminOnly, adminController.getQuickScans);
router.post('/quick-scans/bulk', authRequired, adminOnly, adminController.bulkQuickScans);
router.get('/subscription-scans', authRequired, adminOnly, adminController.getSubscriptionScans);
router.get('/users', authRequired, adminOnly, adminController.getUsers);
router.get('/users/:id', authRequired, adminOnly, adminController.getUser);
router.post('/users/:id/reset-usage', authRequired, adminOnly, adminController.resetUserUsage);
router.put('/users/:id/role', authRequired, adminOnly, adminController.updateUserRole);
router.get('/queue-status', authRequired, adminOnly, adminController.getQueueStatus);
router.post('/queue-recovery', authRequired, adminOnly, adminController.recoverQueue);

export default router;

