import mongoose from 'mongoose';

const BlogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, default: '' },
    content: { type: String, default: '' },
    // Extended metadata fields for public posts
    category: { type: String, default: '' },
    author: { type: String, default: '' },
    date: { type: Date },
    readTime: { type: String, default: '' },
    featured: { type: Boolean, default: false },
    published: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BlogPostSchema.index({ slug: 1 }, { unique: true });
BlogPostSchema.index({ featured: 1, date: -1 });

export default mongoose.model('BlogPost', BlogPostSchema);
