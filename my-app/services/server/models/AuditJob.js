import mongoose from 'mongoose';

const auditJobSchema = new mongoose.Schema({
  // Basic job information
  email: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  url: { type: String, required: true },
  taskId: { type: String, unique: true, required: true, index: true },
  
  // Job type and configuration
  jobType: { 
    type: String, 
    enum: ['full-audit', 'quick-scan'], 
    required: true,
    index: true 
  },
  // Plan and device context
  planId: { type: String },
  selectedDevice: { type: String },
  
  // Status tracking
  status: { 
    type: String, 
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'], 
    default: 'queued',
    index: true 
  },
  
  // Processing details
  priority: { type: Number, default: 0 }, // Higher number = higher priority
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  
  // Error handling
  lastError: { type: String },
  failureReason: { type: String },
  
  // Timing information
  queuedAt: { type: Date, default: Date.now, index: true },
  startedAt: { type: Date },
  completedAt: { type: Date },
  estimatedDuration: { type: Number }, // in milliseconds
  
  // Results
  reportDirectory: { type: String },
  emailStatus: { 
    type: String, 
    enum: ['pending', 'sending', 'sent', 'failed'], 
    default: 'pending' 
  },
  attachmentCount: { type: Number, default: 0 },
  
  // Email details
  emailAccepted: { type: [String], default: [] },
  emailRejected: { type: [String], default: [] },
  emailError: { type: String },
  
  // Usage tracking
  scansUsed: { type: Number, default: 0 }, // How many scans this job consumed
  
  // Metadata
  userAgent: { type: String },
  ipAddress: { type: String },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  quickScanId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuickScan' }, // Link to QuickScan record
  
  // User details (for email personalization)
  firstName: { type: String },
  lastName: { type: String },
  
  // Processing context
  processingNode: { type: String }, // Which server instance is processing this
  browserLockAcquired: { type: Boolean, default: false },
  
  // Retry and recovery
  retryAfter: { type: Date }, // When to retry if failed
  retryCount: { type: Number, default: 0 },
  
  // Cleanup tracking
  cleanupRequired: { type: Boolean, default: false },
  cleanupCompleted: { type: Boolean, default: false },
  
  // Progress tracking
  progress: { 
    currentStep: { type: String },
    totalSteps: { type: Number },
    completedSteps: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
auditJobSchema.index({ status: 1, priority: -1, queuedAt: 1 }); // For job processing
auditJobSchema.index({ email: 1, createdAt: -1 }); // For user history
auditJobSchema.index({ userId: 1, createdAt: -1 }); // For user jobs
auditJobSchema.index({ status: 1, retryAfter: 1 }); // For retry processing
auditJobSchema.index({ taskId: 1 }); // For unique task lookup

// Virtual for job age
auditJobSchema.virtual('age').get(function() {
  return Date.now() - this.queuedAt.getTime();
});

// Virtual for processing duration
auditJobSchema.virtual('processingDuration').get(function() {
  if (this.startedAt && this.completedAt) {
    return this.completedAt.getTime() - this.startedAt.getTime();
  }
  return null;
});

// Methods
auditJobSchema.methods.startProcessing = function(processingNode) {
  this.status = 'processing';
  this.startedAt = new Date();
  this.processingNode = processingNode;
  this.attempts += 1;
  return this.save();
};

auditJobSchema.methods.complete = function(results = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.emailStatus = results.emailStatus || 'pending';
  this.attachmentCount = results.attachmentCount || 0;
  this.reportDirectory = results.reportDirectory;
  this.scansUsed = results.scansUsed || 1;
  this.cleanupRequired = true;
  return this.save();
};

auditJobSchema.methods.fail = function(error, failureReason) {
  this.status = 'failed';
  this.completedAt = new Date();
  this.lastError = error;
  this.failureReason = failureReason;
  
  // Calculate retry time (exponential backoff)
  const retryDelay = Math.min(1000 * Math.pow(2, this.retryCount), 300000); // Max 5 minutes
  this.retryAfter = new Date(Date.now() + retryDelay);
  this.retryCount += 1;
  
  return this.save();
};

auditJobSchema.methods.canRetry = function() {
  return this.retryCount < this.maxAttempts && this.status === 'failed';
};

auditJobSchema.methods.resetForRetry = function() {
  this.status = 'queued';
  this.startedAt = undefined;
  this.completedAt = undefined;
  this.processingNode = undefined;
  this.browserLockAcquired = false;
  this.progress = { currentStep: 'queued', totalSteps: 0, completedSteps: 0 };
  return this.save();
};

// Static methods
auditJobSchema.statics.getNextJob = async function(jobType = null) {
  const query = {
    status: 'queued',
    $or: [
      { retryAfter: { $exists: false } },
      { retryAfter: { $lte: new Date() } }
    ]
  };
  
  // Filter by job type if specified
  if (jobType) {
    query.jobType = jobType;
  }
  
  // Use findOneAndUpdate to atomically claim the job and prevent duplicate processing
  // This ensures only one worker can claim a job at a time
  const job = await this.findOneAndUpdate(
    query,
    {
      $set: {
        status: 'processing',
        startedAt: new Date()
      },
      $inc: {
        attempts: 1
      }
    },
    {
      sort: { priority: -1, queuedAt: 1 },
      new: true // Return the updated document
    }
  );
  
  return job;
};

auditJobSchema.statics.getPendingJobs = function() {
  return this.find({
    status: { $in: ['queued', 'processing'] }
  }).sort({ priority: -1, queuedAt: 1 });
};

auditJobSchema.statics.getFailedJobs = function() {
  return this.find({
    status: 'failed',
    retryCount: { $lt: 3 }
  }).sort({ retryAfter: 1 });
};

auditJobSchema.statics.getJobsByUser = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

auditJobSchema.statics.cleanupOldJobs = async function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
  
  return this.deleteMany({
    status: { $in: ['completed', 'failed', 'cancelled'] },
    completedAt: { $lt: cutoffDate }
  });
};

// Pre-save middleware
auditJobSchema.pre('save', function(next) {
  // Auto-calculate estimated duration based on job type
  if (this.isNew && !this.estimatedDuration) {
    this.estimatedDuration = this.jobType === 'full-audit' ? 300000 : 60000; // 5min or 1min
  }
  next();
});

const AuditJob = mongoose.model('AuditJob', auditJobSchema);

export default AuditJob;