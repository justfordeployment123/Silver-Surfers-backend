/**
 * Admin Additional Routes
 */

import express from 'express';
import { authRequired } from '../auth.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

// Admin middleware
function adminOnly(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Rerun analysis
router.post('/analysis/:idOrTaskId/rerun', authRequired, adminOnly, adminController.rerunAnalysis);

// Get contact messages
router.get('/contact', authRequired, adminController.getContactMessages);

// Get quick scans
router.get('/quick-scans', authRequired, adminController.getQuickScans);

// Bulk quick scans
router.post('/quick-scans/bulk', authRequired, adminController.bulkQuickScans);

export default router;

