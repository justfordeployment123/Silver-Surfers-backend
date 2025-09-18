import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import authRoutes from './authRoutes.js';
import { connectDB } from './db.js';
import { authRequired } from './auth.js';

// Load env from project root (three levels up)
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });


// --- Your Project Modules (CORRECTED IMPORT) ---
import { InternalLinksExtractor } from '../internal_links/internal_links.js';
import { runLighthouseAudit } from '../load_and_audit/audit.js'; // Changed to your modified audit module
import { runLighthouseLiteAudit } from '../load_and_audit/audit-module-with-lite.js'; // Keep lite for quick scans
import { generateSeniorAccessibilityReport } from '../report_generation/pdf_generator.js';
import { createAllHighlightedImages } from '../drawing_boxes/draw_all.js';
import { generateLiteAccessibilityReport } from '../report_generation/pdf-generator-lite.js';
import { sendAuditReportEmail } from './email.js';

// --- Placeholder for signaling the backend (assumed to be the same) ---
const signalBackend = async (payload) => {
    const backendEndpoint = 'http://localhost:8000/api/audit-status';
    console.log(`\n📡 Signaling backend at ${backendEndpoint} with status: ${payload.status}`);
    console.log('Payload:', payload);
};

// --- Logic for FULL AUDIT and QUICK SCAN (Unchanged from your code) ---
// =================================================================
// ## PASTE THIS CODE INTO YOUR SERVER FILE ##
// =================================================================

const runFullAuditProcess = async (job) => {
  const { email, url } = job;
  console.log(`\n\n--- [STARTING FULL JOB] ---`);
  console.log(`Processing job for ${email} to audit ${url}`);

  // Final destination for generated PDFs
  const finalReportFolder = path.resolve(process.cwd(), 'reports-full', email);

  // Temporary working folder for images and intermediates
  const sanitizedEmail = email.replace(/[^a-z0-9]/gi, '_');
  const jobFolder = path.resolve(process.cwd(), 'reports', `${sanitizedEmail}-${Date.now()}`);

  // Ensure folders exist
  await fs.mkdir(finalReportFolder, { recursive: true });
  await fs.mkdir(jobFolder, { recursive: true });

  try {
    const extractor = new InternalLinksExtractor();
    const extractionResult = await extractor.extractInternalLinks(url);

    if (!extractionResult.success) {
      throw new Error(`Link extraction failed: ${extractionResult.details}`);
    }

    const linksToAudit = extractionResult.links;
    console.log(`Found ${linksToAudit.length} links for full audit.`);

    for (const link of linksToAudit) {
      for (const device of ['desktop', 'mobile']) {
        console.log(`--- Starting full ${device} audit for: ${link} ---`);
        let jsonReportPath = null;
        let imagePaths = {};

        try {
          const auditResult = await runLighthouseAudit({ url: link, device, format: 'json' });
          if (auditResult.success) {
            jsonReportPath = auditResult.reportPath;
            imagePaths = await createAllHighlightedImages(jsonReportPath, jobFolder);

            await generateSeniorAccessibilityReport({
              inputFile: jsonReportPath,
              clientEmail: email,
              imagePaths,
              outputDir: finalReportFolder,
            });
          } else {
            console.error(`Skipping full report for ${link} (${device}). Reason: ${auditResult.error}`);
          }
        } catch (pageError) {
          console.error(`An unexpected error occurred while auditing ${link} (${device}):`, pageError.message);
        } finally {
          if (jsonReportPath) await fs.unlink(jsonReportPath).catch((e) => console.error(e.message));
          if (imagePaths && typeof imagePaths === 'object') {
            for (const imgPath of Object.values(imagePaths)) {
              if (imgPath) await fs.unlink(imgPath).catch((e) => console.error(e.message));
            }
          }
        }
      }
    }

    console.log(`🎉 All links for ${email} have been processed for both desktop and mobile.`);

    // Send a single email with all files in the report folder
    await sendAuditReportEmail({
      to: email,
      subject: 'Your SilverSurfers Audit Results',
      text: 'Attached are all your senior accessibility audit results. Thank you for using SilverSurfers!',
      folderPath: finalReportFolder,
    });

    // Cleanup the report folder using the cleanup route
    try {
      const axios = await import('axios');
      const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${PORT}`;
      await axios.default.post(`${apiBaseUrl}/cleanup`, { folderPath: finalReportFolder });
      console.log('Report folder cleaned up:', finalReportFolder);
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    await signalBackend({
      status: 'completed',
      clientEmail: email,
      folderPath: finalReportFolder,
    });
  } catch (jobError) {
    console.error(`A critical error occurred during the full job for ${email}:`, jobError.message);
    await signalBackend({ status: 'failed', clientEmail: email, error: jobError.message });
  } finally {
    // Always cleanup temp working folder
    await fs.rm(jobFolder, { recursive: true, force: true }).catch(() => {});
  }
};

const runQuickScanProcess = async (job) => {
    const { email, url } = job;
    console.log(`\n--- [STARTING QUICK SCAN] ---`);
    console.log(`Processing quick scan for ${email} on ${url}`);
    
    let jsonReportPath = null;
    
    try {
        const liteAuditResult = await runLighthouseLiteAudit({
            url: url,
            device: 'desktop',
            format: 'json'
        });

        if (!liteAuditResult.success) {
            throw new Error(`Lite audit failed: ${liteAuditResult.error}`);
        }

        jsonReportPath = liteAuditResult.reportPath;
        console.log(`Lite audit successful. Temp JSON at: ${jsonReportPath}`);

        const baseReportsDir = 'reports-lite';
        const userSpecificOutputDir = path.join(baseReportsDir, `${email}_lite`);

          const pdfResult = await generateLiteAccessibilityReport(jsonReportPath, userSpecificOutputDir);

        console.log(`✅ Quick scan PDF generated for ${email} at ${pdfResult.reportPath}`);
        return pdfResult;

    } catch (error) {
        console.error(`A critical error occurred during the quick scan for ${email}:`, error.message);
        throw error;
    } finally {
        if (jsonReportPath) {
            await fs.unlink(jsonReportPath).catch(e => console.error(`Failed to delete temp file ${jsonReportPath}:`, e.message));
        }
    }
};

// =================================================================
// ## 1. SHARED STATE (The Global Lock) ##
// =================================================================
let isBrowserInUse = false; // This is the single, shared lock for both queues.
// Track active/queued jobs to avoid duplicates (same email+url)
const activeJobs = new Set();
const jobKey = (job) => `${job.email || ''}::${job.url || ''}`;

// =================================================================
// ## 2. The JobQueue Class (Updated to use the shared lock) ##
// =================================================================

class JobQueue {
    constructor(processFunction, queueName = 'Unnamed') {
        this.processFunction = processFunction;
        this.queue = [];
        this.queueName = queueName; // For better logging
    }

  addBgJob(job) {
    const key = jobKey(job);
    // Skip if same job is already queued or running
    if (activeJobs.has(key) || this.queue.some(t => jobKey(t.job) === key)) {
      console.log(`[${this.queueName}] Duplicate job skipped for ${job.email} (${job.url}).`);
      return;
    }
    activeJobs.add(key);
    this.queue.push({ job, key, isBg: true });
    this.processQueue();
  }

  addRequestJob(job) {
    return new Promise((resolve, reject) => {
      const key = jobKey(job);
      if (activeJobs.has(key) || this.queue.some(t => jobKey(t.job) === key)) {
        console.log(`[${this.queueName}] Duplicate request job skipped for ${job.email} (${job.url}).`);
        return resolve({ skipped: true, reason: 'duplicate' });
      }
      activeJobs.add(key);
      this.queue.push({ job, key, resolve, reject, isBg: false });
      this.processQueue();
    });
  }

    async processQueue() {
        // CRITICAL CHANGE: Check the GLOBAL lock, not an internal one.
        if (isBrowserInUse || this.queue.length === 0) {
            return;
        }

        // CRITICAL CHANGE: Set the GLOBAL lock to true.
        isBrowserInUse = true;
        
  const task = this.queue.shift();
        console.log(`[${this.queueName}] picked up job for ${task.job.email}. Browser is now locked.`);
        
        try {
            const result = await this.processFunction(task.job);
            if (!task.isBg) {
                task.resolve(result);
            }
        } catch (error) {
            console.error(`Job runner error in [${this.queueName}] for ${task.job.email}:`, error.message);
            if (!task.isBg) {
                task.reject(error);
            }
        } finally {
            // CRITICAL CHANGE: Release the GLOBAL lock so the next job can run.
      console.log(`[${this.queueName}] finished job for ${task.job.email}. Releasing browser lock.`);
            isBrowserInUse = false;
      if (task && task.key) {
        activeJobs.delete(task.key);
      }
            
            // IMPORTANT: After releasing the lock, we must trigger BOTH queues
            // to check if they can start a new job.
            fullAuditQueue.processQueue();
            quickScanQueue.processQueue();
        }
    }
}


// =================================================================
// ## 3. The Express Server (Updated to instantiate queues correctly) ##
// =================================================================

const app = express();
app.use(express.json());
app.use(cors());
app.use('/auth', authRoutes);
const PORT = process.env.PORT || 5000;

// --- Create two independent queues that will share the global lock ---
const fullAuditQueue = new JobQueue(runFullAuditProcess, 'FullAuditQueue');
const quickScanQueue = new JobQueue(runQuickScanProcess, 'QuickScanQueue');

// --- Endpoints (No changes needed here) ---

// Initialize Database
await (async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await connectDB(mongoUri);
  } catch (err) {
    console.warn('Continuing without DB due to connection error. Some features may be limited.');
  }
})();

app.post('/start-audit', (req, res) => {
    const { email, url } = req.body;
    if (!email || !url) {
        return res.status(400).json({ error: 'Email and URL are required.' });
    }
    fullAuditQueue.addBgJob({ email, url });
    res.status(202).json({ message: 'Full audit request has been queued.' });
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', authRequired, async (req, res) => {
  try {
    const { email, url, packageId } = req.body || {};
    if (!email || !url) {
      return res.status(400).json({ error: 'Email and URL are required.' });
    }

    // Map packageId to price amount (in cents)
    const packagePricing = {
      1: 29900, // Senior-Friendly Assessment €299
      2: 150000, // Full Accessibility Optimization from €1,500
      3: 250000, // Premium Senior Experience from €2,500
    };
    const amount = packagePricing[packageId] || packagePricing[1];

    const successUrlBase = process.env.FRONTEND_URL || 'http://localhost:3001';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'SilverSurfers Assessment' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: { email, url, packageId: String(packageId || 1) },
      success_url: `${successUrlBase}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successUrlBase}/checkout?canceled=1`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// Confirm payment and start audit after successful checkout
app.get('/confirm-payment', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    const session = await stripe.checkout.sessions.retrieve(String(session_id));
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed yet.' });
    }

    const email = session.metadata?.email;
    const url = session.metadata?.url;
    if (!email || !url) {
      return res.status(400).json({ error: 'Missing metadata to start audit.' });
    }

  // Queue the full audit as a background job after successful payment
  fullAuditQueue.addBgJob({ email, url });
    return res.json({ message: 'Payment confirmed. Audit job queued.' });
  } catch (err) {
    console.error('Confirm payment error:', err);
    return res.status(500).json({ error: 'Failed to confirm payment.' });
  }
});

app.post('/cleanup', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath is required.' });
  }
  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    res.status(200).json({ message: 'Cleanup successful.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform cleanup.' });
  }
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Audit server listening on port ${PORT}`);
});
