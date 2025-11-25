import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    provider: { type: String, enum: ['local', 'google'], default: 'local' },
    verified: { type: Boolean, default: true },
    // Optional fields for future email verification & password reset
    verificationTokenHash: { type: String },
    verificationExpires: { type: Date },
    resetTokenHash: { type: String },
    resetExpires: { type: Date },
    googleId: { type: String },
    // Subscription fields
    stripeCustomerId: { type: String, index: true },
    subscription: {
      stripeSubscriptionId: { type: String },
      status: { type: String, enum: ['active', 'canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'trialing', 'paused', 'none'], default: 'none' },
      currentPeriodStart: { type: Date },
      currentPeriodEnd: { type: Date },
      cancelAtPeriodEnd: { type: Boolean, default: false },
      planId: { type: String, enum: ['starter', 'pro', 'custom'], default: null },
      priceId: { type: String }, // Stripe price ID
      usage: {
        scansThisMonth: { type: Number, default: 0 },
        lastResetDate: { type: Date, default: Date.now }
      },
      // Team management fields
      teamMembers: [{ 
        email: { type: String, required: true },
        status: { type: String, enum: ['pending', 'active'], default: 'pending' },
        invitedAt: { type: Date, default: Date.now },
        joinedAt: { type: Date }
      }],
      isTeamMember: { type: Boolean, default: false },
      teamOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Reference to owner if member
    },
    // One-time purchase credits
    oneTimeScans: { type: Number, default: 0 },
    purchaseHistory: [{
      date: { type: Date, default: Date.now },
      planId: { type: String },
      planName: { type: String },
      amount: { type: Number },
      sessionId: { type: String },
      type: { type: String, enum: ['one-time', 'subscription'], default: 'one-time' }
    }]
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });

export default mongoose.model('User', UserSchema);
