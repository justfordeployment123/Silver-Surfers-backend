import mongoose from 'mongoose';

const FAQSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, default: '' },
    order: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FAQSchema.index({ order: 1 });
FAQSchema.index({ question: 1 }, { unique: false });

export default mongoose.model('FAQ', FAQSchema);
