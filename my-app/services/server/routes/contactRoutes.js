/**
 * Contact Routes
 */

import express from 'express';
import * as contactController from '../controllers/contactController.js';

const router = express.Router();

// Submit contact form
router.post('/contact', contactController.submitContact);

export default router;



