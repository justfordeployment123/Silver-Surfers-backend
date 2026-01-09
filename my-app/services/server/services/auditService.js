/**
 * Audit Service
 * Handles full audit and quick scan processing
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { InternalLinksExtractor } from '../../internal_links/internal_links.js';
import { runLighthouseAudit } from '../../load_and_audit/audit.js';
import { runLighthouseLiteAudit } from '../../load_and_audit/audit-module-with-lite.js';
import { generateSeniorAccessibilityReport } from '../../report_generation/pdf_generator.js';
import { createAllHighlightedImages } from '../../drawing_boxes/draw_all.js';
import { generateLiteAccessibilityReport } from '../../report_generation/pdf-generator-lite.js';
import { 
  sendAuditReportEmail, 
  collectAttachmentsRecursive, 
  sendMailWithFallback 
} from '../email.js';
import { checkScoreThreshold } from '../pass_or_fail.js';
import AnalysisRecord from '../models/AnalysisRecord.js';
import Subscription from '../models/Subscription.js';
import QuickScan from '../models/QuickScan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to generate summary PDF
async function generateSummaryPDF(pageResults, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4'
    });

    const writeStream = fsSync.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1F2937')
      .text('Audit Summary Report', 40, 40, { align: 'center', width: 515 });
    
    doc.fontSize(11).font('Helvetica').fillColor('#6B7280')
      .text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, 40, 70, { align: 'center', width: 515 });
    
    let currentY = 110;
    const margin = 40;
    const pageWidth = 515;
    const headerHeight = 35;
    const rowHeight = 25;
    
    // Table headers
    const headers = ['Audit Page', 'Platform', 'Score', 'Result'];
    const colWidths = [280, 80, 80, 75];
    
    // Draw header background
    doc.rect(margin, currentY, pageWidth, headerHeight).fill('#6366F1');
    
    // Header text
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
    let x = margin;
    headers.forEach((header, index) => {
      doc.text(header, x + 10, currentY + 10, { 
        width: colWidths[index] - 20, 
        align: index === 0 ? 'left' : 'center' 
      });
      x += colWidths[index];
    });
    
    currentY += headerHeight;
    
    // Table rows
    doc.fontSize(10).font('Helvetica').fillColor('#1F2937');
    
    pageResults.forEach((result, index) => {
      // Check if we need a new page
      if (currentY + rowHeight > doc.page.height - 60) {
        doc.addPage();
        currentY = margin;
        
        // Redraw header on new page
        doc.rect(margin, currentY, pageWidth, headerHeight).fill('#6366F1');
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
        x = margin;
        headers.forEach((header, idx) => {
          doc.text(header, x + 10, currentY + 10, { 
            width: colWidths[idx] - 20, 
            align: idx === 0 ? 'left' : 'center' 
          });
          x += colWidths[idx];
        });
        currentY += headerHeight;
      }
      
      // Alternate row background
      if (index % 2 === 0) {
        doc.rect(margin, currentY, pageWidth, rowHeight).fill('#F9FAFB');
      }
      
      const filename = result.filename || 'Unknown';
      const platform = result.platform || 'Unknown';
      const score = result.score !== null && result.score !== undefined ? `${Math.round(result.score)}%` : 'N/A';
      
      // Determine result status and color based on score
      let resultStatus = 'N/A';
      let resultColor = '#6B7280';
      if (result.score !== null && result.score !== undefined) {
        if (result.score >= 70) {
          resultStatus = 'Pass';
          resultColor = '#10B981'; // Green
        } else if (result.score >= 50) {
          resultStatus = 'Warning';
          resultColor = '#F59E0B'; // Orange
        } else {
          resultStatus = 'Fail';
          resultColor = '#EF4444'; // Red
        }
      }
      
      // Draw row content
      x = margin;
      
      // Audit Page (left-aligned, truncate if too long)
      const displayFilename = filename.length > 50 ? filename.substring(0, 47) + '...' : filename;
      doc.fillColor('#1F2937').text(displayFilename, x + 10, currentY + 7, { 
        width: colWidths[0] - 20, 
        align: 'left' 
      });
      x += colWidths[0];
      
      // Platform (center-aligned)
      doc.fillColor('#1F2937').text(platform, x, currentY + 7, { 
        width: colWidths[1], 
        align: 'center' 
      });
      x += colWidths[1];
      
      // Score (center-aligned)
      doc.fillColor('#1F2937').text(score, x, currentY + 7, { 
        width: colWidths[2], 
        align: 'center' 
      });
      x += colWidths[2];
      
      // Result (center-aligned, colored)
      doc.fillColor(resultColor).font('Helvetica-Bold').text(resultStatus, x, currentY + 7, { 
        width: colWidths[3], 
        align: 'center' 
      });
      doc.font('Helvetica'); // Reset to regular font
      
      // Draw bottom border
      doc.strokeColor('#E5E7EB').lineWidth(0.5)
        .moveTo(margin, currentY + rowHeight)
        .lineTo(margin + pageWidth, currentY + rowHeight)
        .stroke();
      
      currentY += rowHeight;
    });
    
    doc.end();
    
    writeStream.on('finish', () => {
      resolve(outputPath);
    });
    
    writeStream.on('error', (error) => {
      reject(error);
    });
  });
}

// Signal backend function
const signalBackend = async (payload) => {
  const backendEndpoint = 'http://localhost:8000/api/audit-status';
  console.log(`\n📡 Signaling backend at ${backendEndpoint} with status: ${payload.status}`);
  console.log('Payload:', payload);
};

// Get PORT from environment
const PORT = process.env.PORT || 8000;

export const runFullAuditProcess = async (job) => {
  const { email, url, userId, taskId, planId, selectedDevice, firstName, lastName, subscriptionId } = job;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Valued Customer';
  console.log(`\n\n--- [STARTING FULL JOB] ---`);

  let effectivePlanId = planId;
  if (!effectivePlanId && subscriptionId) {
    try {
      const sub = await Subscription.findById(subscriptionId).lean();
      if (sub?.planId) effectivePlanId = sub.planId;
    } catch (e) {
      console.warn('Plan lookup failed for subscriptionId', subscriptionId, e?.message || e);
    }
  }
  if (!effectivePlanId) {
    effectivePlanId = 'starter'; // Default to starter behavior if missing
  }

  console.log(`Processing job for ${fullName} (${email}) to audit ${url} [Plan: ${effectivePlanId}]`);

  // CRITICAL FIX: Each audit job gets its own unique folder to prevent race conditions
  // Include taskId to ensure uniqueness even for concurrent audits
  const uniqueTaskId = taskId || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const sanitizedUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50); // Limit URL length
  const sanitizedEmail = email.replace(/[^a-z0-9]/gi, '_');
  // Unique folder per job: reports-full/{sanitizedEmail}/{taskId}-{url}
  // This ensures concurrent audits don't interfere with each other
  const finalReportFolder = path.resolve(process.cwd(), 'reports-full', sanitizedEmail, `${uniqueTaskId}-${sanitizedUrl}`);

  // Temporary working folder for images and intermediates
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
        taskId: uniqueTaskId,
        status: 'queued',
        emailStatus: 'pending',
        reportDirectory: finalReportFolder,
        planId: effectivePlanId
      });
    } else {
      // If record exists but planId is missing, update it
      if (!record.planId) {
        record.planId = effectivePlanId;
      }
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

    // Determine which devices to audit based on plan
    let devicesToAudit;
    if (effectivePlanId === 'pro') {
      devicesToAudit = ['desktop', 'mobile', 'tablet'];
      console.log('🚀 Pro plan: Auditing all devices - desktop, mobile, tablet');
    } else if (effectivePlanId === 'oneTime') {
      if (!selectedDevice) {
        throw new Error('Device selection is required for one-time scans. Please select desktop, mobile, or tablet.');
      }
      const validDevices = ['desktop', 'mobile', 'tablet'];
      if (!validDevices.includes(selectedDevice)) {
        throw new Error(`Invalid device selection: ${selectedDevice}. Must be one of: ${validDevices.join(', ')}`);
      }
      devicesToAudit = [selectedDevice];
      console.log(`📱 One-time scan: Auditing device - ${selectedDevice}`);
    } else {
      devicesToAudit = selectedDevice ? [selectedDevice] : ['desktop'];
      console.log(`📱 Non-pro/onetime plan (${effectivePlanId || 'starter/default'}): Auditing device - ${devicesToAudit[0]}`);
    }

    // Track all page results for summary generation
    const pageResults = [];

    for (const link of linksToAudit) {
      for (const device of devicesToAudit) {
        console.log(`--- Starting full ${device} audit for: ${link} ---`);
        let jsonReportPath = null;
        let imagePaths = {};

        try {
          const auditResult = await runLighthouseAudit({ url: link, device, format: 'json' });
          if (auditResult.success) {
            jsonReportPath = auditResult.reportPath;
            console.log(`📸 Starting image generation for ${link} (${device})...`);
            imagePaths = await createAllHighlightedImages(jsonReportPath, jobFolder);
            console.log(`✅ Image generation completed for ${link} (${device})`);

            // Always use unified report generator, pass planType
            console.log(`📄 Starting PDF generation for ${link} (${device}) with plan: ${effectivePlanId}`);
            console.log(`   Output directory: ${finalReportFolder}`);
            try {
              // CRITICAL FIX: Add small delay before CPU-intensive PDF generation to yield to event loop
              // This prevents blocking other Express requests during PDF generation
              await new Promise(resolve => setImmediate(resolve));
              
              // Add timeout to PDF generation (2 minutes max)
              const pdfPromise = generateSeniorAccessibilityReport({
                inputFile: jsonReportPath,
                url: link,
                email_address: email,
                device: device,
                imagePaths,
                outputDir: finalReportFolder,
                formFactor: device,
                planType: effectivePlanId
              });
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('PDF generation timeout after 2 minutes')), 120000)
              );
              const pdfResult = await Promise.race([pdfPromise, timeoutPromise]);
              console.log(`✅ PDF generated for ${link} (${device}) [Plan: ${effectivePlanId}]`);
              
              // Track page result for summary CSV
              if (pdfResult && pdfResult.reportPath) {
                const filename = path.basename(pdfResult.reportPath);
                const score = pdfResult.score !== undefined ? parseFloat(pdfResult.score) : null;
                pageResults.push({
                  filename,
                  platform: device.charAt(0).toUpperCase() + device.slice(1), // Capitalize first letter
                  score,
                  url: link
                });
              }
              
              // Store the score in the database if available
              if (pdfResult && pdfResult.score !== undefined && record) {
                record.score = parseFloat(pdfResult.score);
                await record.save().catch((err) => console.error('Failed to save score:', err));
                console.log(`📊 Score ${pdfResult.score}% saved to database for ${link} (${device})`);
              }
            } catch (pdfError) {
              console.error(`❌ PDF generation failed for ${link} (${device}):`, pdfError.message);
              console.error(`   Stack:`, pdfError.stack);
              throw pdfError; // Re-throw to trigger catch block
            }
          } else {
            console.error(`Skipping full report for ${link} (${device}). Reason: ${auditResult.error}`);
          }
        } catch (pageError) {
          console.error(`An unexpected error occurred while auditing ${link} (${device}):`, pageError.message);
          console.error(`Stack trace:`, pageError.stack);
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

    console.log(`🎉 All links for ${email} have been processed.`);
    console.log(`\n=== GENERATING SUMMARY PDF ===`);
    
    // Generate summary PDF with all pages and scores (only for full audits, not quick scans)
    if (pageResults.length > 0) {
      try {
        const pdfPath = path.join(finalReportFolder, 'audit-summary.pdf');
        await generateSummaryPDF(pageResults, pdfPath);
        console.log(`✅ Summary PDF generated: ${pdfPath}`);
        console.log(`   Contains ${pageResults.length} page results`);
      } catch (pdfError) {
        console.error(`❌ Failed to generate summary PDF:`, pdfError.message);
        // Don't fail the entire job if PDF generation fails
      }
    }

    console.log(`\n=== EMAIL SENDING PHASE STARTING ===`);

    // Pre-check attachments to ensure we have content to send
    console.log(`📂 Checking for attachments in: ${finalReportFolder}`);
    const attachmentsPreview = await collectAttachmentsRecursive(finalReportFolder).catch(() => []);
    console.log(`📊 Found ${attachmentsPreview.length} attachments`);
    if (record) {
      record.attachmentCount = Array.isArray(attachmentsPreview) ? attachmentsPreview.length : 0;
      await record.save().catch(()=>{});
    }

    // Check if files were generated (but don't fail yet - files will be uploaded to Google Drive)
    if (!attachmentsPreview || attachmentsPreview.length === 0) {
      console.warn(`⚠️ No local attachments found for ${email}. Will attempt to send email with any available files.`);
    }
    // Send a single email with all files in the report folder
    if (record) { record.emailStatus = 'sending'; await record.save().catch(()=>{}); }
    
    // For Starter plan, filter to only send reports for the selected device
    const deviceFilterForEmail = effectivePlanId === 'pro' ? null : (selectedDevice || 'desktop');
    console.log(`📧 Preparing to send email to ${email} with device filter: ${deviceFilterForEmail || 'none (all devices)'}`);
    console.log(`📂 Report folder: ${finalReportFolder}`);
    
    let sendResult;
    try {
      // Set plan-specific email body
      let emailBody = 'Attached are all your senior accessibility audit results. Thank you for using SilverSurfers!';
      if (effectivePlanId === 'starter') {
        emailBody = 'Attached are all of the older adult accessibility audit results for your Starter Subscription. Thank you for using SilverSurfers!';
      } else if (effectivePlanId === 'pro') {
        emailBody = 'Attached are all of the older adult accessibility audit results for your Pro Subscription. Thank you for using SilverSurfers!';
      } else if (effectivePlanId === 'oneTime') {
        emailBody = 'Attached are all of the older adult accessibility audit results for your One-Time Report. Thank you for using SilverSurfers!';
      }

      // Add timeout to email sending (5 minutes max)
      const emailPromise = sendAuditReportEmail({
        to: email,
        subject: 'Your SilverSurfers Audit Results',
        text: emailBody,
        folderPath: finalReportFolder,
        deviceFilter: deviceFilterForEmail,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email sending timed out after 5 minutes')), 300000)
      );

      sendResult = await Promise.race([emailPromise, timeoutPromise]);
      console.log(`✉️ Email send result:`, JSON.stringify(sendResult, null, 2));
      
      // CRITICAL FIX: Wait before cleanup to ensure all file uploads are complete
      // This prevents race conditions where files are deleted while being uploaded
      console.log(`⏳ Waiting 10 seconds before cleanup to ensure all Google Drive uploads complete...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (emailError) {
      console.error(`❌ Email sending failed:`, emailError.message);
      sendResult = { success: false, error: emailError.message };
    }
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
    const uniqueDir = path.resolve(__dirname, '../../report_generation/Seal_Reasoning_email_baseurl', dirName);
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
      // Use the planId from the record (plan at time of scan creation)
      const planIdForSeal = record?.planId;
      if (planIdForSeal === 'pro' && result.pass) {
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
                      <p style="margin:0 0 16px 0;line-height:1.6;">As a Pro subscriber, you've earned the SilverSurfers Seal. You can display this seal on your website.</p>
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
    // Always cleanup temp working folder
    await fs.rm(jobFolder, { recursive: true, force: true }).catch(() => {});
    console.log(`[FullAudit] Finished job for ${email}.`);
  }
};

export const runQuickScanProcess = async (job) => {
    const { email, url, userId, firstName, lastName, quickScanId } = job;
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Valued Customer';
    console.log(`\n--- [STARTING QUICK SCAN] ---`);
    console.log(`Processing quick scan for ${fullName} (${email}) on ${url}`);
    
    // Update QuickScan record to processing status
    if (quickScanId) {
        try {
            await QuickScan.findByIdAndUpdate(quickScanId, { status: 'processing' });
            console.log(`📊 Quick scan marked as processing: ${quickScanId}`);
        } catch (err) {
            console.error('Failed to mark quick scan as processing:', err);
        }
    }
    
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

        // CRITICAL FIX: Each quick scan gets its own unique folder to prevent race conditions
        const uniqueQuickScanId = job.quickScanId?.toString() || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const sanitizedEmail = email.replace(/[^a-z0-9]/gi, '_');
        const sanitizedUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const baseReportsDir = 'reports-lite';
        const userSpecificOutputDir = path.join(baseReportsDir, sanitizedEmail, `${uniqueQuickScanId}-${sanitizedUrl}`);

        const pdfResult = await generateLiteAccessibilityReport(jsonReportPath, userSpecificOutputDir);

        console.log(`✅ Quick scan PDF generated for ${email} at ${pdfResult.reportPath}`);
        console.log(`📊 Quick scan score: ${pdfResult.score}%`);

        // Update QuickScan record with the score
        if (job.quickScanId) {
            try {
                await QuickScan.findByIdAndUpdate(job.quickScanId, {
                    scanScore: parseFloat(pdfResult.score),
                    status: 'completed',
                    reportGenerated: true,
                    reportPath: pdfResult.reportPath
                });
                console.log(`✅ Quick scan score saved to database: ${pdfResult.score}%`);
            } catch (updateErr) {
                console.error('Failed to update quick scan record with score:', updateErr);
            }
        }

        // Send the quick scan report via email (attachments from the output folder)
        console.log(`📧 Preparing to send quick scan email to ${email}`);
        console.log(`📂 Quick scan folder: ${userSpecificOutputDir}`);
        
        try {
          const emailPromise = sendAuditReportEmail({
            to: email,
            subject: 'Your SilverSurfers Quick Scan Results',
            text: 'Attached is your older adult-friendly Quick Scan report. Thanks for trying SilverSurfers! For a full multi-page audit analysis and detailed guidance, consider upgrading.',
            folderPath: userSpecificOutputDir,
            isQuickScan: true, // Flag to add "Website Results for:" prefix
            websiteUrl: url, // Pass the URL for display
            quickScanScore: pdfResult.score, // Pass the score for display
          });
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Quick scan email timed out after 5 minutes')), 300000)
          );
          
          const emailResult = await Promise.race([emailPromise, timeoutPromise]);
          console.log(`✉️ Quick scan email result:`, JSON.stringify(emailResult, null, 2));
          
          // CRITICAL FIX: Wait before cleanup to ensure all file uploads are complete
          console.log(`⏳ Waiting 10 seconds before cleanup to ensure all Google Drive uploads complete...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (emailError) {
          console.error(`❌ Quick scan email failed:`, emailError.message);
          throw emailError; // Re-throw to trigger failure handling
        }

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
        
        // Update QuickScan record with failed status
        if (job.quickScanId) {
            try {
                await QuickScan.findByIdAndUpdate(job.quickScanId, {
                    status: 'failed',
                    errorMessage: error.message
                });
                console.log(`❌ Quick scan status updated to failed`);
            } catch (updateErr) {
                console.error('Failed to update quick scan record status:', updateErr);
            }
        }
        
        // Quick scan is FREE - no usage tracking needed even on failure
        console.log(`🆓 FREE Quick scan failed for ${email} - no usage tracking`);
        
        throw error;
    } finally {
        if (jsonReportPath) {
            await fs.unlink(jsonReportPath).catch(e => console.error(`Failed to delete temp file ${jsonReportPath}:`, e.message));
        }
    }
};


