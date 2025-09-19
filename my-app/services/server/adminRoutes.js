import { Router } from 'express';
import BlogPost from './models/BlogPost.js';
import Service from './models/Service.js';
import FAQ from './models/FAQ.js';
import AnalysisRecord from './models/AnalysisRecord.js';
import { authRequired } from './auth.js';

const router = Router();

function adminOnly(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Utility: wrap async handlers
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// BLOG CRUD
router.get('/blog', authRequired, adminOnly, asyncH(async (req, res) => {
  const items = await BlogPost.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
}));

router.post('/blog', authRequired, adminOnly, asyncH(async (req, res) => {
  const { title, slug, excerpt, content, published } = req.body || {};
  if (!title || !slug) return res.status(400).json({ error: 'title and slug required' });
  const created = await BlogPost.create({ title, slug, excerpt, content, published: !!published });
  res.status(201).json({ item: created });
}));

router.put('/blog/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const updated = await BlogPost.findByIdAndUpdate(id, req.body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ item: updated });
}));

router.delete('/blog/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const deleted = await BlogPost.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

// SERVICES CRUD
router.get('/services', authRequired, adminOnly, asyncH(async (req, res) => {
  const items = await Service.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
}));

router.post('/services', authRequired, adminOnly, asyncH(async (req, res) => {
  const { name, slug, description, priceCents, active } = req.body || {};
  if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
  const created = await Service.create({ name, slug, description, priceCents: Number(priceCents) || 0, active: active !== false });
  res.status(201).json({ item: created });
}));

router.put('/services/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const updated = await Service.findByIdAndUpdate(id, req.body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ item: updated });
}));

router.delete('/services/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const deleted = await Service.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

// FAQ CRUD
router.get('/faqs', authRequired, adminOnly, asyncH(async (req, res) => {
  const items = await FAQ.find().sort({ order: 1, createdAt: -1 }).lean();
  res.json({ items });
}));

router.post('/faqs', authRequired, adminOnly, asyncH(async (req, res) => {
  const { question, answer, order, published } = req.body || {};
  if (!question) return res.status(400).json({ error: 'question required' });
  const created = await FAQ.create({ question, answer, order: Number(order) || 0, published: published !== false });
  res.status(201).json({ item: created });
}));

router.put('/faqs/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const updated = await FAQ.findByIdAndUpdate(id, req.body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ item: updated });
}));

router.delete('/faqs/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const deleted = await FAQ.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

// ANALYSIS RECORDS (Admin)
router.get('/analysis', authRequired, adminOnly, asyncH(async (req, res) => {
  const { email, url, status, emailStatus, limit } = req.query || {};
  const q = {};
  if (email) q.email = String(email);
  if (url) q.url = String(url);
  if (status) q.status = String(status);
  if (emailStatus) q.emailStatus = String(emailStatus);
  const items = await AnalysisRecord.find(q).sort({ createdAt: -1 }).limit(Number(limit) || 100).lean();

  res.json({ items });
}));

router.get('/analysis/:taskId', authRequired, adminOnly, asyncH(async (req, res) => {
  const item = await AnalysisRecord.findOne({ taskId: req.params.taskId }).lean();
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
}));

export default router;
