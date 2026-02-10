import { Router } from 'express';
import BlogPost from './models/BlogPost.js';
import Service from './models/Service.js';
import FAQ from './models/FAQ.js';
import AnalysisRecord from './models/AnalysisRecord.js';
import ContactMessage from './models/ContactMessage.js';
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
  let { title, slug, excerpt, content, category, author, date, readTime, featured, published } = req.body || {};
  if (!title || !slug) {
    return res.status(400).json({ error: 'Title and slug are required to create a blog post.' });
  }

  slug = String(slug).toLowerCase().trim();
  const payload = {
    title: String(title).trim(),
    slug,
    excerpt: String(excerpt || ''),
    content: String(content || ''),
    category: String(category || ''),
    author: String(author || ''),
    date: date ? new Date(date) : undefined,
    readTime: String(readTime || ''),
    featured: !!featured,
    published: !!published,
  };

  try {
    const created = await BlogPost.create(payload);
    return res.status(201).json({ item: created });
  } catch (err) {
    // Handle duplicate slug error with a clear, user-friendly message
    if (err && err.code === 11000) {
      // Try to extract slug value from the error if available
      const duplicateSlug =
        err.keyValue?.slug ||
        (typeof err.message === 'string'
          ? (err.message.match(/dup key.*slug["']?\s*:\s*["'](.+?)["']/)?.[1] || slug)
          : slug);

      return res.status(400).json({
        error: `The blog URL slug "${duplicateSlug}" is already being used by another post. Please choose a different slug (or slightly change the title).`,
      });
    }

    // Handle generic validation errors from Mongoose
    if (err && err.name === 'ValidationError') {
      const messages = Object.values(err.errors || {}).map((e) => e.message).filter(Boolean);
      return res.status(400).json({
        error: messages.length
          ? `There was a problem with your blog post: ${messages.join(' ')}`
          : 'There was a problem with the blog data you entered. Please review the fields and try again.',
      });
    }

    console.error('Error creating blog post:', err);
    return res.status(500).json({
      error: 'We ran into a technical problem while saving this blog post. Please try again, and if it continues, contact support.',
    });
  }
}));

router.put('/blog/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const update = {};

  if (body.title != null) update.title = String(body.title).trim();
  if (body.slug != null) update.slug = String(body.slug).toLowerCase().trim();
  if (body.excerpt != null) update.excerpt = String(body.excerpt);
  if (body.content != null) update.content = String(body.content);
  if (body.category != null) update.category = String(body.category);
  if (body.author != null) update.author = String(body.author);
  if (body.date != null) update.date = body.date ? new Date(body.date) : undefined;
  if (body.readTime != null) update.readTime = String(body.readTime);
  if (body.featured != null) update.featured = !!body.featured;
  if (body.published != null) update.published = !!body.published;

  try {
    const updated = await BlogPost.findByIdAndUpdate(id, update, { new: true });
    if (!updated) {
      return res.status(404).json({ error: 'We could not find that blog post. It may have been deleted.' });
    }
    return res.json({ item: updated });
  } catch (err) {
    if (err && err.code === 11000) {
      const duplicateSlug =
        err.keyValue?.slug ||
        (typeof err.message === 'string'
          ? (err.message.match(/dup key.*slug["']?\s*:\s*["'](.+?)["']/)?.[1] || update.slug)
          : update.slug);

      return res.status(400).json({
        error: `Another blog post is already using the slug "${duplicateSlug}". Please choose a different slug.`,
      });
    }

    if (err && err.name === 'ValidationError') {
      const messages = Object.values(err.errors || {}).map((e) => e.message).filter(Boolean);
      return res.status(400).json({
        error: messages.length
          ? `There was a problem updating this blog post: ${messages.join(' ')}`
          : 'There was a problem with the blog data you entered. Please review the fields and try again.',
      });
    }

    console.error('Error updating blog post:', err);
    return res.status(500).json({
      error: 'We ran into a technical problem while updating this blog post. Please try again, and if it continues, contact support.',
    });
  }
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
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question required' });
  const created = await FAQ.create({
    question: question.trim(),
    answer: typeof answer === 'string' ? answer : '',
    order: Number(order) || 0,
    published: published !== false,
  });
  res.status(201).json({ item: created });
}));

router.put('/faqs/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const update = {};
  if (body.question != null) update.question = String(body.question).trim();
  if (body.answer != null) update.answer = String(body.answer);
  if (body.order != null) update.order = Number(body.order) || 0;
  if (body.published != null) update.published = !!body.published;
  const updated = await FAQ.findByIdAndUpdate(id, update, { new: true });
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

// CONTACT MESSAGES (Admin)
router.get('/contact', authRequired, adminOnly, asyncH(async (req, res) => {
  const { status, q, limit = 200 } = req.query || {};
  const filter = {};
  if (status && ['new','read','closed'].includes(String(status))) filter.status = String(status);
  const items = await ContactMessage.find(filter).sort({ createdAt: -1 }).limit(Number(limit) || 200).lean();
  const term = (q||'').toString().trim().toLowerCase();
  const filtered = term
    ? items.filter(m => [m.name, m.email, m.subject, m.message].some(v => (v||'').toLowerCase().includes(term)))
    : items;
  res.json({ items: filtered });
}));

router.get('/contact/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const item = await ContactMessage.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
}));

router.put('/contact/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const { status, subject, message, name, email } = req.body || {};
  const update = {};
  if (status != null) update.status = ['new','read','closed'].includes(String(status)) ? String(status) : 'new';
  if (subject != null) update.subject = String(subject);
  if (message != null) update.message = String(message);
  if (name != null) update.name = String(name);
  if (email != null) update.email = String(email);
  const item = await ContactMessage.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
}));

router.delete('/contact/:id', authRequired, adminOnly, asyncH(async (req, res) => {
  const deleted = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

export default router;
