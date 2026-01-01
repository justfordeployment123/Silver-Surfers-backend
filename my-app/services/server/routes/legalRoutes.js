import { Router } from 'express';
import { authRequired } from '../auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import * as legalController from '../controllers/legalController.js';

const router = Router();

router.get('/debug/legal', legalController.debugLegal);
router.get('/legal/:type', legalController.getLegalDocument);
router.get('/legal', legalController.getAllLegalDocuments);
router.post('/legal/:type/accept', authRequired, legalController.acceptLegalDocument);
router.get('/legal/acceptances', authRequired, legalController.getUserAcceptances);
router.get('/admin/legal', authRequired, adminOnly, legalController.getAllLegalDocumentsAdmin);
router.post('/admin/legal', authRequired, adminOnly, legalController.createLegalDocument);
router.put('/admin/legal/:id', authRequired, adminOnly, legalController.updateLegalDocument);
router.post('/admin/legal/:id/publish', authRequired, adminOnly, legalController.publishLegalDocument);

export default router;



