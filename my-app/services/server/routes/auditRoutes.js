/**
 * Audit Routes
 */

import express from 'express';
import { startAudit, quickAudit, precheckUrl } from '../controllers/auditController.js';

const router = express.Router();

// URL precheck endpoint
router.post('/precheck-url', precheckUrl);

// Start full audit
router.post('/start-audit', startAudit);

// Quick audit (free)
router.post('/quick-audit', quickAudit);

export default router;

