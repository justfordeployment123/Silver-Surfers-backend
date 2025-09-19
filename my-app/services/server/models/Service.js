import mongoose from 'mongoose';

const ServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    priceCents: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ServiceSchema.index({ slug: 1 }, { unique: true });

export default mongoose.model('Service', ServiceSchema);
