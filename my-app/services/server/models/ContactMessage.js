import mongoose from 'mongoose';

const ContactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    subject: { type: String, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['new', 'read', 'closed'], default: 'new' },
  },
  { timestamps: true }
);

ContactMessageSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ContactMessage', ContactMessageSchema);
