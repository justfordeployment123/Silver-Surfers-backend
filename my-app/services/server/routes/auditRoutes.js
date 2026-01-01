import { Router } from 'express';
import { authRequired } from '../auth.js';
import { hasSubscriptionAccess } from '../middleware/subscriptionAccess.js';
import * as auditController from '../controllers/auditController.js';

const router = Router();

router.post('/precheck-url', auditController.precheckUrl);
router.post('/start-audit', authRequired, hasSubscriptionAccess, auditController.startAudit);
router.post('/quick-audit', auditController.quickAudit);
router.post('/cleanup', auditController.cleanup);
router.get('/confirm-payment', auditController.confirmPayment);

export default router;



