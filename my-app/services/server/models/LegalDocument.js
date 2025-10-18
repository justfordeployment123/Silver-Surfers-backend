import mongoose from 'mongoose';

const legalDocumentSchema = new mongoose.Schema({
  // Document identification
  type: { 
    type: String, 
    enum: ['terms-of-use', 'privacy-policy', 'cookie-policy', 'data-processing-agreement', 'accessibility-guides'],
    required: true,
    index: true 
  },
  version: { type: String, required: true, default: '1.0' },
  
  // Content
  title: { type: String, required: true },
  content: { type: String, required: true }, // HTML content
  summary: { type: String }, // Brief summary for preview
  
  // Status and publishing
  status: { 
    type: String, 
    enum: ['draft', 'published', 'archived'], 
    default: 'draft',
    index: true 
  },
  effectiveDate: { type: Date, default: Date.now },
  lastModified: { type: Date, default: Date.now },
  
  // Metadata
  language: { type: String, default: 'en' },
  region: { type: String, default: 'US' }, // US, EU, etc.
  
  // Change tracking
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changeLog: [{
    version: String,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    changes: String,
    reason: String
  }],
  
  // User acceptance tracking
  acceptanceRequired: { type: Boolean, default: true },
  acceptanceDeadline: Date, // When users must accept by
  
  // SEO and display
  metaTitle: String,
  metaDescription: String,
  slug: { type: String, unique: true, index: true },
  
  // Legal compliance
  lastLegalReview: Date,
  nextReviewDue: Date,
  reviewedBy: String, // Lawyer name/contact
  
  // Related documents
  supersedes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LegalDocument' }],
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'LegalDocument' }
}, {
  timestamps: true
});

// Indexes for efficient querying
legalDocumentSchema.index({ type: 1, status: 1, effectiveDate: -1 });
legalDocumentSchema.index({ type: 1, language: 1, region: 1 });
legalDocumentSchema.index({ slug: 1 });

// Virtual for document age
legalDocumentSchema.virtual('age').get(function() {
  return Date.now() - this.effectiveDate.getTime();
});

// Virtual for days until next review
legalDocumentSchema.virtual('daysUntilReview').get(function() {
  if (!this.nextReviewDue) return null;
  return Math.ceil((this.nextReviewDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
});

// Methods
legalDocumentSchema.methods.publish = function(userId) {
  this.status = 'published';
  this.effectiveDate = new Date();
  this.lastModified = new Date();
  this.lastModifiedBy = userId;
  
  // Archive previous versions
  return this.constructor.updateMany(
    { 
      type: this.type, 
      _id: { $ne: this._id },
      status: 'published'
    },
    { 
      status: 'archived',
      supersededBy: this._id
    }
  );
};

legalDocumentSchema.methods.addChangeLog = function(version, changedBy, changes, reason) {
  this.changeLog.push({
    version,
    changedBy,
    changes,
    reason,
    changedAt: new Date()
  });
  return this.save();
};

// Static methods
legalDocumentSchema.statics.getCurrent = async function(type, language = 'en', region = 'US') {
  return this.findOne({
    type,
    language,
    region,
    status: 'published'
  }).sort({ effectiveDate: -1 });
};

legalDocumentSchema.statics.getAllTypes = async function() {
  return this.distinct('type');
};

legalDocumentSchema.statics.getVersionHistory = function(type) {
  return this.find({ type })
    .sort({ effectiveDate: -1 })
    .populate('createdBy lastModifiedBy', 'name email');
};

legalDocumentSchema.statics.getPendingReview = function() {
  return this.find({
    nextReviewDue: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // Next 30 days
  }).sort({ nextReviewDue: 1 });
};

// Pre-save middleware
legalDocumentSchema.pre('save', function(next) {
  // Generate slug if not provided
  if (!this.slug) {
    this.slug = `${this.type}-${this.version}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
  
  // Set next review date (1 year from effective date)
  if (this.isNew || this.isModified('effectiveDate')) {
    this.nextReviewDue = new Date(this.effectiveDate.getTime() + 365 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

const LegalDocument = mongoose.model('LegalDocument', legalDocumentSchema);

export default LegalDocument;