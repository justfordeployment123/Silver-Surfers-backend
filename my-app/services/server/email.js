// email.js
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import crypto from 'crypto';
// Load .env from current working directory first, then fallback three levels up
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

// Google Drive Configuration for file uploads
let drive = null;
if (process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  });
  
  drive = google.drive({ version: 'v3', auth: oauth2Client });
}

// Constants
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || 'root';

function buildTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = typeof process.env.SMTP_SECURE === 'string'
    ? process.env.SMTP_SECURE === 'true'
    : port === 465; // default secure for 465
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    return { transporter: null, reason: 'SMTP not configured (missing SMTP_HOST)' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT) || 20000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT) || 10000,
    // Optionally allow skipping TLS verification for dev setups
    ...(process.env.SMTP_IGNORE_TLS_ERRORS === 'true' ? { tls: { rejectUnauthorized: false } } : {}),
  });

  return { transporter };
}

// Utility function to get file size
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error(`Error getting file size for ${filePath}:`, error.message);
    return 0;
  }
}

// Upload file to Google Drive and return public URL
async function uploadToDrive(filePath, fileName, folderPath, email) {
  if (!drive) {
    throw new Error('Google Drive not configured. Please set Google Drive credentials.');
  }

  try {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    
    // Create unique filename to prevent conflicts
    // Format: timestamp-randomId-emailHash-originalFilename
    const emailHash = crypto.createHash('md5').update(email || 'anonymous').toString('hex').substring(0, 8);
    const fileExtension = path.extname(fileName);
    const baseFileName = path.basename(fileName, fileExtension);
    const uniqueFileName = `${baseFileName}-${timestamp}-${randomId}-${emailHash}${fileExtension}`;
    
    // Import fs for creating read stream
    const fsSync = await import('fs');
    
    const media = {
      mimeType: 'application/pdf',
      body: fsSync.createReadStream(filePath)  // Use stream instead of buffer
    };

    const fileMetadata = {
      name: uniqueFileName,
      parents: [DRIVE_FOLDER_ID]
    };

    const result = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,webViewLink,webContentLink'
    });

    // Make file downloadable with security options
    const useEmailRestriction = process.env.GOOGLE_DRIVE_RESTRICT_TO_EMAIL === 'true';
    
    if (useEmailRestriction && email) {
      // SECURE: Only specific email can access
      await drive.permissions.create({
        fileId: result.data.id,
        resource: {
          role: 'reader',
          type: 'user',
          emailAddress: email
        },
        sendNotificationEmail: false
      });
      console.log(`🔒 File access restricted to: ${email}`);
    } else {
      // OPEN: Anyone with link can access (current behavior)
      await drive.permissions.create({
        fileId: result.data.id,
        resource: {
          role: 'reader',
          type: 'anyone'
        }
      });
      console.log(`🔓 File accessible to anyone with link`);
    }

    // Generate direct download links
    // Option 1: Direct download (auto-downloads the file)
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${result.data.id}`;
    
    // Option 2: View/Preview link (opens in browser)
    const viewUrl = `https://drive.google.com/file/d/${result.data.id}/view`;
    
    // Option 3: Force download with custom name
    const forceDownloadUrl = `https://drive.google.com/uc?id=${result.data.id}&export=download&confirm=t`;

    return {
      url: downloadUrl,
      viewUrl: viewUrl,
      fileId: result.data.id,
      originalPath: filePath,
      originalFileName: fileName,
      uniqueFileName: uniqueFileName
    };
  } catch (error) {
    console.error('Google Drive upload error:', error);
    throw new Error(`Failed to upload ${fileName} to Google Drive: ${error.message}`);
  }
}

// Enhanced file collection with size checking
export async function collectAttachmentsRecursive(rootDir) {
  const results = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const de of entries) {
      const full = path.join(dir, de.name);
      if (de.isDirectory()) {
        await walk(full);
      } else if (de.isFile()) {
        // Only attach PDFs by default to keep emails smaller
        if (full.toLowerCase().endsWith('.pdf')) {
          const fileSize = await getFileSize(full);
          results.push({ 
            filename: path.relative(rootDir, full), 
            path: full,
            size: fileSize,
            sizeMB: (fileSize / (1024 * 1024)).toFixed(2)
          });
        }
      }
    }
  }
  try {
    await walk(rootDir);
  } catch (e) {
    console.error('Error walking attachments folder:', e.message);
  }
  return results;
}

export async function sendAuditReportEmail({ to, subject, text, folderPath }) {
  const { transporter, reason } = buildTransport();
  if (!transporter) {
    console.warn('Email skipped:', reason);
    return { success: false, error: reason };
  }

  // Collect all files in the report folder with size information
  let files = [];
  let totalSize = 0;
  if (folderPath) {
    files = await collectAttachmentsRecursive(folderPath);
    totalSize = files.reduce((sum, file) => sum + file.size, 0);
  }

  console.log(`📊 Email analysis: ${files.length} files, total size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);

  let emailBody = text;
  let attachments = []; // Keep empty - all files go to S3
  let uploadedFiles = [];
  let s3Errors = [];

  // Upload ALL files to Google Drive (no size limit)
  console.log('☁️ Uploading all files to Google Drive and sending download links');
  
  for (const file of files) {
    try {
      const uploadResult = await uploadToDrive(file.path, file.filename, folderPath, to);
      uploadedFiles.push({
        filename: file.filename,
        size: file.size,
        sizeMB: file.sizeMB,
        downloadUrl: uploadResult.url,
        viewUrl: uploadResult.viewUrl
      });
      console.log(`✅ Uploaded ${file.filename} (${file.sizeMB}MB) to Google Drive`);
    } catch (uploadError) {
      console.error(`❌ Failed to upload ${file.filename}:`, uploadError.message);
      s3Errors.push(`${file.filename}: ${uploadError.message}`);
    }
  }

  // Update email body with download links
  if (uploadedFiles.length > 0) {
    emailBody += '\n\n📁 DOWNLOAD LINKS FOR YOUR FILES:\n';
    emailBody += 'Your audit reports have been uploaded to secure cloud storage:\n\n';
    
    uploadedFiles.forEach(file => {
      // Extract just the filename without folder path
      const displayName = path.basename(file.filename);
      emailBody += `• ${displayName} (${file.sizeMB}MB)\n`;
      emailBody += `  Download: ${file.downloadUrl}\n\n`;
    });
    
    emailBody += '⚠️ Note: Download links expire in 7 days for security.\n';
    emailBody += 'Please download your files promptly and keep them safe.\n\n';
  }

  // Add error information if some uploads failed
  if (s3Errors.length > 0) {
    emailBody += '\n❌ SOME FILES COULD NOT BE UPLOADED:\n';
    s3Errors.forEach(error => {
      emailBody += `• ${error}\n`;
    });
    emailBody += '\nPlease contact support if you need these files.\n';
  }
  

  const mailOptions = {
    from: `SilverSurfers <${process.env.SMTP_USER || 'no-reply@silversurfers.local'}>`,
    to,
    subject,
    text: emailBody,
    ...(attachments.length > 0 ? { attachments } : {}),
  };

  try {
    // Verify transport before sending to fail fast with clearer errors
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    
    return {
      success: true,
      attachmentCount: uploadedFiles.length || 0, // Use uploaded files count instead of attachments
      uploadedCount: uploadedFiles.length || 0,
      totalFiles: files.length || 0,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      uploadedFiles: uploadedFiles.map(f => f.filename) || [],
      s3Errors: s3Errors.length > 0 ? s3Errors : undefined,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendBasicEmail({ to, subject, text }) {
  const { transporter, reason } = buildTransport();
  if (!transporter) {
    console.warn('Email skipped:', reason);
    return { success: false, error: reason };
  }
  const mailOptions = {
    from: `SilverSurfers <${process.env.SMTP_USER || 'no-reply@silversurfers.local'}>`,
    to,
    subject,
    text,
  };
  try {
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    return { success: true };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

// Generic HTML email sender with large file handling
export async function sendMailWithFallback({ from, to, subject, html, text, attachments }) {
  const { transporter, reason } = buildTransport();
  if (!transporter) {
    console.warn('Email skipped:', reason);
    return { success: false, error: reason };
  }

  let processedAttachments = [];
  let uploadedFiles = [];
  let emailBody = text || '';

  // Process attachments if provided - upload ALL to S3
  if (attachments && attachments.length > 0) {
    let totalSize = 0;
    
    // Calculate total size of attachments
    for (const attachment of attachments) {
      if (attachment.path) {
        const fileSize = await getFileSize(attachment.path);
        totalSize += fileSize;
      }
    }

    console.log(`📊 Generic email analysis: ${attachments.length} attachments, total size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);

    // Upload ALL attachments to Google Drive (no size limit)
    console.log('☁️ Uploading all attachments to Google Drive');
    
    for (const attachment of attachments) {
      if (attachment.path) {
        try {
          const uploadResult = await uploadToDrive(attachment.path, attachment.filename || path.basename(attachment.path), '', to);
          uploadedFiles.push({
            filename: attachment.filename || path.basename(attachment.path),
            downloadUrl: uploadResult.url,
            viewUrl: uploadResult.viewUrl
          });
          console.log(`✅ Uploaded ${attachment.filename || path.basename(attachment.path)} to Google Drive`);
        } catch (uploadError) {
          console.error(`❌ Failed to upload ${attachment.filename}:`, uploadError.message);
        }
      } else {
        // If no path, it's probably inline content - attach directly
        processedAttachments.push(attachment);
      }
    }

    // Update email body with download links
    if (uploadedFiles.length > 0) {
      const downloadSection = '\n\n📁 DOWNLOAD LINKS FOR YOUR FILES:\n' +
        'Your files have been uploaded to secure cloud storage:\n\n' +
        uploadedFiles.map(file => {
          const displayName = path.basename(file.filename);
          return `• ${displayName}\n  Download: ${file.downloadUrl}\n`;
        }).join('\n') +
        '\n⚠️ Note: Download links expire in 7 days for security.\n';
      
      emailBody += downloadSection;
      
      // Also update HTML if provided
      if (html) {
        html += '<br><br><h3>📁 Download Links for Your Files</h3>' +
          '<p>Your files have been uploaded to secure cloud storage:</p>' +
          '<ul>' + uploadedFiles.map(file => {
            const displayName = path.basename(file.filename);
            return `<li><strong>${displayName}</strong><br><a href="${file.downloadUrl}">Download File</a></li>`;
          }).join('') + '</ul>' +
          '<p><strong>⚠️ Note:</strong> Download links expire in 7 days for security.</p>';
      }
    }
  }

  const mailOptions = {
    from: from || `SilverSurfers <${process.env.SMTP_USER || 'no-reply@silversurfers.local'}>`,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(emailBody ? { text: emailBody } : {}),
    ...(processedAttachments.length > 0 ? { attachments: processedAttachments } : {}),
  };

  try {
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    return { 
      success: true,
      attachmentCount: uploadedFiles.length || processedAttachments.length, // Use uploaded files count, fallback to attachments
      uploadedCount: uploadedFiles.length
    };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendVerificationEmail(to, token) {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verifyLink = `${frontend}/verify-email?token=${encodeURIComponent(token)}`;
  const brandPrimary = '#2563eb';
  const brandAccent = '#059669';
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%);color:#fff;">
          <h1 style="margin:0;font-size:20px;">Welcome to SilverSurfers</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Verify your email</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">Thanks for signing up. Please verify your email address by clicking the button below:</p>
          <p style="margin:20px 0;">
            <a href="${verifyLink}" style="background:${brandPrimary};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">Verify Email</a>
          </p>
          <p style="margin:16px 0;color:#6b7280;font-size:14px;">Or use this token: <strong>${token}</strong></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">If you didn't create an account, you can ignore this email.</p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
  return sendMailWithFallback({ to, subject: 'Verify your email', html });
}

export async function sendPasswordResetEmail(to, token) {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${frontend}/reset-password?token=${encodeURIComponent(token)}`;
  const brandDanger = '#ef4444';
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:#111827;color:#fff;">
          <h1 style="margin:0;font-size:20px;">Password Reset</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Reset your password</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">We received a request to reset your password. Click the button below to continue:</p>
          <p style="margin:20px 0;">
            <a href="${resetLink}" style="background:${brandDanger};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">Reset Password</a>
          </p>
          <p style="margin:16px 0;color:#6b7280;font-size:14px;">Or use this token: <strong>${token}</strong></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
  return sendMailWithFallback({ to, subject: 'Password Reset', html });
}

export async function sendTeamInvitationEmail(to, ownerEmail, ownerName, planName, invitationToken) {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
  const acceptLink = `${frontend}/team/accept?token=${encodeURIComponent(invitationToken)}`;
  const brandPrimary = '#2563eb';
  const brandAccent = '#059669';
  
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%);color:#fff;">
          <h1 style="margin:0;font-size:20px;">You're Invited to Join SilverSurfers</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Team Invitation</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            <strong>${ownerName || ownerEmail}</strong> has invited you to join their SilverSurfers team 
            with a <strong>${planName}</strong> subscription plan.
          </p>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            As a team member, you'll have access to:
          </p>
          <ul style="margin:0 0 20px 0;padding-left:20px;color:#374151;">
            <li>Website accessibility audits</li>
            <li>Detailed accessibility reports</li>
            <li>Priority support</li>
            <li>Shared team usage limits</li>
          </ul>
          <p style="margin:20px 0;">
            <a href="${acceptLink}" style="background:${brandPrimary};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">Accept Invitation</a>
          </p>
          <p style="margin:16px 0;color:#6b7280;font-size:14px;">
            Or copy this link: <strong>${acceptLink}</strong>
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            This invitation will expire in 7 days. If you don't have an account, you'll be prompted to create one.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to, 
    subject: `${ownerName || ownerEmail} invited you to join their SilverSurfers team`, 
    html 
  });
}

export async function sendTeamMemberRemovedEmail(to, ownerEmail, ownerName, planName) {
  const brandPrimary = '#2563eb';
  const brandAccent = '#059669';
  
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:#111827;color:#fff;">
          <h1 style="margin:0;font-size:20px;">Team Access Removed</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Team Membership Ended</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            Your access to the SilverSurfers team managed by <strong>${ownerName || ownerEmail}</strong> 
            has been removed from their <strong>${planName}</strong> subscription.
          </p>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            You can still create your own account and subscription if you'd like to continue using SilverSurfers services.
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            If you have any questions, please contact the team owner or our support team.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to, 
    subject: 'Team Access Removed - SilverSurfers', 
    html 
  });
}

export async function sendTeamMemberLeftNotification(ownerEmail, memberEmail, memberName, planName) {
  const brandPrimary = '#2563eb';
  const brandAccent = '#059669';
  
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:#111827;color:#fff;">
          <h1 style="margin:0;font-size:20px;">Team Member Left</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">${memberName || memberEmail} left your team</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            <strong>${memberName || memberEmail}</strong> has left your <strong>${planName}</strong> subscription team.
          </p>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            They will no longer have access to team features and will need to create their own subscription if they want to continue using SilverSurfers services.
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You can invite new team members anytime from your subscription dashboard.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to: ownerEmail, 
    subject: 'Team Member Left - SilverSurfers', 
    html 
  });
}

export async function sendTeamMemberLeftConfirmation(memberEmail, ownerEmail, ownerName, planName) {
  const brandPrimary = '#2563eb';
  const brandAccent = '#059669';
  
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:#111827;color:#fff;">
          <h1 style="margin:0;font-size:20px;">You Left the Team</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Team Membership Ended</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            You have successfully left the SilverSurfers team managed by <strong>${ownerName || ownerEmail}</strong> 
            for their <strong>${planName}</strong> subscription.
          </p>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            You no longer have access to team features. If you'd like to continue using SilverSurfers services, 
            you can create your own account and subscription.
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            Thank you for using SilverSurfers!
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to: memberEmail, 
    subject: 'You Left the Team - SilverSurfers', 
    html 
  });
}

export async function sendNewTeamMemberNotification(ownerEmail, memberEmail, memberName, planName) {
  const brandPrimary = '#2563eb';
  const brandAccent = '#059669';
  
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%);color:#fff;">
          <h1 style="margin:0;font-size:20px;">New Team Member Joined</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Welcome Your New Team Member</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            <strong>${memberName || memberEmail}</strong> has joined your SilverSurfers team 
            for the <strong>${planName}</strong> subscription plan.
          </p>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            They now have access to all team features and will share your subscription limits.
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You can manage your team members from your subscription dashboard.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to: ownerEmail, 
    subject: 'New Team Member Joined Your SilverSurfers Team', 
    html 
  });
}

// Subscription cancellation notification email
export async function sendSubscriptionCancellationEmail(to, planName, cancelAtPeriodEnd = true, currentPeriodEnd = null) {
  const brandPrimary = '#2563eb';
  const brandDanger = '#ef4444';
  const brandAccent = '#059669';
  
  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg, ${brandDanger} 0%, #dc2626 100%);color:#fff;">
          <h1 style="margin:0;font-size:20px;">Subscription Cancelled</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Your ${planName} subscription has been cancelled</h2>
          ${cancelAtPeriodEnd ? `
            <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
              Your subscription will remain active until <strong>${formatDate(currentPeriodEnd)}</strong>. 
              You can continue using SilverSurfers services until then.
            </p>
            <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
              After this date, your subscription will end and you'll need to resubscribe to continue using our services.
            </p>
          ` : `
            <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
              Your subscription has been cancelled immediately. You no longer have access to SilverSurfers premium services.
            </p>
          `}
          <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
            <p style="margin:0;color:#dc2626;font-size:14px;">
              <strong>Need help?</strong> If you have any questions or need assistance, please contact our support team.
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You can reactivate your subscription anytime from your account dashboard.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to, 
    subject: 'Subscription Cancelled - SilverSurfers', 
    html 
  });
}

// Subscription reinstatement notification email
export async function sendSubscriptionReinstatementEmail(to, planName) {
  const brandPrimary = '#2563eb';
  const brandSuccess = '#059669';
  const brandAccent = '#10b981';
  
  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg, ${brandSuccess} 0%, ${brandAccent} 100%);color:#fff;">
          <h1 style="margin:0;font-size:20px;">Subscription Reactivated</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Welcome back to SilverSurfers!</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            Great news! Your <strong>${planName}</strong> subscription has been successfully reactivated.
          </p>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            You now have full access to all SilverSurfers premium features and can continue creating accessibility reports for your websites.
          </p>
          <div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
            <p style="margin:0;color:#059669;font-size:14px;">
              <strong>Thank you for choosing SilverSurfers!</strong> We're glad to have you back.
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You can manage your subscription settings anytime from your account dashboard.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to, 
    subject: 'Subscription Reactivated - SilverSurfers', 
    html 
  });
}

// Subscription welcome/purchase confirmation email
export async function sendSubscriptionWelcomeEmail(to, planName, billingCycle = 'monthly', currentPeriodEnd = null) {
  const brandPrimary = '#2563eb';
  const brandSuccess = '#059669';
  const brandAccent = '#10b981';
  
  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getPlanFeatures = (plan) => {
    const features = {
      'starter': [
        '5 accessibility scans per month',
        'Senior-friendly scoring system',
        'PDF reports with recommendations',
        'Email delivery of reports',
        'Basic support'
      ],
      'pro': [
        '12 accessibility scans per month',
        'Senior-friendly scoring system',
        'PDF reports with recommendations',
        'Email delivery of reports',
        'Priority support',
        'Advanced analytics',
        'Team collaboration features'
      ]
    };
    return features[plan.toLowerCase()] || features['starter'];
  };

  const planFeatures = getPlanFeatures(planName);
  const billingText = billingCycle === 'yearly' ? 'annually' : 'monthly';
  const nextBillingDate = currentPeriodEnd ? formatDate(currentPeriodEnd) : 'your next billing cycle';

  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg, ${brandSuccess} 0%, ${brandAccent} 100%);color:#fff;">
          <h1 style="margin:0;font-size:20px;">Welcome to SilverSurfers!</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">Thank you for subscribing!</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
            Congratulations! You've successfully subscribed to our <strong>${planName}</strong> plan. 
            Your subscription is now active and you can start creating accessibility reports immediately.
          </p>
          
          <div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
            <h3 style="margin:0 0 12px 0;color:#059669;font-size:16px;">Your Plan Includes:</h3>
            <ul style="margin:0;padding-left:20px;color:#374151;">
              ${planFeatures.map(feature => `<li style="margin-bottom:8px;">${feature}</li>`).join('')}
            </ul>
          </div>

          <div style="margin:20px 0;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
            <h3 style="margin:0 0 8px 0;color:#2563eb;font-size:16px;">Getting Started</h3>
            <p style="margin:0 0 8px 0;line-height:1.6;color:#374151;">
              1. Visit your dashboard to start your first accessibility scan
            </p>
            <p style="margin:0 0 8px 0;line-height:1.6;color:#374151;">
              2. Enter your website URL and we'll analyze it for senior-friendly accessibility
            </p>
            <p style="margin:0;line-height:1.6;color:#374151;">
              3. Receive detailed PDF reports with actionable recommendations
            </p>
          </div>

          <div style="margin:20px 0;padding:16px;background:#fefce8;border:1px solid #fde047;border-radius:8px;">
            <p style="margin:0;color:#a16207;font-size:14px;">
              <strong>Billing Information:</strong> You're being billed ${billingText}. 
              ${currentPeriodEnd ? `Your next billing date is ${nextBillingDate}.` : ''}
            </p>
          </div>

          <p style="margin:0;font-size:12px;color:#9ca3af;">
            Need help getting started? Contact our support team anytime.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
    
  return sendMailWithFallback({ 
    to, 
    subject: 'Welcome to SilverSurfers - Your Subscription is Active!', 
    html 
  });
}
