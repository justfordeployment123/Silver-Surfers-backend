import mongoose from 'mongoose';

const legalAcceptanceSchema = new mongoose.Schema({
  // User and document reference
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  document: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'LegalDocument', 
    required: true,
    index: true 
  },
  
  // Acceptance details
  acceptedAt: { type: Date, default: Date.now },
  acceptedVersion: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  
  // Acceptance context
  acceptanceMethod: { 
    type: String, 
    enum: ['signup', 'login', 'mandatory-update', 'manual'],
    default: 'signup'
  },
  source: { 
    type: String,
    enum: ['web', 'mobile', 'api'],
    default: 'web'
  },
  
  // Legal compliance
  consentGiven: { type: Boolean, default: true },
  withdrawalDate: Date, // When user withdrew consent
  withdrawalReason: String,
  
  // Audit trail
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
legalAcceptanceSchema.index({ user: 1, document: 1 }, { unique: true });
legalAcceptanceSchema.index({ document: 1, acceptedAt: -1 });
legalAcceptanceSchema.index({ user: 1, acceptedAt: -1 });

// Virtual for acceptance age
legalAcceptanceSchema.virtual('age').get(function() {
  return Date.now() - this.acceptedAt.getTime();
});

// Virtual for days since acceptance
legalAcceptanceSchema.virtual('daysSinceAcceptance').get(function() {
  return Math.floor((Date.now() - this.acceptedAt.getTime()) / (1000 * 60 * 60 * 24));
});

// Methods
legalAcceptanceSchema.methods.withdrawConsent = function(reason) {
  this.consentGiven = false;
  this.withdrawalDate = new Date();
  this.withdrawalReason = reason;
  this.updatedAt = new Date();
  return this.save();
};

legalAcceptanceSchema.methods.isValid = function() {
  return this.consentGiven && !this.withdrawalDate;
};

// Static methods
legalAcceptanceSchema.statics.getUserAcceptances = function(userId) {
  return this.find({ user: userId })
    .populate('document', 'type title version effectiveDate')
    .sort({ acceptedAt: -1 });
};

legalAcceptanceSchema.statics.hasAccepted = function(userId, documentId) {
  return this.findOne({ 
    user: userId, 
    document: documentId,
    consentGiven: true,
    withdrawalDate: { $exists: false }
  });
};

legalAcceptanceSchema.statics.getAcceptanceStats = async function(documentId) {
  const stats = await this.aggregate([
    { $match: { document: mongoose.Types.ObjectId(documentId) } },
    {
      $group: {
        _id: null,
        totalAcceptances: { $sum: 1 },
        activeAcceptances: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$consentGiven', true] }, { $not: '$withdrawalDate' }] },
              1,
              0
            ]
          }
        },
        withdrawnAcceptances: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$consentGiven', false] }, { $ne: ['$withdrawalDate', null] }] },
              1,
              0
            ]
          }
        },
        avgAcceptanceTime: { $avg: '$acceptedAt' }
      }
    }
  ]);
  
  return stats[0] || {
    totalAcceptances: 0,
    activeAcceptances: 0,
    withdrawnAcceptances: 0,
    avgAcceptanceTime: null
  };
};

legalAcceptanceSchema.statics.getPendingAcceptances = function() {
  // Find users who haven't accepted current versions of required documents
  return this.aggregate([
    {
      $lookup: {
        from: 'legaldocuments',
        localField: 'document',
        foreignField: '_id',
        as: 'document'
      }
    },
    {
      $match: {
        'document.status': 'published',
        'document.acceptanceRequired': true
      }
    },
    {
      $group: {
        _id: '$user',
        acceptedDocuments: { $addToSet: '$document.type' }
      }
    }
  ]);
};

// Pre-save middleware
legalAcceptanceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const LegalAcceptance = mongoose.model('LegalAcceptance', legalAcceptanceSchema);

export default LegalAcceptance;