import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
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
import { sendAuditReportEmail, collectAttachmentsRecursive } from './email.js';
import AnalysisRecord from './models/AnalysisRecord.js';
import BlogPost from './models/BlogPost.js';
import FAQ from './models/FAQ.js';
import ContactMessage from './models/ContactMessage.js';

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
  const { email, url, userId, taskId } = job;
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

  // Find existing queued record by taskId (preferred) or by email/url; otherwise create one
  let record = null;
  try {
    if (taskId) {
      record = await AnalysisRecord.findOne({ taskId });
    }
    if (!record) {
      record = await AnalysisRecord.findOne({ email, url, status: 'queued' }, {}, { sort: { createdAt: -1 } });
    }
    if (!record) {
      record = await AnalysisRecord.create({
        user: userId || undefined,
        email,
        url,
        taskId: taskId || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        status: 'queued',
        emailStatus: 'pending',
        reportDirectory: finalReportFolder,
      });
    }
    // Move to processing and persist destination folder
    record.status = 'processing';
    record.reportDirectory = finalReportFolder;
    await record.save().catch(()=>{});

    const extractor = new InternalLinksExtractor();
    const extractionResult = await extractor.extractInternalLinks(url);

    if (!extractionResult.success) {
      throw new Error(`Link extraction failed: ${extractionResult.details}`);
    }

    const linksToAudit = extractionResult.links;
    console.log(`Found ${linksToAudit.length} links for full audit.`);

    for (const link of linksToAudit) {
      for (const device of ['desktop', 'mobile','tablet']) {
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
              formFactor: device // <-- Add this line to pass the device type
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

    // Pre-check attachments to ensure we have content to send
    const attachmentsPreview = await collectAttachmentsRecursive(finalReportFolder).catch(() => []);
    if (record) {
      record.attachmentCount = Array.isArray(attachmentsPreview) ? attachmentsPreview.length : 0;
      await record.save().catch(()=>{});
    }

    // If no attachments were produced, treat as a failed job instead of "completed"
    if (!attachmentsPreview || attachmentsPreview.length === 0) {
      const defaultReason = 'No reports generated (0 attachments). Possible browser/runtime issue (e.g., missing Chromium).';
      console.error(`❌ No attachments found for ${email}. Marking record as failed.`);
      if (record) {
        record.status = 'failed';
        record.failureReason = record.failureReason || defaultReason;
        // Use a valid enum value for emailStatus to avoid validation errors
        record.emailStatus = 'failed';
        record.emailError = 'Email skipped because no attachments were generated.';
        record.attachmentCount = 0;
        await record.save().catch(()=>{});
      }
      await signalBackend({ status: 'failed', clientEmail: email, error: 'no-attachments' });
      return; // Exit early to avoid sending email and marking as completed
    }
    // Send a single email with all files in the report folder
    if (record) { record.emailStatus = 'sending'; await record.save().catch(()=>{}); }
    const sendResult = await sendAuditReportEmail({
      to: email,
      subject: 'Your SilverSurfers Audit Results',
      text: 'Attached are all your senior accessibility audit results. Thank you for using SilverSurfers!',
      folderPath: finalReportFolder,
    });
    if (record) {
      if (sendResult?.success) {
        record.emailStatus = 'sent';
        record.emailAccepted = sendResult.accepted || [];
        record.emailRejected = sendResult.rejected || [];
        record.attachmentCount = typeof sendResult.attachmentCount === 'number' ? sendResult.attachmentCount : record.attachmentCount;
      } else {
        record.emailStatus = 'failed';
        record.emailError = sendResult?.error || 'Unknown send error';
      }
      await record.save().catch(()=>{});
    }

    // Cleanup the report folder using the cleanup route
    try {
      const axios = await import('axios');
      const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${PORT}`;
      await axios.default.post(`${apiBaseUrl}/cleanup`, { folderPath: finalReportFolder });
      console.log('Report folder cleaned up:', finalReportFolder);
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    // Normalize final status: mark failed if email failed or attachments are zero; otherwise completed
    if (record) {
      if (record.emailStatus === 'failed') {
        record.status = 'failed';
        record.failureReason = record.failureReason || `Email send failed: ${record.emailError || 'Unknown error'}`;
      } else if (!record.attachmentCount || record.attachmentCount === 0) {
        record.status = 'failed';
        record.failureReason = record.failureReason || 'No reports generated (0 attachments).';
      } else {
        record.status = 'completed';
      }
      await record.save().catch(()=>{});
    }
    await signalBackend({
      status: 'completed',
      clientEmail: email,
      folderPath: finalReportFolder,
    });
  } catch (jobError) {
    console.error(`A critical error occurred during the full job for ${email}:`, jobError.message);
    if (record) { record.status = 'failed'; record.failureReason = jobError.message; await record.save().catch(()=>{}); }
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

        // Send the quick scan report via email (attachments from the output folder)
        await sendAuditReportEmail({
          to: email,
          subject: 'Your SilverSurfers Quick Scan Results',
          text: 'Attached is your senior-friendly quick scan report. Thanks for trying SilverSurfers! For a full multi-page audit with screenshots and detailed guidance, consider upgrading.',
          folderPath: userSpecificOutputDir,
        });

        // Cleanup the quick scan folder using the cleanup route (same pattern as full audit)
        try {
          const axios = await import('axios');
          const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${PORT}`;
          await axios.default.post(`${apiBaseUrl}/cleanup`, { folderPath: userSpecificOutputDir });
          console.log('Quick scan folder cleaned up:', userSpecificOutputDir);
        } catch (cleanupErr) {
          console.error('Quick scan cleanup error:', cleanupErr?.message || cleanupErr);
        }

        // Signal backend that quick scan is completed
        await signalBackend({
          status: 'completed',
          mode: 'quick',
          clientEmail: email,
          folderPath: userSpecificOutputDir,
        });

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
app.use(cors({ origin: '*' }));
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
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

// ------------------------------------------------------------
// URL Precheck utilities
// ------------------------------------------------------------
function buildCandidateUrls(input) {
  const original = (input || '').trim();
  const out = { input: original, candidateUrls: [] };
  if (!original) return out;
  try {
    // If it already parses with a scheme, keep it first
    const u = new URL(original);
    out.candidateUrls.push(u.toString());
  } catch {
    // Try common schemes and www
    const bare = original.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const variants = [
      `https://${bare}`,
      `http://${bare}`,
      `https://www.${bare}`,
      `http://www.${bare}`,
    ];
    out.candidateUrls.push(...variants);
  }
  // Deduplicate while preserving order
  out.candidateUrls = [...new Set(out.candidateUrls)];
  return out;
}

async function tryFetch(url, timeoutMs = 8000) {
  try {
    const axios = (await import('axios')).default;
    const resp = await axios.get(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    const finalUrl = resp.request?.res?.responseUrl || resp.request?.responseURL || url;
    const ok = resp.status >= 200 && resp.status < 400;
    return { ok, status: resp.status, redirected: finalUrl !== url, finalUrl };
  } catch (e) {
    return { ok: false, error: e?.message || 'request failed' };
  }
}

// URL precheck endpoint
app.post('/precheck-url', async (req, res) => {
  const { url } = req.body || {};
  const { candidateUrls, input } = buildCandidateUrls(url);
  if (!candidateUrls.length) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }
  let last = null;
  for (const candidate of candidateUrls) {
    const result = await tryFetch(candidate, 8000);
    last = result;
    if (result.ok) {
      return res.json({ success: true, input, normalizedUrl: candidate, finalUrl: result.finalUrl, status: result.status, redirected: !!result.redirected });
    }
  }
  return res.status(400).json({ success: false, input, error: 'URL not reachable. Please check the domain and try again.' });
});

app.post('/start-audit', async (req, res) => {
  const { email, url, userId } = req.body || {};
  if (!email || !url) {
    return res.status(400).json({ error: 'Email and URL are required.' });
  }
  // Precheck and normalize URL
  const { candidateUrls } = buildCandidateUrls(url);
  if (!candidateUrls.length) return res.status(400).json({ error: 'Invalid URL' });
  let normalizedUrl = null;
  for (const candidate of candidateUrls) {
    const r = await tryFetch(candidate, 8000);
    if (r.ok) { normalizedUrl = r.finalUrl || candidate; break; }
  }
  if (!normalizedUrl) return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });

  // Pre-create a queued record so clients can see it immediately
  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  AnalysisRecord.create({
    user: userId || undefined,
    email,
    url: normalizedUrl,
    taskId,
    status: 'queued',
    emailStatus: 'pending',
  }).catch(() => {});

  fullAuditQueue.addBgJob({ email, url: normalizedUrl, userId, taskId });
  res.status(202).json({ message: 'Full audit request has been queued.' });
});

app.post('/quick-audit', async (req, res) => {
  const { email, url } = req.body || {};
  if (!email || !url) {
    return res.status(400).json({ error: 'Email and URL are required.' });
  }
  // Precheck and normalize URL
  const { candidateUrls } = buildCandidateUrls(url);
  if (!candidateUrls.length) return res.status(400).json({ error: 'Invalid URL' });
  let normalizedUrl = null;
  for (const candidate of candidateUrls) {
    const r = await tryFetch(candidate, 8000);
    if (r.ok) { normalizedUrl = r.finalUrl || candidate; break; }
  }
  if (!normalizedUrl) return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });

  quickScanQueue.addBgJob({ email, url: normalizedUrl });
  res.status(202).json({ message: 'Quick audit request has been queued.' });
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
      1: 5000
    };
    const amount = packagePricing[packageId] || packagePricing[1];

    const successUrlBase = process.env.FRONTEND_URL || 'http://localhost:3000';

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

    // Idempotency: if we've already processed this session, do not enqueue again
    let existing = await AnalysisRecord.findOne({ stripeSessionId: session.id });
    if (!existing) {
      // Or if there's already a queued/processing record for this email+url, reuse it
      existing = await AnalysisRecord.findOne({ email, url, status: { $in: ['queued','processing'] } }, {}, { sort: { createdAt: -1 } });
    }

    if (existing) {
      // Ensure the session id is linked for future idempotency
      if (!existing.stripeSessionId) {
        existing.stripeSessionId = session.id;
        await existing.save().catch(()=>{});
      }
      // If not already queued through another path, queue now
      if (existing.status === 'queued' || existing.status === 'processing') {
        fullAuditQueue.addBgJob({ email, url, taskId: existing.taskId });
      }
      return res.json({ message: 'Payment confirmed. Audit job queued (existing record).' });
    }

    // Otherwise, create a fresh record and queue
    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await AnalysisRecord.create({ email, url, taskId, stripeSessionId: session.id, status: 'queued', emailStatus: 'pending' }).catch(() => {});
    fullAuditQueue.addBgJob({ email, url, taskId });
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

// Admin: Rerun an existing analysis on the same record
function adminOnly(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.post('/admin/analysis/:idOrTaskId/rerun', authRequired, adminOnly, async (req, res) => {
  try {
    const { idOrTaskId } = req.params;
    let rec = null;
    // Try by _id first, then by taskId
    try { rec = await AnalysisRecord.findById(idOrTaskId); } catch {}
    if (!rec) rec = await AnalysisRecord.findOne({ taskId: String(idOrTaskId) });
    if (!rec) return res.status(404).json({ error: 'Record not found' });
    if (!rec.email || !rec.url) return res.status(400).json({ error: 'Record missing email or url' });

    // Reset fields for rerun on the same record
    rec.status = 'queued';
    rec.emailStatus = 'pending';
    rec.emailError = undefined;
    rec.failureReason = undefined;
    rec.attachmentCount = 0;
    rec.emailAccepted = undefined;
    rec.emailRejected = undefined;
    await rec.save().catch(()=>{});

    // Enqueue using the same taskId so the processor picks this record up
    fullAuditQueue.addBgJob({ email: rec.email, url: rec.url, userId: rec.user || undefined, taskId: rec.taskId });
    return res.json({ message: 'Re-run queued on existing record', taskId: rec.taskId, id: rec._id });
  } catch (err) {
    console.error('Admin rerun error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to queue re-run' });
  }
});

// Public Contact route: submit message
app.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length < 5) {
      return res.status(400).json({ error: 'Message is required (min 5 chars).' });
    }
    const doc = await ContactMessage.create({
      name: typeof name === 'string' ? name.trim() : '',
      email: typeof email === 'string' ? email.trim() : '',
      subject: typeof subject === 'string' ? subject.trim() : '',
      message: message.trim(),
    });
    res.status(201).json({ success: true, item: doc });
  } catch (err) {
    console.error('Contact submit error:', err?.message || err);
    res.status(500).json({ error: 'Failed to submit message' });
  }
});

// Public content endpoints (no auth): Blogs & FAQs
app.get('/blogs', async (req, res) => {
  try {
    const publishedOnly = req.query.published !== 'false';
    const q = publishedOnly ? { published: true } : {};
    const items = await BlogPost.find(q).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    console.error('Public blogs error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

app.get('/faqs', async (req, res) => {
  try {
    const publishedOnly = req.query.published !== 'false';
    const q = publishedOnly ? { published: true } : {};
    const items = await FAQ.find(q).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    console.error('Public FAQs error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

// Simple listing endpoints for AnalysisRecord visibility
app.get('/records', async (req, res) => {
  try {
    const { email, limit } = req.query;
    const q = {};
    if (email) q.email = String(email);
    const items = await AnalysisRecord.find(q).sort({ createdAt: -1 }).limit(Number(limit) || 50).lean();
    res.json(items);
  } catch (err) {
    console.error('List records error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

app.get('/records/:taskId', async (req, res) => {
  try {
    const item = await AnalysisRecord.findOne({ taskId: req.params.taskId }).lean();
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error('Get record error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Audit server listening on port ${PORT}`);
});

// ------------------------------------------------------------
// Watchdog: prevent records from staying stuck in queued/processing
// Marks records as failed after a timeout window.
// ------------------------------------------------------------
const START_WATCHDOG = true;
if (START_WATCHDOG) {
  const PROCESSING_TIMEOUT_MS = Number(process.env.PROCESSING_TIMEOUT_MS || 2 * 60 * 60 * 1000); // 2 hours default
  const QUEUED_TIMEOUT_MS = Number(process.env.QUEUED_TIMEOUT_MS || 12 * 60 * 60 * 1000); // 12 hours default
  const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS || 10 * 60 * 1000); // run every 10 minutes

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
  }, INTERVAL_MS).unref();
}
