import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from './models/User.js';
import AnalysisRecord from './models/AnalysisRecord.js';
import { sendAuditReportEmail, sendBasicEmail, sendVerificationEmail, sendPasswordResetEmail } from './email.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(user) {
  return jwt.sign({ id: user._id?.toString?.() || user._id, email: user.email, role: user.role || 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function randomToken() { return crypto.randomBytes(32).toString('hex'); }
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

router.post('/register', async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    email = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'User already exists' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const passwordHash = await bcrypt.hash(password, 10);
  const tokenPlain = randomToken();
  const verificationTokenHash = hashToken(tokenPlain);
    const verificationExpires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
    const user = await User.create({ email, passwordHash, role: 'user', provider: 'local', verified: false, verificationTokenHash, verificationExpires });
    try {
      await sendVerificationEmail(email, tokenPlain);
    } catch (e) {
      console.warn('Failed to send verification email:', e.message);
    }
    return res.status(201).json({ message: 'Registered. Please verify your email.' });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: 'User already exists' });
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const hashed = hashToken(token);
    const user = await User.findOne({ verificationTokenHash: hashed, verificationExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
    user.verified = true;
    user.verificationTokenHash = undefined;
    user.verificationExpires = undefined;
    await user.save();
    const jwtToken = signToken(user);
    return res.json({ token: jwtToken, user: { email: user.email, role: user.role, verified: true } });
  } catch (err) {
    console.error('Verify email error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.verified) return res.status(400).json({ error: 'Already verified' });
  const tokenPlain = randomToken();
  user.verificationTokenHash = hashToken(tokenPlain);
    user.verificationExpires = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await user.save();
    try {
      await sendVerificationEmail(user.email, tokenPlain);
    } catch (e) {
      console.warn('Failed to send verification email:', e.message);
    }
    return res.json({ message: 'Verification email sent' });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.verified) return res.status(403).json({ error: 'Email not verified' });
    const token = signToken(user);
    return res.json({ token, user: { email: user.email, role: user.role, verified: true } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Forgot password: always respond success (do not reveal existence)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });
    const norm = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: norm });
    if (user) {
      const tokenPlain = randomToken();
      user.resetTokenHash = hashToken(tokenPlain);
      user.resetExpires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
      await user.save();
      try {
        const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
        const link = `${frontendBase}/reset-password?token=${encodeURIComponent(tokenPlain)}`;
        await sendBasicEmail({
          to: user.email,
          subject: 'Reset your SilverSurfers password',
          text: `We received a request to reset your password. Use the link below within 1 hour:\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
        });
      } catch (e) {
        console.warn('Failed to send reset email:', e.message);
      }
    }
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hashed = hashToken(String(token));
    const user = await User.findOne({ resetTokenHash: hashed, resetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
    user.passwordHash = await bcrypt.hash(String(password), 10);
    user.resetTokenHash = undefined;
    user.resetExpires = undefined;
    await user.save();
    // Auto-login after reset
    const jwtToken = signToken(user);
    return res.json({ message: 'Password has been reset.', token: jwtToken, user: { email: user.email, role: user.role, verified: user.verified } });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(200).json({ user: null });
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(200).json({ user: null });
    return res.json({ user: { email: user.email, role: user.role, verified: user.verified } });
  } catch (err) {
    return res.status(200).json({ user: null });
  }
});

// Forgot password: generic response to avoid user enumeration
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });
    const norm = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: norm });
    if (user) {
      const tokenPlain = randomToken();
      user.resetTokenHash = hashToken(tokenPlain);
      user.resetExpires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
      await user.save();
      try {
        await sendPasswordResetEmail(user.email, tokenPlain);
      } catch (e) {
        console.warn('Failed to send reset email:', e.message);
      }
    }
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hashed = hashToken(String(token));
    const user = await User.findOne({ resetTokenHash: hashed, resetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
    user.passwordHash = await bcrypt.hash(String(password), 10);
    user.resetTokenHash = undefined;
    user.resetExpires = undefined;
    await user.save();
    const jwtToken = signToken(user);
    return res.json({ message: 'Password has been reset.', token: jwtToken, user: { email: user.email, role: user.role, verified: user.verified } });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// List my analysis records (requires auth)
router.get('/my-analysis', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const { limit } = req.query || {};
    // Prefer user id match; fallback to email if user field is missing in record
    const q = { $or: [ { user: payload.id }, { email: payload.email } ] };
    const items = await AnalysisRecord.find(q).sort({ createdAt: -1 }).limit(Number(limit) || 50).lean();
    return res.json({ items });
  } catch (err) {
    console.error('My analysis error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
