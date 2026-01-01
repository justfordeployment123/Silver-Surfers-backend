import { Router } from 'express';
import * as contactController from '../controllers/contactController.js';

const router = Router();

router.post('/contact', contactController.submitContact);

export default router;



