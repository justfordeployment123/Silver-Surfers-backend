import { Router } from 'express';
import { authRequired } from '../auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import * as adminController from '../controllers/adminController.js';

const router = Router();

router.post('/admin/subscription/update', authRequired, adminOnly, adminController.updateSubscription);
router.post('/admin/analysis/:idOrTaskId/rerun', authRequired, adminOnly, adminController.rerunAnalysis);
router.get('/admin/quick-scans', authRequired, adminOnly, adminController.getQuickScans);
router.post('/admin/quick-scans/bulk', authRequired, adminOnly, adminController.bulkQuickScans);
router.get('/admin/subscription-scans', authRequired, adminOnly, adminController.getSubscriptionScans);
router.get('/admin/users', authRequired, adminOnly, adminController.getUsers);
router.get('/admin/users/:id', authRequired, adminOnly, adminController.getUser);
router.post('/admin/users/:id/reset-usage', authRequired, adminOnly, adminController.resetUserUsage);
router.put('/admin/users/:id/role', authRequired, adminOnly, adminController.updateUserRole);
router.get('/admin/queue-status', authRequired, adminOnly, adminController.getQueueStatus);
router.post('/admin/queue-recovery', authRequired, adminOnly, adminController.recoverQueue);

export default router;

