import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import crypto from 'crypto';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import { connectDB } from './db.js';
import { authRequired } from './auth.js';
import { checkScoreThreshold } from './pass_or_fail.js';
import { fileURLToPath } from 'url';

// Load env from project root (three levels up)
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Your Project Modules (CORRECTED IMPORT) ---
import { InternalLinksExtractor } from '../internal_links/internal_links.js';
import { runLighthouseAudit } from '../load_and_audit/audit.js'; // Changed to your modified audit module
import { runLighthouseLiteAudit } from '../load_and_audit/audit-module-with-lite.js'; // Keep lite for quick scans
import { generateSeniorAccessibilityReport } from '../report_generation/pdf_generator.js';
import { createAllHighlightedImages } from '../drawing_boxes/draw_all.js';
import { generateLiteAccessibilityReport } from '../report_generation/pdf-generator-lite.js';
import { sendAuditReportEmail, collectAttachmentsRecursive, sendTeamInvitationEmail, sendTeamMemberRemovedEmail, sendTeamMemberLeftNotification, sendTeamMemberLeftConfirmation, sendNewTeamMemberNotification, sendMailWithFallback } from './email.js';
import { SUBSCRIPTION_PLANS, getPlanById, getPlanByPriceId } from './subscriptionPlans.js';
import AnalysisRecord from './models/AnalysisRecord.js';
import BlogPost from './models/BlogPost.js';
import FAQ from './models/FAQ.js';
import ContactMessage from './models/ContactMessage.js';
import Subscription from './models/Subscription.js';
import User from './models/User.js';
import AuditJob from './models/AuditJob.js';
import LegalDocument from './models/LegalDocument.js';
import LegalAcceptance from './models/LegalAcceptance.js';
import { PersistentQueue } from './queue/PersistentQueue.js';

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

export const runFullAuditProcess = async (job) => {
  const { email, url, userId, taskId } = job;
  console.log(`\n\n--- [STARTING FULL JOB] ---`);
  console.log(`Processing job for ${email} to audit ${url}`);

  // Acquire browser lock for full audits
  if (isBrowserInUse) {
    throw new Error('Browser is already in use by another full audit');
  }
  isBrowserInUse = true;

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
              url: link,
              email_address: email,
              device: device,
              imagePaths,
              outputDir: finalReportFolder,
              formFactor: device
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

    // Check if files were generated (but don't fail yet - files will be uploaded to Google Drive)
    if (!attachmentsPreview || attachmentsPreview.length === 0) {
      console.warn(`⚠️ No local attachments found for ${email}. Will attempt to send email with any available files.`);
      // Don't fail here - let the email function handle it and check for uploaded files
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



    // Normalize final status: mark failed if email failed or no files were processed; otherwise completed
    if (record) {
      if (record.emailStatus === 'failed') {
        record.status = 'failed';
        record.failureReason = record.failureReason || `Email send failed: ${record.emailError || 'Unknown error'}`;
      } else if (!record.attachmentCount || record.attachmentCount === 0) {
        // Check if files were actually uploaded to Google Drive via sendResult
        const actualUploadedCount = sendResult?.uploadedCount || 0;
        if (actualUploadedCount === 0) {
        record.status = 'failed';
          record.failureReason = record.failureReason || 'No reports generated (0 files uploaded).';
      } else {
          // Files were uploaded successfully, update the count and mark as completed
          record.attachmentCount = actualUploadedCount;
        record.status = 'completed';
      }
      } else {
        record.status = 'completed';
      }
      
      // If audit failed, decrement usage counter since we already incremented it when request was made
      if (record.status === 'failed' && record.user) {
        try {
          await Subscription.findOneAndUpdate(
            { user: record.user, status: { $in: ['active', 'trialing'] } },
            { 
              $inc: { 
                'usage.scansThisMonth': -1
              }
            }
          );
        } catch (usageError) {
          console.error('Failed to decrement usage counter for failed scan:', usageError);
        }
      }
      
      // If audit completed successfully, increment usage counter
      if (record.status === 'completed' && record.user) {
        try {
          await Subscription.findOneAndUpdate(
            { user: record.user, status: { $in: ['active', 'trialing'] } },
            { 
              $inc: { 
                'usage.totalScans': 1
              }
            }
          );
        } catch (usageError) {
          console.error('Failed to update usage counter:', usageError);
        }
      }
      
      await record.save().catch(()=>{});
    }
      // After all links are processed, check the score threshold and send result to backend
      function sanitize(str) {
        return str.replace(/[^a-zA-Z0-9@.-]/g, '_').replace(/https?:\/\//, '').replace(/\./g, '-');
    }
    // Use the base URL from the original job
    const baseUrl = (() => {
        try {
            const u = new URL(url.startsWith('http') ? url : `https://${url}`);
            return `${u.protocol}//${u.hostname.replace(/^www\./, '')}`;
        } catch (e) {
            return url.replace(/^www\./, '');
        }
    })();
    const dirName = `${sanitize(email)}_${sanitize(baseUrl)}`;
    const uniqueDir = path.resolve(__dirname, '../report_generation/Seal_Reasoning_email_baseurl', dirName);
    const resultsFile = path.join(uniqueDir, 'results.json');

    let urlScores = [];
    try {
        const fileContent = await fs.readFile(resultsFile, 'utf8');
        urlScores = JSON.parse(fileContent);
    } catch (e) {
        console.error('Could not read results.json for score threshold check:', e.message);
    }

    const myThreshold = 70;
    const result = checkScoreThreshold(urlScores, myThreshold, { verbose: true });

    // If Pro plan and passed threshold, email the SilverSurfers Seal of Approval
    try {
      // Determine user's subscription to check plan
      let userForSeal = null;
      if (record && record.user) {
        userForSeal = await User.findById(record.user);
      } else if (email) {
        userForSeal = await User.findOne({ email: email.toLowerCase() });
      }
      if (userForSeal && result.pass) {
        const activeSub = await Subscription.findOne({
          $or: [ { user: userForSeal._id }, { stripeCustomerId: userForSeal.stripeCustomerId } ],
          status: { $in: ['active', 'trialing'] }
        }).sort({ createdAt: -1 });

        const isPro = !!activeSub && (activeSub.planId === 'pro');
        if (isPro) {
          try {
            const sealPath = path.resolve(process.cwd(), 'assets', 'silversurfers-seal.png');
            const sealExists = await fs.access(sealPath).then(() => true).catch(() => false);
            if (sealExists) {
              await sendMailWithFallback({
                to: email,
                subject: 'SilverSurfers Seal of Approval - Congratulations!',
                html: `
                  <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
                    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                      <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#059669 0%,#2563eb 100%);color:#fff;">
                        <h1 style="margin:0;font-size:20px;">SilverSurfers Seal of Approval</h1>
                      </div>
                      <div style="padding:24px;color:#111827;">
                        <p style="margin:0 0 12px 0;line-height:1.6;">Congrats! Your site passed our senior accessibility threshold.</p>
                        <p style="margin:0 0 16px 0;line-height:1.6;">As a Pro subscriber, you’ve earned the SilverSurfers Seal. You can display this seal on your website.</p>
                        <p style="margin:0 0 12px 0;line-height:1.6;">Guidelines: Place on pages that meet the accessibility bar; link to your latest report if you like.</p>
                      </div>
                    </div>
                  </div>`,
                attachments: [
                  { filename: 'silversurfers-seal.png', path: sealPath, contentType: 'image/png' }
                ]
              });
              console.log('🏅 Sent SilverSurfers Seal of Approval to', email);
            } else {
              console.warn('Seal image not found at', sealPath);
            }
          } catch (sealErr) {
            console.error('Failed to send seal of approval:', sealErr?.message || sealErr);
          }
        }
      }
    } catch (sealWrapErr) {
      console.error('Seal email check failed:', sealWrapErr?.message || sealWrapErr);
    }

    await signalBackend({
      status: 'completed',
      clientEmail: email,
      folderPath: finalReportFolder,
      url: url,
      passFail: result.pass 
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
    // Return result for persistent queue
    return {
      emailStatus: record?.emailStatus || 'sent',
      attachmentCount: record?.attachmentCount || 0,
      reportDirectory: finalReportFolder,
      scansUsed: 1
    };
  } catch (jobError) {
    console.error(`A critical error occurred during the full job for ${email}:`, jobError.message);
    if (record) { 
      record.status = 'failed'; 
      record.failureReason = jobError.message; 
      await record.save().catch(()=>{});
      
      // Decrement usage counter since scan failed
      try {
        await Subscription.findOneAndUpdate(
          { user: record.user, status: { $in: ['active', 'trialing'] } },
          { 
            $inc: { 
              'usage.scansThisMonth': -1
            }
          }
        );
      } catch (usageError) {
        console.error('Failed to decrement usage counter for failed scan:', usageError);
      }
    }
    await signalBackend({ status: 'failed', clientEmail: email, error: jobError.message });
    throw jobError; // Re-throw for persistent queue error handling
  } finally {
    // Always cleanup temp working folder and release browser lock
    await fs.rm(jobFolder, { recursive: true, force: true }).catch(() => {});
    isBrowserInUse = false; // Release browser lock
    console.log(`[FullAudit] Finished job for ${email}. Browser lock released.`);
  }
};

export const runQuickScanProcess = async (job) => {
    const { email, url, userId } = job;
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

        // Quick scan is FREE - no usage tracking needed
        console.log(`🆓 FREE Quick scan completed for ${email} - no usage tracking`);

        // Signal backend that quick scan is completed
        await signalBackend({
          status: 'completed',
          mode: 'quick',
          clientEmail: email,
          folderPath: userSpecificOutputDir,
        });

        // Return result for persistent queue
        return {
          emailStatus: 'sent',
          attachmentCount: 1, // Quick scan generates 1 PDF
          reportDirectory: userSpecificOutputDir,
          scansUsed: 1
        };

    } catch (error) {
        console.error(`A critical error occurred during the quick scan for ${email}:`, error.message);
        
        // Quick scan is FREE - no usage tracking needed even on failure
        console.log(`🆓 FREE Quick scan failed for ${email} - no usage tracking`);
        
        throw error;
    } finally {
        if (jsonReportPath) {
            await fs.unlink(jsonReportPath).catch(e => console.error(`Failed to delete temp file ${jsonReportPath}:`, e.message));
        }
    }
};

// =================================================================
// ## Browser Lock Management (Handled by PersistentQueue) ##
// =================================================================
let isBrowserInUse = false; // Global browser lock for full audits only


// =================================================================
// ## 3. The Express Server (Updated to instantiate queues correctly) ##
// =================================================================

const app = express();
// Ensure Stripe webhook receives the raw body for signature verification
app.use('/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cors({ origin: '*' }));
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// Stripe webhook endpoint for subscription events
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook handlers
async function handleSubscriptionCreated(subscription) {
  console.log('Subscription created:', subscription.id);
  // Subscription creation is handled in the success callback
}

async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id);
  
  const localSubscription = await Subscription.findOne({ 
    stripeSubscriptionId: subscription.id 
  });
  
  if (localSubscription) {
    const priceId = subscription?.items?.data?.[0]?.price?.id;
    const plan = priceId ? getPlanByPriceId(priceId) : null;

    const startUnix = Number(subscription?.current_period_start);
    const endUnix = Number(subscription?.current_period_end);
    const periodStart = Number.isFinite(startUnix) ? new Date(startUnix * 1000) : undefined;
    const periodEnd = Number.isFinite(endUnix) ? new Date(endUnix * 1000) : undefined;

    // Check if this is a new billing period (usage should be reset)
    let shouldResetUsage = false;
    if (periodStart && localSubscription.currentPeriodStart) {
      // If the new period start is different from the current one, it's a new billing period
      shouldResetUsage = periodStart.getTime() !== localSubscription.currentPeriodStart.getTime();
    }

    const subUpdate = {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(plan && { planId: plan.id, limits: plan.limits })
    };
    if (periodStart) subUpdate.currentPeriodStart = periodStart;
    if (periodEnd) subUpdate.currentPeriodEnd = periodEnd;

    // Reset monthly usage if it's a new billing period
    if (shouldResetUsage) {
      subUpdate['usage.scansThisMonth'] = 0;
      console.log(`🔄 Resetting monthly usage for subscription ${subscription.id} - new billing period started`);
    }

    await Subscription.findByIdAndUpdate(localSubscription._id, subUpdate);

    // Update user subscription status
    const userUpdate = {
      'subscription.status': subscription.status,
      'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end
    };
    if (periodStart) userUpdate['subscription.currentPeriodStart'] = periodStart;
    if (periodEnd) userUpdate['subscription.currentPeriodEnd'] = periodEnd;
    if (shouldResetUsage) userUpdate['subscription.usage.scansThisMonth'] = 0;

    await User.findOneAndUpdate(
      { stripeCustomerId: subscription.customer },
      userUpdate
    );
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription deleted:', subscription.id);
  
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    {
      status: 'canceled',
      canceledAt: new Date()
    }
  );

  // Update user subscription status
  await User.findOneAndUpdate(
    { stripeCustomerId: subscription.customer },
    {
      'subscription.status': 'canceled'
    }
  );
}

async function handlePaymentSucceeded(invoice) {
  console.log('Payment succeeded for invoice:', invoice.id);
  
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionUpdated(subscription);
  }
}

async function handlePaymentFailed(invoice) {
  console.log('Payment failed for invoice:', invoice.id);
  
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionUpdated(subscription);
  }
}
const PORT = process.env.PORT || 5000;

// --- Initialize persistent queues ---
// Create queue instances after functions are defined to avoid circular dependency
let fullAuditQueue, quickScanQueue;

// --- Endpoints (No changes needed here) ---

// Initialize Database and Persistent Queues
await (async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await connectDB(mongoUri);
    console.log('✅ Database connected successfully');
    
    // Create queue instances now that functions are defined
    fullAuditQueue = new PersistentQueue('FullAudit', runFullAuditProcess, {
      concurrency: 1, // Only one full audit at a time due to browser lock
      maxRetries: 3,
      retryDelay: 10000
    });

    quickScanQueue = new PersistentQueue('QuickScan', runQuickScanProcess, {
      concurrency: 3, // Can run multiple quick scans
      maxRetries: 3,
      retryDelay: 5000
    });
    
    // Start persistent queues
    await fullAuditQueue.start();
    await quickScanQueue.start();
    
    // Recover any orphaned jobs from previous server instances
    await fullAuditQueue.recoverJobs();
    await quickScanQueue.recoverJobs();
    
    console.log('✅ Persistent queues started and recovered');
  } catch (err) {
    console.error('❌ Database connection error:', err);
    console.warn('Continuing without DB due to connection error. Some features may be limited.');
  }
})();

// ------------------------------------------------------------
// URL Precheck utilities
// ------------------------------------------------------------

// Generic solution for detecting accessible sites that block automated requests
function isLikelyAccessible(url, response) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    
    // Check if we got redirected (usually a good sign)
    const wasRedirected = response.finalUrl !== url;
    
    // Check response characteristics
    const status = response.status;
    const contentLength = response.headers?.['content-length'] || 0;
    const contentType = response.headers?.['content-type'] || '';
    
    // Heuristics for determining if a site is likely accessible:
    
    // 1. If we got redirected, it's likely accessible
    if (wasRedirected && status < 500) {
      return true;
    }
    
    // 2. If we got a substantial response (not just a blocking page)
    if (contentLength > 500 && contentType.includes('text/html')) {
      return true;
    }
    
    // 3. If it's a well-known domain pattern (major TLDs, common patterns)
    const isWellKnownDomain = (
      domain.includes('.com') || 
      domain.includes('.org') || 
      domain.includes('.net') || 
      domain.includes('.edu') || 
      domain.includes('.gov') ||
      domain.match(/^[a-z0-9-]+\.(com|org|net|edu|gov|io|co|ai|app|dev)$/i)
    );
    
    // 4. If it's a 403 but it's a well-known domain (likely bot blocking)
    if (status === 403 && isWellKnownDomain) {
      return true;
    }
    
    // 5. If it's a 429 (rate limited) but we got some response
    if (status === 429 && contentLength > 0) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

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

async function tryFetch(url, timeoutMs = 15000, userAgentIndex = 0) {
  try {
    const axios = (await import('axios')).default;
    
    // Multiple User-Agent strings to try
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0'
    ];
    
    // Add realistic headers to avoid blocking
    const headers = {
      'User-Agent': userAgents[userAgentIndex] || userAgents[0],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
    
    const resp = await axios.get(url, {
      timeout: timeoutMs,
      maxRedirects: 10, // Increased redirects
      validateStatus: (status) => status < 500, // Accept 4xx but not 5xx
      headers,
      // Better SSL handling
      httpsAgent: new (await import('https')).Agent({
        rejectUnauthorized: false, // Allow self-signed certificates
      }),
    });
    
    const finalUrl = resp.request?.res?.responseUrl || resp.request?.responseURL || url;
    
    // Determine if the URL is accessible using generic heuristics
    let ok = false;
    
    // Standard success codes
    if (resp.status >= 200 && resp.status < 400) {
      ok = true;
    } else {
      // Use generic heuristics to determine if it's likely accessible
      const responseInfo = {
        status: resp.status,
        finalUrl: finalUrl,
        headers: resp.headers
      };
      
      if (isLikelyAccessible(url, responseInfo)) {
        ok = true;
        console.log(`🔓 Treating ${resp.status} as success for ${url} (heuristics indicate accessible)`);
        console.log(`   Debug: redirected=${responseInfo.finalUrl !== url}, contentLength=${resp.headers['content-length']}, contentType=${resp.headers['content-type']}`);
      }
    }
    
    console.log(`🔍 Precheck: ${url} → ${finalUrl} (${resp.status}) ${ok ? '✅' : '❌'}`);
    
    return { ok, status: resp.status, redirected: finalUrl !== url, finalUrl };
  } catch (e) {
    console.log(`❌ Precheck failed: ${url} - ${e?.message || 'request failed'}`);
    return { ok: false, error: e?.message || 'request failed' };
  }
}

// URL precheck endpoint
app.post('/precheck-url', async (req, res) => {
  const { url } = req.body || {};
  console.log(`🔍 Precheck request for: ${url}`);
  
  const { candidateUrls, input } = buildCandidateUrls(url);
  if (!candidateUrls.length) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }
  
  console.log(`🔍 Trying ${candidateUrls.length} URL variants:`, candidateUrls);
  
  let last = null;
  let attempts = 0;
  
  for (const candidate of candidateUrls) {
    attempts++;
    console.log(`🔍 Attempt ${attempts}/${candidateUrls.length}: ${candidate}`);
    
    // Add small delay between attempts to avoid rate limiting
    if (attempts > 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Try with different User-Agent strings if the first attempt fails
    let result = await tryFetch(candidate, 15000, 0);
    
    // If failed and it's a 403/429, try with different User-Agent
    if (!result.ok && (result.status === 403 || result.status === 429)) {
      console.log(`🔄 Retrying ${candidate} with different User-Agent...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Longer delay for retry
      result = await tryFetch(candidate, 15000, 1);
    }
    
    last = result;
    
    if (result.ok) {
      console.log(`✅ Precheck success: ${candidate} → ${result.finalUrl}`);
      return res.json({ 
        success: true, 
        input, 
        normalizedUrl: candidate, 
        finalUrl: result.finalUrl, 
        status: result.status, 
        redirected: !!result.redirected 
      });
    } else {
      console.log(`❌ Precheck failed: ${candidate} - ${result.error || `Status: ${result.status}`}`);
    }
  }
  
  // If all attempts failed, provide detailed error information
  const errorMessage = last?.error || `All ${candidateUrls.length} URL variants failed to respond`;
  console.log(`❌ All precheck attempts failed for ${input}: ${errorMessage}`);
  
  return res.status(400).json({ 
    success: false, 
    input, 
    error: `URL not reachable. Please check the domain and try again. (${errorMessage})`,
    attemptedUrls: candidateUrls,
    lastAttempt: last
  });
});

app.post('/start-audit', authRequired, hasSubscriptionAccess, async (req, res) => {
  const { email, url } = req.body || {};
  if (!email || !url) {
    return res.status(400).json({ error: 'Email and URL are required.' });
  }

  // Check subscription usage limits and increment immediately to prevent race conditions
  const subscription = req.subscription;
  const currentUsage = subscription.usage?.scansThisMonth || 0;
  const monthlyLimit = subscription.limits?.scansPerMonth;
  
  if (monthlyLimit !== -1 && currentUsage >= monthlyLimit) {
    return res.status(403).json({ 
      error: 'Monthly scan limit reached. Please upgrade your plan or wait for the next billing cycle.' 
    });
  }

  // Increment usage counter immediately to prevent race conditions
  try {
    await Subscription.findByIdAndUpdate(subscription._id, {
      $inc: { 'usage.scansThisMonth': 1 }
    });
  } catch (usageError) {
    console.error('Failed to increment usage counter:', usageError);
    return res.status(500).json({ error: 'Failed to process usage limit' });
  }

  // Precheck and normalize URL
  const { candidateUrls } = buildCandidateUrls(url);
  if (!candidateUrls.length) return res.status(400).json({ error: 'Invalid URL' });
  let normalizedUrl = null;
  for (const candidate of candidateUrls) {
    const r = await tryFetch(candidate, 15000);
    if (r.ok) { normalizedUrl = r.finalUrl || candidate; break; }
  }
  if (!normalizedUrl) return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });

  // Create persistent audit job
  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  
  try {
    // Add job to persistent queue
    const job = await fullAuditQueue.addJob({
      email,
      url: normalizedUrl,
      userId: subscription.user,
      taskId,
      jobType: 'full-audit',
      subscriptionId: subscription._id,
      priority: 1 // Normal priority
    });

    // Create AnalysisRecord for backward compatibility
    await AnalysisRecord.create({
      user: subscription.user,
    email,
    url: normalizedUrl,
    taskId,
    status: 'queued',
    emailStatus: 'pending',
    });

    res.status(202).json({ 
      message: 'Full audit request has been queued.',
      taskId: job.taskId,
      jobId: job._id
    });
  } catch (error) {
    console.error('Failed to queue full audit:', error);
    
    // Rollback usage increment on failure
    await Subscription.findByIdAndUpdate(subscription._id, {
      $inc: { 'usage.scansThisMonth': -1 }
    });
    
    res.status(500).json({ error: 'Failed to queue audit request' });
  }
});

app.post('/quick-audit', async (req, res) => {
  const { email, url } = req.body || {};
  if (!email || !url) {
    return res.status(400).json({ error: 'Email and URL are required.' });
  }

  // Quick scan is now FREE - no authentication or subscription limits required
  console.log(`🆓 FREE Quick scan requested for ${email} on ${url}`);

  // Precheck and normalize URL
  const { candidateUrls } = buildCandidateUrls(url);
  if (!candidateUrls.length) return res.status(400).json({ error: 'Invalid URL' });
  let normalizedUrl = null;
  for (const candidate of candidateUrls) {
    const r = await tryFetch(candidate, 15000);
    if (r.ok) { normalizedUrl = r.finalUrl || candidate; break; }
  }
  if (!normalizedUrl) return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });

  // Create persistent audit job
  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  
  try {
    // Add job to persistent queue (FREE - no subscription required)
    const job = await quickScanQueue.addJob({
      email,
      url: normalizedUrl,
      userId: null, // No user required for free scans
      taskId,
      jobType: 'quick-scan',
      subscriptionId: null, // No subscription required
      priority: 2 // Higher priority for quick scans
    });

    // Quick scans are now FREE and don't store results in database
    // Only create AuditJob for queue processing, no AnalysisRecord

    res.status(202).json({ 
      message: '🆓 FREE Quick audit request has been queued. You will receive results via email shortly!',
      taskId: job.taskId,
      jobId: job._id
    });
  } catch (error) {
    console.error('Failed to queue quick audit:', error);
    
    // No rollback needed for free scans
    res.status(500).json({ error: 'Failed to queue audit request' });
  }
});

// Create Stripe Subscription Checkout Session
app.post('/create-checkout-session', authRequired, async (req, res) => {
  try {
    const { planId, billingCycle = 'monthly' } = req.body || {};
    const userId = req.user.id;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    // Handle custom plan (contact sales)
    if (plan.contactSales) {
      return res.status(400).json({ error: 'Please contact sales for custom pricing.' });
    }

    const priceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!priceId) {
      return res.status(400).json({ error: 'Price ID not configured for this plan.' });
    }

    // Get or create Stripe customer
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      // Check if customer already exists in Stripe by email
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1
      });
      
      if (existingCustomers.data.length > 0) {
        // Reuse existing customer
        customerId = existingCustomers.data[0].id;
        console.log(`🔄 Reusing existing Stripe customer: ${customerId} for email: ${user.email}`);
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: userId }
        });
        customerId = customer.id;
        console.log(`🆕 Created new Stripe customer: ${customerId} for email: ${user.email}`);
      }
      
      // Update user with customer ID
      await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
    } else {
      console.log(`♻️ Using existing customer ID: ${customerId} for email: ${user.email}`);
    }

    const successUrlBase = process.env.FRONTEND_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: { 
          userId: userId,
          planId: planId,
          billingCycle: billingCycle
        },
      },
      metadata: { userId: userId, planId: planId, billingCycle: billingCycle },
      success_url: `${successUrlBase}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successUrlBase}/subscription?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe subscription session error:', err);
    return res.status(500).json({ error: 'Failed to create subscription checkout session.' });
  }
});

// Get user's current subscription
app.get('/subscription', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).populate('subscription');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // First check if user owns a subscription
    let subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing', 'past_due'] } 
    }).sort({ createdAt: -1 });

    let isTeamMember = false;

    // If no owned subscription, check if user is a team member
    if (!subscription && user.subscription?.isTeamMember && user.subscription?.teamOwner) {
      subscription = await Subscription.findOne({ 
        user: user.subscription.teamOwner, 
        status: { $in: ['active', 'trialing'] } 
      });

      if (subscription) {
        // Verify user is still an active team member
        const isActiveMember = subscription.teamMembers.some(member => 
          member.user && member.user.toString() === userId && member.status === 'active'
        );

        if (isActiveMember) {
          isTeamMember = true;
        } else {
          // Clean up invalid team membership
          await User.findByIdAndUpdate(userId, {
            'subscription.isTeamMember': false,
            'subscription.teamOwner': null
          });
          subscription = null;
        }
      }
    }

    const plan = subscription?.planId ? getPlanById(subscription.planId) : null;

    return res.json({
      user: {
        id: user._id,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId
      },
      subscription: subscription ? {
        id: subscription._id,
        status: subscription.status,
        planId: subscription.planId,
        plan: plan,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        usage: subscription.usage,
        limits: subscription.limits,
        isTeamMember: isTeamMember // Flag to indicate if user is a team member
      } : null
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    return res.status(500).json({ error: 'Failed to get subscription.' });
  }
});

// Create Stripe Customer Portal session for subscription management
app.post('/create-portal-session', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user and their Stripe customer ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer found. Please create a subscription first.' });
    }

    // Create Stripe Customer Portal session
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription`,
      });

      return res.json({ url: session.url });
    } catch (portalError) {
      console.error('Stripe Customer Portal error:', portalError.message);
      
      // If Customer Portal is not configured, provide helpful error message
      if (portalError.type === 'StripeInvalidRequestError' && 
          portalError.message.includes('No configuration provided')) {
        return res.status(400).json({ 
          error: 'Customer Portal not configured. Please contact support or use the direct upgrade option.',
          details: 'Stripe Customer Portal needs to be configured in the Stripe dashboard.'
        });
      }
      
      throw portalError;
    }
  } catch (err) {
    console.error('Create portal session error:', err);
    return res.status(500).json({ error: 'Failed to create portal session.' });
  }
});

// Direct subscription upgrade endpoint (fallback when Customer Portal is not available)
app.post('/subscription/upgrade', authRequired, async (req, res) => {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    const userId = req.user.id;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    // Get current subscription
    const currentSubscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!currentSubscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const newPriceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!newPriceId) {
      return res.status(400).json({ error: 'Price ID not configured for this plan.' });
    }

    // Retrieve Stripe subscription to get the subscription item id
    const stripeSub = await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId);
    const subscriptionItemId = stripeSub?.items?.data?.[0]?.id;
    if (!subscriptionItemId) {
      return res.status(500).json({ error: 'Could not determine subscription item to update.' });
    }

    // Update subscription in Stripe (use subscription item id, not subscription id)
    const updatedSubscription = await stripe.subscriptions.update(
      currentSubscription.stripeSubscriptionId,
      {
        items: [{
          id: subscriptionItemId,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations',
        metadata: {
          planId: planId,
          billingCycle: billingCycle,
          directUpgrade: 'true'
        }
      }
    );

    // Update local subscription record
    await Subscription.findByIdAndUpdate(currentSubscription._id, {
      planId: planId,
      priceId: newPriceId,
      limits: plan.limits,
      status: updatedSubscription.status
    });

    console.log(`User ${userId} upgraded subscription to plan ${planId}`);

    return res.json({ 
      message: 'Subscription upgraded successfully.',
      subscription: updatedSubscription
    });
  } catch (err) {
    console.error('Direct subscription upgrade error:', err);
    return res.status(500).json({ error: 'Failed to upgrade subscription.' });
  }
});

// Admin-only endpoint to update subscription (for support cases)
app.post('/admin/subscription/update', authRequired, async (req, res) => {
  try {
    // Only allow admin users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { userId, planId, billingCycle = 'monthly' } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'User ID and Plan ID are required.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    // Get current subscription
    const currentSubscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!currentSubscription) {
      return res.status(404).json({ error: 'No active subscription found for user.' });
    }

    const newPriceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!newPriceId) {
      return res.status(400).json({ error: 'Price ID not configured for this plan.' });
    }

    // Retrieve Stripe subscription to get the subscription item id
    const stripeSub = await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId);
    const subscriptionItemId = stripeSub?.items?.data?.[0]?.id;
    if (!subscriptionItemId) {
      return res.status(500).json({ error: 'Could not determine subscription item to update.' });
    }

    // Update subscription in Stripe (use subscription item id, not subscription id)
    const updatedSubscription = await stripe.subscriptions.update(
      currentSubscription.stripeSubscriptionId,
      {
        items: [{
          id: subscriptionItemId,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations',
        metadata: {
          planId: planId,
          billingCycle: billingCycle,
          adminUpdated: 'true'
        }
      }
    );

    // Update local subscription record
    await Subscription.findByIdAndUpdate(currentSubscription._id, {
      planId: planId,
      priceId: newPriceId,
      limits: plan.limits,
      status: updatedSubscription.status
    });

    console.log(`Admin updated subscription for user ${userId} to plan ${planId}`);

    return res.json({ 
      message: 'Subscription updated successfully by admin.',
      subscription: updatedSubscription
    });
  } catch (err) {
    console.error('Admin update subscription error:', err);
    return res.status(500).json({ error: 'Failed to update subscription.' });
  }
});

// Cancel subscription
app.post('/subscription/cancel', authRequired, async (req, res) => {
  try {
    const { cancelAtPeriodEnd = true } = req.body;
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    if (cancelAtPeriodEnd) {
      // Cancel at period end
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
      
      await Subscription.findByIdAndUpdate(subscription._id, {
        cancelAtPeriodEnd: true
      });

      return res.json({ message: 'Subscription will be canceled at the end of the current period.' });
    } else {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      
      await Subscription.findByIdAndUpdate(subscription._id, {
        status: 'canceled',
        canceledAt: new Date()
      });

      return res.json({ message: 'Subscription canceled immediately.' });
    }
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
});

// Get available subscription plans
app.get('/subscription/plans', async (req, res) => {
  try {
    const plans = Object.values(SUBSCRIPTION_PLANS).map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      currency: plan.currency,
      limits: plan.limits,
      icon: plan.icon,
      gradient: plan.gradient,
      popular: plan.popular,
      contactSales: plan.contactSales
    }));

    return res.json({ plans });
  } catch (err) {
    console.error('Get plans error:', err);
    return res.status(500).json({ error: 'Failed to get plans.' });
  }
});

// Confirm subscription payment and activate
app.get('/subscription-success', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    const session = await stripe.checkout.sessions.retrieve(String(session_id));
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed yet.' });
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'Missing metadata.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    // Create or update subscription record
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        user: userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        status: subscription.status,
        planId: planId,
        priceId: subscription.items.data[0].price.id,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        limits: plan.limits,
        usage: {
          scansThisMonth: 0,
          lastResetDate: new Date(),
          totalScans: 0
        }
      },
      { upsert: true, new: true }
    );

    // Update user subscription status
    await User.findByIdAndUpdate(userId, {
      'subscription.status': subscription.status,
      'subscription.planId': planId,
      'subscription.priceId': subscription.items.data[0].price.id,
      'subscription.currentPeriodStart': new Date(subscription.current_period_start * 1000),
      'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000)
    });

    return res.json({ message: 'Subscription activated successfully.' });
  } catch (err) {
    console.error('Subscription success error:', err);
    return res.status(500).json({ error: 'Failed to activate subscription.' });
  }
});

// =================================================================
// TEAM MANAGEMENT ENDPOINTS
// =================================================================

// Add team member
app.post('/subscription/team/add', authRequired, async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Get user's active subscription
    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    // Check if plan supports multiple users
    const plan = getPlanById(subscription.planId);
    if (!plan || plan.limits.maxUsers <= 1) {
      return res.status(400).json({ error: 'Your current plan does not support team members.' });
    }

    // Check current team size
    const currentTeamSize = subscription.teamMembers.length;
    if (currentTeamSize >= plan.limits.maxUsers) {
      return res.status(400).json({ error: `Team limit reached (${plan.limits.maxUsers} members).` });
    }

    // Check if email is already in team
    const existingMember = subscription.teamMembers.find(member => 
      member.email.toLowerCase() === email.toLowerCase()
    );
    if (existingMember) {
      return res.status(400).json({ error: 'This email is already in your team.' });
    }

    // Check if email is the owner
    const owner = await User.findById(userId);
    if (owner.email.toLowerCase() === email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot add yourself to your own team.' });
    }

    // Check if the person already has an active subscription or is part of another team
    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (targetUser) {
      // Check if they have their own active subscription
      const existingSubscription = await Subscription.findOne({
        user: targetUser._id,
        status: { $in: ['active', 'trialing'] }
      });
      
      if (existingSubscription) {
        const existingPlan = getPlanById(existingSubscription.planId);
        return res.status(400).json({ 
          error: `This person already has an active ${existingPlan?.name || 'subscription'} plan. They cannot join your team.` 
        });
      }

      // Check if they are already a member of another team
      const existingTeamMembership = await Subscription.findOne({
        'teamMembers.email': email.toLowerCase(),
        'teamMembers.status': { $in: ['pending', 'active'] },
        user: { $ne: userId } // Not the current team owner
      });

      if (existingTeamMembership) {
        const existingTeamOwner = await User.findById(existingTeamMembership.user);
        const existingTeamPlan = getPlanById(existingTeamMembership.planId);
        return res.status(400).json({ 
          error: `This person is already a member of ${existingTeamOwner?.email || 'another team'}'s ${existingTeamPlan?.name || 'team'}. They cannot join your team.` 
        });
      }
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');

    // Add team member to subscription
    subscription.teamMembers.push({
      email: email.toLowerCase(),
      status: 'pending',
      addedAt: new Date()
    });

    await subscription.save();

    // Add team member to user's team list
    await User.findByIdAndUpdate(userId, {
      $push: {
        'subscription.teamMembers': {
          email: email.toLowerCase(),
          status: 'pending',
          invitedAt: new Date()
        }
      }
    });

    // Send invitation email
    try {
      await sendTeamInvitationEmail(
        email,
        owner.email,
        owner.email, // Using email as name for now
        plan.name,
        invitationToken
      );
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Don't fail the request if email fails
    }

    return res.json({ 
      message: 'Team member invited successfully.',
      invitationToken // Include token for testing (remove in production)
    });

  } catch (err) {
    console.error('Add team member error:', err);
    return res.status(500).json({ error: 'Failed to add team member.' });
  }
});

// Remove team member
// Team member leaves team (self-removal)
app.post('/subscription/team/leave', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Check if user is a team member
    const subscription = await Subscription.findOne({ 
      'teamMembers.email': userEmail.toLowerCase(),
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No team membership found.' });
    }

    // Find and remove the user from team members
    const memberIndex = subscription.teamMembers.findIndex(member => 
      member.email.toLowerCase() === userEmail.toLowerCase()
    );

    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Team membership not found.' });
    }

    const member = subscription.teamMembers[memberIndex];
    subscription.teamMembers.splice(memberIndex, 1);

    // Update user's team membership status
    await User.findByIdAndUpdate(userId, {
      $unset: { 
        isTeamMember: '',
        teamOwner: ''
      }
    });

    await subscription.save();

    // Send notification to subscription owner and confirmation to member who left
    try {
      const owner = await User.findById(subscription.user);
      const plan = getPlanById(subscription.planId);
      const planName = plan?.name || 'Unknown Plan';
      
      if (owner && owner.email) {
        // Send notification to owner that member left
        await sendTeamMemberLeftNotification(
          owner.email, 
          userEmail, 
          member.name || userEmail, 
          planName
        );
      }
      
      // Send confirmation to member who left
      await sendTeamMemberLeftConfirmation(
        userEmail,
        owner?.email || 'Unknown',
        owner?.email || 'Unknown',
        planName
      );
    } catch (emailError) {
      console.error('Failed to send team member leave notifications:', emailError);
    }

    res.json({ message: 'Successfully left the team.' });
  } catch (error) {
    console.error('Team leave error:', error);
    res.status(500).json({ error: 'Failed to leave team.' });
  }
});

app.post('/subscription/team/remove', authRequired, async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Get user's active subscription
    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    // Find team member
    const memberIndex = subscription.teamMembers.findIndex(member => 
      member.email.toLowerCase() === email.toLowerCase()
    );

    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    const member = subscription.teamMembers[memberIndex];

    // Remove from subscription
    subscription.teamMembers.splice(memberIndex, 1);
    await subscription.save();

    // Remove from user's team list
    await User.findByIdAndUpdate(userId, {
      $pull: {
        'subscription.teamMembers': { email: email.toLowerCase() }
      }
    });

    // If member was active, update their user record
    if (member.status === 'active') {
      const memberUser = await User.findOne({ email: email.toLowerCase() });
      if (memberUser) {
        await User.findByIdAndUpdate(memberUser._id, {
          'subscription.isTeamMember': false,
          'subscription.teamOwner': null
        });
      }

      // Send removal notification email
      try {
        const owner = await User.findById(userId);
        const plan = getPlanById(subscription.planId);
        await sendTeamMemberRemovedEmail(
          email,
          owner.email,
          owner.email,
          plan.name
        );
      } catch (emailError) {
        console.error('Failed to send removal email:', emailError);
      }
    }

    return res.json({ message: 'Team member removed successfully.' });

  } catch (err) {
    console.error('Remove team member error:', err);
    return res.status(500).json({ error: 'Failed to remove team member.' });
  }
});

// List team members
app.get('/subscription/team', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's active subscription
    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const plan = getPlanById(subscription.planId);
    const availableSlots = plan ? plan.limits.maxUsers - subscription.teamMembers.length : 0;

    return res.json({
      teamMembers: subscription.teamMembers,
      planName: plan?.name || subscription.planId,
      maxUsers: plan?.limits.maxUsers || 1,
      availableSlots: Math.max(0, availableSlots)
    });

  } catch (err) {
    console.error('Get team members error:', err);
    return res.status(500).json({ error: 'Failed to get team members.' });
  }
});

// Get team scan history
app.get('/subscription/team/scans', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's active subscription
    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    // Get all team member emails (including owner)
    const teamEmails = [
      req.user.email, // Owner's email
      ...subscription.teamMembers.map(member => member.email)
    ];

    // Fetch all scans performed by team members
    const teamScans = await AnalysisRecord.find({
      email: { $in: teamEmails },
      createdAt: { $gte: subscription.currentPeriodStart }
    })
    .sort({ createdAt: -1 })
    .limit(50) // Limit to last 50 scans
    .populate('user', 'email')
    .lean();

    // Format the response
    const formattedScans = teamScans.map(scan => ({
      id: scan._id,
      url: scan.url,
      email: scan.email,
      status: scan.status,
      emailStatus: scan.emailStatus,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt,
      failureReason: scan.failureReason,
      attachmentCount: scan.attachmentCount,
      isOwner: scan.email === req.user.email
    }));

    res.json({ scans: formattedScans });
  } catch (error) {
    console.error('Get team scans error:', error);
    res.status(500).json({ error: 'Failed to get team scans.' });
  }
});

// Accept team invitation
app.post('/subscription/team/accept', authRequired, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({ error: 'Invitation token is required.' });
    }

    // For now, we'll use a simple approach - in production you'd want to store tokens in DB
    // and validate expiration. For this implementation, we'll find pending invitations
    // by checking if user email exists in any team's pending members

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if user already has their own active subscription
    const existingSubscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] }
    });
    
    if (existingSubscription) {
      const existingPlan = getPlanById(existingSubscription.planId);
      return res.status(400).json({ 
        error: `You already have an active ${existingPlan?.name || 'subscription'} plan. You cannot join a team while having your own subscription.` 
      });
    }

    // Check if user is already a member of another team
    const existingTeamMembership = await Subscription.findOne({
      'teamMembers.email': user.email.toLowerCase(),
      'teamMembers.status': 'active',
      user: { $ne: userId } // Not their own subscription
    });

    if (existingTeamMembership) {
      const existingTeamOwner = await User.findById(existingTeamMembership.user);
      const existingTeamPlan = getPlanById(existingTeamMembership.planId);
      return res.status(400).json({ 
        error: `You are already an active member of ${existingTeamOwner?.email || 'another team'}'s ${existingTeamPlan?.name || 'team'}. You cannot join multiple teams.` 
      });
    }

    // Find subscription with this user as pending team member
    const subscription = await Subscription.findOne({
      'teamMembers.email': user.email.toLowerCase(),
      'teamMembers.status': 'pending'
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No pending invitation found.' });
    }

    // Update team member status to active
    const memberIndex = subscription.teamMembers.findIndex(member => 
      member.email.toLowerCase() === user.email.toLowerCase()
    );

    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    subscription.teamMembers[memberIndex].status = 'active';
    subscription.teamMembers[memberIndex].user = userId;
    await subscription.save();

    // Update user's team status
    await User.findByIdAndUpdate(userId, {
      'subscription.isTeamMember': true,
      'subscription.teamOwner': subscription.user
    });

    // Update owner's team list
    await User.findByIdAndUpdate(subscription.user, {
      $set: {
        'subscription.teamMembers.$[elem].status': 'active',
        'subscription.teamMembers.$[elem].joinedAt': new Date()
      }
    }, {
      arrayFilters: [{ 'elem.email': user.email.toLowerCase() }]
    });

    // Send notification to owner
    try {
      const owner = await User.findById(subscription.user);
      const plan = getPlanById(subscription.planId);
      await sendNewTeamMemberNotification(
        owner.email,
        user.email,
        user.email,
        plan.name
      );
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    return res.json({ 
      message: 'Team invitation accepted successfully.',
      teamOwner: subscription.user,
      planId: subscription.planId
    });

  } catch (err) {
    console.error('Accept team invitation error:', err);
    return res.status(500).json({ error: 'Failed to accept team invitation.' });
  }
});

// =================================================================
// END TEAM MANAGEMENT ENDPOINTS
// =================================================================

// Middleware to check subscription access (owner or team member)
async function hasSubscriptionAccess(req, res, next) {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if user is subscription owner
    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (subscription) {
      // User is the subscription owner
      req.subscription = subscription;
      return next();
    }

    // Check if user is a team member
    if (user.subscription.isTeamMember && user.subscription.teamOwner) {
      const ownerSubscription = await Subscription.findOne({ 
        user: user.subscription.teamOwner, 
        status: { $in: ['active', 'trialing'] } 
      });

      if (ownerSubscription) {
        // Verify user is still an active team member
        const isActiveMember = ownerSubscription.teamMembers.some(member => 
          member.user && member.user.toString() === userId && member.status === 'active'
        );

        if (isActiveMember) {
          req.subscription = ownerSubscription;
          req.isTeamMember = true;
          return next();
        }
      }

      // Clean up invalid team membership
      await User.findByIdAndUpdate(userId, {
        'subscription.isTeamMember': false,
        'subscription.teamOwner': null
      });
    }

    return res.status(403).json({ error: 'No active subscription access found.' });

  } catch (err) {
    console.error('Subscription access check error:', err);
    return res.status(500).json({ error: 'Failed to verify subscription access.' });
  }
}

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

    // Send email notification to info@mg.silversurfers.ai
    try {
      const { sendBasicEmail } = await import('./email.js');
      
      const emailSubject = `New Contact Form Message${subject ? `: ${subject}` : ''}`;
      const emailText = `
New contact form submission received:

Name: ${doc.name || 'Not provided'}
Email: ${doc.email || 'Not provided'}
Subject: ${doc.subject || 'Not provided'}

Message:
${doc.message}

---
Submitted at: ${new Date().toISOString()}
Message ID: ${doc._id}
      `.trim();

      const emailResult = await sendBasicEmail({
        to: 'info@mg.silversurfers.ai',
        subject: emailSubject,
        text: emailText
      });

      if (emailResult.success) {
        console.log('✅ Contact form email notification sent to info@mg.silversurfers.ai');
      } else {
        console.warn('⚠️ Failed to send contact form email notification:', emailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Error sending contact form email notification:', emailError);
      // Don't fail the contact form submission if email fails
    }

    res.status(201).json({ success: true, item: doc });
  } catch (err) {
    console.error('Contact submit error:', err?.message || err);
    res.status(500).json({ error: 'Failed to submit message' });
  }
});

// Admin endpoint to get contact messages
app.get('/admin/contact', authRequired, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const messages = await ContactMessage.find({}).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      messages: messages
    });
  } catch (err) {
    console.error('Get contact messages error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch contact messages' });
  }
});

// Admin endpoint to get all users
app.get('/admin/users', authRequired, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { search, role, subscriptionStatus } = req.query;
    
    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role && role !== 'all') {
      query.role = role;
    }
    
    let users = await User.find(query).sort({ createdAt: -1 });
    
    // Filter by subscription status if needed
    if (subscriptionStatus && subscriptionStatus !== 'all') {
      users = users.filter(user => {
        const sub = user.subscription;
        if (!sub) return subscriptionStatus === 'none';
        
        if (subscriptionStatus === 'active') {
          return sub.status === 'active' || sub.status === 'trialing';
        }
        
        if (subscriptionStatus === 'inactive') {
          return sub.status === 'canceled' || sub.status === 'past_due';
        }
        
        if (subscriptionStatus === 'team_member') {
          return sub.isTeamMember === true;
        }
        
        return true;
      });
    }
    
    // Populate subscription details
    const usersWithSubscriptions = users.map(user => {
      const userObj = user.toObject();
      if (user.subscription) {
        userObj.subscription = {
          ...user.subscription,
          planName: user.subscription.planId,
          billingCycle: user.subscription.billingCycle,
          status: user.subscription.status,
          scansPerMonth: user.subscription.scansPerMonth,
          usage: user.subscription.usage?.scansThisMonth || 0,
          limit: user.subscription.scansPerMonth || 0,
          periodEnd: user.subscription.periodEnd,
          isTeamMember: user.subscription.isTeamMember || false
        };
      }
      return userObj;
    });
    
    res.json({
      success: true,
      users: usersWithSubscriptions
    });
  } catch (err) {
    console.error('Get users error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin endpoint to get specific user details
app.get('/admin/users/:id', authRequired, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userObj = user.toObject();
    if (user.subscription) {
      userObj.subscription = {
        ...user.subscription,
        planName: user.subscription.planId,
        billingCycle: user.subscription.billingCycle,
        status: user.subscription.status,
        scansPerMonth: user.subscription.scansPerMonth,
        usage: user.subscription.usage?.scansThisMonth || 0,
        limit: user.subscription.scansPerMonth || 0,
        periodEnd: user.subscription.periodEnd,
        isTeamMember: user.subscription.isTeamMember || false
      };
    }
    
    res.json({
      success: true,
      user: userObj
    });
  } catch (err) {
    console.error('Get user error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Admin endpoint to reset user's monthly usage (emergency/admin use)
app.post('/admin/users/:id/reset-usage', authRequired, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const userId = req.params.id;
    
    // Reset usage in Subscription collection
    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });
    
    if (subscription) {
      await Subscription.findByIdAndUpdate(subscription._id, {
        $set: { 'usage.scansThisMonth': 0 }
      });
    }

    // Reset usage in User collection
    await User.findByIdAndUpdate(userId, {
      $set: { 'subscription.usage.scansThisMonth': 0 }
    });

    console.log(`Admin reset monthly usage for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Monthly usage reset successfully'
    });
  } catch (err) {
    console.error('Reset usage error:', err?.message || err);
    res.status(500).json({ error: 'Failed to reset usage' });
  }
});

// Debug endpoint to check legal documents
app.get('/debug/legal', async (req, res) => {
  try {
    const allDocs = await LegalDocument.find({});
    const termsDoc = await LegalDocument.getCurrent('terms-of-use', 'en', 'US');
    
    res.json({
      totalDocuments: allDocs.length,
      allDocuments: allDocs.map(doc => ({
        id: doc._id,
        type: doc.type,
        title: doc.title,
        status: doc.status,
        language: doc.language,
        region: doc.region
      })),
      termsDocument: termsDoc ? {
        id: termsDoc._id,
        type: termsDoc.type,
        title: termsDoc.title,
        status: termsDoc.status
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legal Document endpoints
app.get('/legal/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { language = 'en', region = 'US' } = req.query;
    
    console.log(`🔍 Looking for document: type=${type}, language=${language}, region=${region}`);
    
    const document = await LegalDocument.getCurrent(type, language, region);
    console.log(`📄 Document found:`, document ? 'Yes' : 'No');
    
    if (!document) {
      // Let's see what documents we have
      const allDocs = await LegalDocument.find({});
      console.log(`📊 Total documents in database: ${allDocs.length}`);
      allDocs.forEach(doc => {
        console.log(`- ${doc.type} (${doc.status}) - lang:${doc.language} region:${doc.region}`);
      });
      
      return res.status(404).json({ error: 'Legal document not found' });
    }

    res.json({
      id: document._id,
      type: document.type,
      title: document.title,
      content: document.content,
      version: document.version,
      effectiveDate: document.effectiveDate,
      summary: document.summary,
      acceptanceRequired: document.acceptanceRequired,
      acceptanceDeadline: document.acceptanceDeadline
    });
  } catch (err) {
    console.error('Legal document fetch error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch legal document' });
  }
});

app.get('/legal', async (req, res) => {
  try {
    const { language = 'en', region = 'US' } = req.query;
    
    const documents = await Promise.all([
      LegalDocument.getCurrent('terms-of-use', language, region),
      LegalDocument.getCurrent('privacy-policy', language, region)
    ]);
    
    const result = {};
    documents.forEach(doc => {
      if (doc) {
        result[doc.type] = {
          id: doc._id,
          title: doc.title,
          version: doc.version,
          effectiveDate: doc.effectiveDate,
          summary: doc.summary,
          acceptanceRequired: doc.acceptanceRequired
        };
      }
    });
    
    res.json(result);
  } catch (err) {
    console.error('Legal documents fetch error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch legal documents' });
  }
});

// Accept legal document
app.post('/legal/:type/accept', authRequired, async (req, res) => {
  try {
    const { type } = req.params;
    const userId = req.user.id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    // Get current document
    const document = await LegalDocument.getCurrent(type);
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    
    // Check if already accepted
    const existingAcceptance = await LegalAcceptance.hasAccepted(userId, document._id);
    if (existingAcceptance) {
      return res.json({ 
        message: 'Already accepted',
        acceptedAt: existingAcceptance.acceptedAt,
        version: existingAcceptance.acceptedVersion
      });
    }
    
    // Create acceptance record
    const acceptance = new LegalAcceptance({
      user: userId,
      document: document._id,
      acceptedVersion: document.version,
      ipAddress,
      userAgent,
      acceptanceMethod: 'manual'
    });
    
    await acceptance.save();
    
    res.json({
      message: 'Legal document accepted successfully',
      acceptedAt: acceptance.acceptedAt,
      version: acceptance.acceptedVersion,
      documentType: document.type
    });
  } catch (err) {
    console.error('Legal acceptance error:', err?.message || err);
    res.status(500).json({ error: 'Failed to accept legal document' });
  }
});

// Get user's legal acceptances
app.get('/legal/acceptances', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const acceptances = await LegalAcceptance.getUserAcceptances(userId);
    
    res.json({ acceptances });
  } catch (err) {
    console.error('User acceptances fetch error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch user acceptances' });
  }
});

// Get all legal documents for admin
app.get('/admin/legal', authRequired, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const documents = await LegalDocument.find({}).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      documents: documents
    });
  } catch (err) {
    console.error('Get all legal documents error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch legal documents' });
  }
});

// Admin endpoints for legal document management
app.post('/admin/legal', authRequired, async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const {
      type,
      title,
      content,
      summary,
      version,
      language = 'en',
      region = 'US',
      acceptanceRequired = true,
      acceptanceDeadline,
      metaTitle,
      metaDescription
    } = req.body;
    
    const document = new LegalDocument({
      type,
      title,
      content,
      summary,
      version,
      language,
      region,
      acceptanceRequired,
      acceptanceDeadline: acceptanceDeadline ? new Date(acceptanceDeadline) : undefined,
      metaTitle,
      metaDescription,
      createdBy: req.user.id,
      lastModifiedBy: req.user.id,
      status: 'draft'
    });
    
    await document.save();
    
    res.status(201).json({
      message: 'Legal document created successfully',
      document: {
        id: document._id,
        type: document.type,
        title: document.title,
        version: document.version,
        status: document.status
      }
    });
  } catch (err) {
    console.error('Legal document creation error:', err?.message || err);
    res.status(500).json({ error: 'Failed to create legal document' });
  }
});

app.put('/admin/legal/:id', authRequired, async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { id } = req.params;
    const updateData = { ...req.body };
    updateData.lastModifiedBy = req.user.id;
    updateData.lastModified = new Date();
    
    const document = await LegalDocument.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    
    res.json({
      message: 'Legal document updated successfully',
      document: {
        id: document._id,
        type: document.type,
        title: document.title,
        version: document.version,
        status: document.status,
        lastModified: document.lastModified
      }
    });
  } catch (err) {
    console.error('Legal document update error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update legal document' });
  }
});

app.post('/admin/legal/:id/publish', authRequired, async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { id } = req.params;
    const document = await LegalDocument.findById(id);
    
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    
    await document.publish(req.user.id);
    
    res.json({
      message: 'Legal document published successfully',
      document: {
        id: document._id,
        type: document.type,
        title: document.title,
        version: document.version,
        status: document.status,
        effectiveDate: document.effectiveDate
      }
    });
  } catch (err) {
    console.error('Legal document publish error:', err?.message || err);
    res.status(500).json({ error: 'Failed to publish legal document' });
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

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  try {
    console.log('🔄 Stopping persistent queues...');
    await fullAuditQueue.stop();
    await quickScanQueue.stop();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}
