// email.js
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
// Load .env from current working directory first, then fallback three levels up
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

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
          results.push({ filename: path.relative(rootDir, full), path: full });
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

  // Collect all files in the report folder
  let attachments = [];
  if (folderPath) {
    attachments = await collectAttachmentsRecursive(folderPath);
  }

  const mailOptions = {
    from: `SilverSurfers <${process.env.SMTP_USER || 'no-reply@silversurfers.local'}>`,
    to,
    subject,
    text,
    attachments,
  };

  try {
    // Verify transport before sending to fail fast with clearer errors
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    return {
      success: true,
      attachmentCount: attachments?.length || 0,
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

// Generic HTML email sender
export async function sendMailWithFallback({ from, to, subject, html, text, attachments }) {
  const { transporter, reason } = buildTransport();
  if (!transporter) {
    console.warn('Email skipped:', reason);
    return { success: false, error: reason };
  }
  const mailOptions = {
    from: from || `SilverSurfers <${process.env.SMTP_USER || 'no-reply@silversurfers.local'}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(attachments ? { attachments } : {}),
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
