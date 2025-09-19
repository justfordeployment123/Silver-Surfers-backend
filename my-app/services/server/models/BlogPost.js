import mongoose from 'mongoose';

const BlogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, default: '' },
    content: { type: String, default: '' },
    published: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BlogPostSchema.index({ slug: 1 }, { unique: true });

export default mongoose.model('BlogPost', BlogPostSchema);
