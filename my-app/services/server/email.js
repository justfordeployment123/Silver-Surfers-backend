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
          <p style="margin:0;font-size:12px;color:#9ca3af;">If you didn’t request this, you can safely ignore this email.</p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;
  return sendMailWithFallback({ to, subject: 'Password Reset', html });
}
