import { Router } from 'express';
import BlogPost from '../models/BlogPost.js';
import FAQ from '../models/FAQ.js';

const router = Router();

router.get('/blogs', async (req, res) => {
  try {
    const publishedOnly = req.query.published !== 'false';
    const q = publishedOnly ? { published: true } : {};
    const items = await BlogPost.find(q).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    console.error('Public blogs error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

router.get('/blogs/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const publishedOnly = req.query.published !== 'false';
    
    const query = { slug };
    if (publishedOnly) {
      query.published = true;
    }
    
    const post = await BlogPost.findOne(query).lean();
    
    if (!post) {
      return res.status(404).json({ error: 'Blog post not found' });
    }
    
    res.json({ post });
  } catch (err) {
    console.error('Single blog post error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

router.get('/faqs', async (req, res) => {
  try {
    const publishedOnly = req.query.published !== 'false';
    const q = publishedOnly ? { published: true } : {};
    const items = await FAQ.find(q).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    console.error('Public FAQs error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

export default router;




