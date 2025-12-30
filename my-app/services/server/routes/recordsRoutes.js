import { Router } from 'express';
import AnalysisRecord from '../models/AnalysisRecord.js';

const router = Router();

router.get('/records', async (req, res) => {
  try {
    const { email, limit } = req.query;
    const q = {};
    if (email) q.email = String(email);
    const items = await AnalysisRecord.find(q).sort({ createdAt: -1 }).limit(Number(limit) || 50).lean();
    res.json(items);
  } catch (err) {
    console.error('List records error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.get('/records/:taskId', async (req, res) => {
  try {
    const item = await AnalysisRecord.findOne({ taskId: req.params.taskId }).lean();
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error('Get record error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});

export default router;

