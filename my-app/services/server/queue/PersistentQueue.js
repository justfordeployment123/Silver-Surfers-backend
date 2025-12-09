import AuditJob from '../models/AuditJob.js';

class PersistentQueue {
  constructor(queueName, processFunction, options = {}) {
    this.queueName = queueName;
    this.processFunction = processFunction;
    this.options = {
      concurrency: options.concurrency || 1,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 5000,
      cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
      ...options
    };
    
    // Map queue name to job type
    this.jobType = queueName === 'FullAudit' ? 'full-audit' : 'quick-scan';
    
    this.isProcessing = false;
    this.processingJobs = new Set();
    this.cleanupInterval = null;
    this.isShuttingDown = false;
  }

  // Start the queue processing
  async start() {
    console.log(`🚀 Starting persistent queue: ${this.queueName}`);
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.options.cleanupInterval);
    
    // Start processing
    this.isProcessing = true;
    await this.processQueue();
  }

  // Stop the queue processing
  async stop() {
    console.log(`🛑 Stopping persistent queue: ${this.queueName}`);
    this.isShuttingDown = true;
    this.isProcessing = false;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Wait for current jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.processingJobs.size > 0 && (Date.now() - startTime) < timeout) {
      console.log(`⏳ Waiting for ${this.processingJobs.size} jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.processingJobs.size > 0) {
      console.warn(`⚠️  Force stopping with ${this.processingJobs.size} jobs still processing`);
      // Mark processing jobs as failed
      for (const jobId of this.processingJobs) {
        try {
          const job = await AuditJob.findById(jobId);
          if (job && job.status === 'processing') {
            await job.fail('Server shutdown', 'Job was processing when server stopped');
          }
        } catch (error) {
          console.error(`Error marking job ${jobId} as failed:`, error);
        }
      }
    }
  }

  // Add a job to the queue
  async addJob(jobData) {
    try {
      const job = new AuditJob({
        ...jobData,
        status: 'queued',
        queuedAt: new Date()
      });
      
      await job.save();
      console.log(`✅ Job added to ${this.queueName} queue: ${job.taskId}`);
      
      // Always nudge the processor; it respects concurrency limits and will no-op if busy
      if (!this.isProcessing) {
        this.isProcessing = true;
      }
      this.processQueue();
      
      return job;
    } catch (error) {
      console.error(`❌ Failed to add job to ${this.queueName} queue:`, error);
      throw error;
    }
  }

  // Process the queue
  async processQueue() {
    if (this.isShuttingDown || !this.isProcessing) {
      return;
    }

    try {
      // Check if we can process more jobs
      if (this.processingJobs.size >= this.options.concurrency) {
        setTimeout(() => this.processQueue(), 1000);
        return;
      }

      // Get next job for this specific queue type
      const job = await AuditJob.getNextJob(this.jobType);
      
      if (!job) {
        // No jobs available, check again in a bit
        setTimeout(() => this.processQueue(), 5000);
        return;
      }

      // Start processing the job
      this.processingJobs.add(job._id);
      
      try {
        await job.startProcessing(process.env.NODE_ENV || 'development');
        console.log(`🔄 Processing job ${job.taskId} in ${this.queueName}`);
        
        // Execute the job - Pass all relevant job data including custom fields
        const result = await this.processFunction({
          email: job.email,
          url: job.url,
          userId: job.userId,
          taskId: job.taskId,
          quickScanId: job.quickScanId, // For quick scan score updates
          firstName: job.firstName,
          lastName: job.lastName,
          planId: job.planId,
          selectedDevice: job.selectedDevice,
          jobType: job.jobType
        });
        
        // Mark as completed
        await job.complete(result);
        console.log(`✅ Job ${job.taskId} completed successfully`);
        
      } catch (error) {
        console.error(`❌ Job ${job.taskId} failed:`, error);
        await job.fail(error.message, error.message);
        
        // If job can be retried, it will be picked up later
        if (job.canRetry()) {
          console.log(`🔄 Job ${job.taskId} will be retried`);
        } else {
          console.log(`💀 Job ${job.taskId} exceeded max retries`);
        }
      } finally {
        this.processingJobs.delete(job._id);
        
        // Continue processing
        if (!this.isShuttingDown) {
          setTimeout(() => this.processQueue(), 100);
        }
      }
      
    } catch (error) {
      console.error(`❌ Queue processing error in ${this.queueName}:`, error);
      setTimeout(() => this.processQueue(), 5000);
    }
  }

  // Recover jobs from previous server instance
  async recoverJobs() {
    console.log(`🔍 Recovering jobs for ${this.queueName}...`);
    
    try {
      // Find jobs that were processing when server stopped
      const orphanedJobs = await AuditJob.find({
        status: 'processing',
        processingNode: { $exists: true }
      });
      
      console.log(`📋 Found ${orphanedJobs.length} orphaned jobs`);
      
      for (const job of orphanedJobs) {
        try {
          // Reset the job for retry
          await job.resetForRetry();
          console.log(`🔄 Reset orphaned job: ${job.taskId}`);
        } catch (error) {
          console.error(`❌ Failed to reset job ${job.taskId}:`, error);
        }
      }
      
      // Also check for failed jobs that might need retry
      const failedJobs = await AuditJob.getFailedJobs();
      console.log(`📋 Found ${failedJobs.length} failed jobs for potential retry`);
      
    } catch (error) {
      console.error(`❌ Error during job recovery:`, error);
    }
  }

  // Get queue statistics
  async getStats() {
    const stats = await AuditJob.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statsObj = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0
    };
    
    stats.forEach(stat => {
      statsObj[stat._id] = stat.count;
      statsObj.total += stat.count;
    });
    
    return {
      ...statsObj,
      processingJobs: this.processingJobs.size,
      isProcessing: this.isProcessing,
      queueName: this.queueName
    };
  }

  // Cleanup old completed jobs
  async performCleanup() {
    try {
      const result = await AuditJob.cleanupOldJobs(30); // 30 days
      if (result.deletedCount > 0) {
        console.log(`🧹 Cleaned up ${result.deletedCount} old jobs`);
      }
    } catch (error) {
      console.error(`❌ Error during cleanup:`, error);
    }
  }

  // Get jobs by user
  async getUserJobs(userId, limit = 50) {
    return AuditJob.getJobsByUser(userId, limit);
  }

  // Get job by task ID
  async getJob(taskId) {
    return AuditJob.findOne({ taskId });
  }

  // Cancel a job
  async cancelJob(taskId) {
    const job = await AuditJob.findOne({ taskId });
    if (job && job.status === 'queued') {
      job.status = 'cancelled';
      job.completedAt = new Date();
      await job.save();
      return true;
    }
    return false;
  }

  // Get pending jobs count
  async getPendingCount() {
    return AuditJob.countDocuments({
      status: { $in: ['queued', 'processing'] }
    });
  }
}

export { PersistentQueue };