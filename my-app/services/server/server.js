import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import { PersistentQueue } from './queue/PersistentQueue.js';
import { runFullAuditProcess, runQuickScanProcess } from './services/auditService.js';
import { corsMiddleware } from './middleware/cors.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { PORT, PROCESSING_TIMEOUT_MS, QUEUED_TIMEOUT_MS, WATCHDOG_INTERVAL_MS } from './config/constants.js';
import AnalysisRecord from './models/AnalysisRecord.js';

// Routes
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import stripeRoutes from './routes/stripeRoutes.js';
import recordsRoutes from './routes/recordsRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import legalRoutes from './routes/legalRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import adminAdditionalRoutes from './routes/adminAdditionalRoutes.js';

// Load env from project root (three levels up)
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

const app = express();

// Middleware
app.use(securityHeaders);
app.use(corsMiddleware);
app.use('/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Mount routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/admin', adminAdditionalRoutes);
app.use('/', auditRoutes);
app.use('/', stripeRoutes);
app.use('/', recordsRoutes);
app.use('/', contentRoutes);
app.use('/', subscriptionRoutes);
app.use('/', teamRoutes);
app.use('/', legalRoutes);
app.use('/', contactRoutes);

// Initialize Database and Persistent Queues
let fullAuditQueue, quickScanQueue;

await (async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await connectDB(mongoUri);
    console.log('✅ Database connected successfully');
    
    // Create queue instances
    fullAuditQueue = new PersistentQueue('FullAudit', runFullAuditProcess, {
      concurrency: 5,  // Allow 5 parallel scans
      maxRetries: 3,
      retryDelay: 10000
    });

    quickScanQueue = new PersistentQueue('QuickScan', runQuickScanProcess, {
      concurrency: 5,  // Allow 5 parallel scans
      maxRetries: 3,
      retryDelay: 5000
    });
    
    // Start persistent queues
    await fullAuditQueue.start();
    await quickScanQueue.start();
    
    // Recover any orphaned jobs
    await fullAuditQueue.recoverJobs();
    await quickScanQueue.recoverJobs();
    
    console.log('✅ Persistent queues started and recovered');
    
    // Inject queues into controllers that need them
    const auditController = await import('./controllers/auditController.js');
    auditController.setQueues(fullAuditQueue, quickScanQueue);
    
    const adminController = await import('./controllers/adminController.js');
    adminController.setQueues(fullAuditQueue, quickScanQueue);
  } catch (err) {
    console.error('❌ Database connection error:', err);
    console.warn('Continuing without DB due to connection error. Some features may be limited.');
  }
})();

// Watchdog: prevent records from staying stuck in queued/processing
const START_WATCHDOG = true;
if (START_WATCHDOG) {
  setInterval(async () => {
    try {
      const now = Date.now();
      const procCutoff = new Date(now - PROCESSING_TIMEOUT_MS);
      const queuedCutoff = new Date(now - QUEUED_TIMEOUT_MS);

      const procResult = await AnalysisRecord.updateMany(
        { status: 'processing', updatedAt: { $lt: procCutoff } },
        { $set: { status: 'failed', failureReason: 'Processing watchdog timeout exceeded.' } }
      );
      const queuedResult = await AnalysisRecord.updateMany(
        { status: 'queued', updatedAt: { $lt: queuedCutoff } },
        { $set: { status: 'failed', failureReason: 'Queued watchdog timeout exceeded.' } }
      );
      if ((procResult?.modifiedCount || 0) > 0 || (queuedResult?.modifiedCount || 0) > 0) {
        console.log(`🕒 Watchdog updated: processing->failed=${procResult?.modifiedCount || 0}, queued->failed=${queuedResult?.modifiedCount || 0}`);
      }
    } catch (e) {
      console.error('Watchdog error:', e?.message || e);
    }
  }, WATCHDOG_INTERVAL_MS).unref();
}

// Graceful shutdown handling
async function gracefulShutdown() {
  try {
    console.log('🔄 Stopping persistent queues...');
    await fullAuditQueue?.stop();
    await quickScanQueue?.stop();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await gracefulShutdown();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Audit server listening on port ${PORT}`);
});

