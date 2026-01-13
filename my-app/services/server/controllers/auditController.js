/**
 * Audit Controller
 * Handles audit-related requests
 */

import AnalysisRecord from '../models/AnalysisRecord.js';
import QuickScan from '../models/QuickScan.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { authRequired } from '../auth.js';

// Helper: normalize URL (prefer https). Returns {candidateUrls, input}
function buildCandidateUrls(input) {
  const raw = (input || '').trim();
  if (!raw) return { input: raw, candidateUrls: [] };
  // If already has protocol, use as-is only
  if (/^https?:\/\//i.test(raw)) {
    return { input: raw, candidateUrls: [raw] };
  }
  // Strip leading protocol-like text if malformed
  const cleaned = raw.replace(/^\w+:\/\//, '');
  // Prefer https first, then http
  return {
    input: raw,
    candidateUrls: [
      `https://${cleaned}`,
      `http://${cleaned}`
    ]
  };
}

async function tryFetch(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Try HEAD first
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (!res.ok || res.status === 405) {
      // Some servers don't support HEAD well; try GET lightweight
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    const finalUrl = res.url || url;
    console.log(`🔍 Simple precheck: ${url} → ${finalUrl} (${res.status}) ✅`);
    return { ok: true, status: res.status, finalUrl, redirected: res.redirected };
  } catch (err) {
    console.log(`❌ Precheck failed: ${url} - ${err?.message}`);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

// Queue references (set by server.js)
let fullAuditQueue, quickScanQueue;

export function setQueues(fullQueue, quickQueue) {
  fullAuditQueue = fullQueue;
  quickScanQueue = quickQueue;
}

// Middleware to check subscription access
async function hasSubscriptionAccess(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check for active subscription
    const subscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] }
    }).lean();

    // Check for one-time scans
    const user = await User.findById(userId).lean();
    const hasOneTimeScans = user?.oneTimeScans > 0;

    if (!subscription && !hasOneTimeScans) {
      return res.status(403).json({ 
        error: 'No active subscription or one-time scans available. Please subscribe or purchase a scan.' 
      });
    }

    req.subscription = subscription;
    req.hasOneTimeScans = hasOneTimeScans;
    next();
  } catch (error) {
    console.error('Subscription access check error:', error);
    res.status(500).json({ error: 'Failed to check subscription access' });
  }
}

export async function precheckUrl(req, res) {
  const { url } = req.body || {};
  console.log(`🔍 Simple precheck request for: ${url}`);
  
  const { candidateUrls, input } = buildCandidateUrls(url);
  if (!candidateUrls.length) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }
  
  console.log(`🔍 Trying ${candidateUrls.length} URL variants:`, candidateUrls);
  
  // Try each candidate URL
  for (const candidate of candidateUrls) {
    console.log(`🔍 Testing: ${candidate}`);
    
    const result = await tryFetch(candidate, 8000);
    
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
  
  // If all attempts failed
  console.log(`❌ All precheck attempts failed for ${input}`);
  
  return res.status(400).json({ 
    success: false, 
    input, 
    error: 'URL not reachable. Please check the domain and try again.'
  });
}

export async function startAudit(req, res) {
  const { email, url, selectedDevice, firstName, lastName } = req.body || {};
  if (!email || !url) {
    return res.status(400).json({ error: 'Email and URL are required.' });
  }

  const userId = req.user.id;
  const isOneTimeScan = req.hasOneTimeScans;
  const subscription = req.subscription;

  console.log(`📊 Full audit requested for ${firstName} ${lastName} (${email}) - Device: ${selectedDevice || 'all'}`);

  // Handle one-time scans
  if (isOneTimeScan) {
    // Validate device selection for one-time scans
    if (!selectedDevice) {
      return res.status(400).json({ 
        error: 'Device selection is required for one-time scans. Please select desktop, mobile, or tablet.' 
      });
    }
    const validDevices = ['desktop', 'mobile', 'tablet'];
    if (!validDevices.includes(selectedDevice)) {
      return res.status(400).json({ 
        error: `Invalid device selection: ${selectedDevice}. Must be one of: ${validDevices.join(', ')}` 
      });
    }

    // Check if user has available one-time scans
    const user = await User.findById(userId);
    if (!user || !user.oneTimeScans || user.oneTimeScans <= 0) {
      return res.status(403).json({ 
        error: 'No one-time scans available. Please purchase a scan or subscribe to a plan.' 
      });
    }

    // Decrement one-time scan immediately
    try {
      await User.findByIdAndUpdate(userId, {
        $inc: { oneTimeScans: -1 }
      });
      console.log(`✅ Consumed 1 one-time scan for user ${email}. Remaining: ${user.oneTimeScans - 1}`);
    } catch (error) {
      console.error('Failed to decrement one-time scan:', error);
      return res.status(500).json({ error: 'Failed to process one-time scan' });
    }
  } else {
    // Handle subscription scans
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
  }

  // Precheck and normalize URL
  const { candidateUrls } = buildCandidateUrls(url);
  if (!candidateUrls.length) return res.status(400).json({ error: 'Invalid URL' });
  let normalizedUrl = null;
  
  for (const candidate of candidateUrls) {
    const r = await tryFetch(candidate, 8000);
    if (r.ok) { 
      normalizedUrl = r.finalUrl || candidate; 
      break; 
    }
  }
  
  // If no URL worked, reject the request
  if (!normalizedUrl) {
    return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });
  }

  // Create persistent audit job
  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  
  try {
    // Get plan ID from subscription (or default for one-time scans)
    const planId = subscription?.planId || 'oneTime';
    
    // Add job to persistent queue
    const job = await fullAuditQueue.addJob({
      email,
      url: normalizedUrl,
      firstName: firstName || '',
      lastName: lastName || '',
      userId: subscription?.user || userId,
      taskId,
      jobType: 'full-audit',
      subscriptionId: subscription?._id || null,
      planId: planId,
      selectedDevice: selectedDevice,
      priority: 1 // Normal priority
    });

    // Create AnalysisRecord for backward compatibility
    await AnalysisRecord.create({
      user: subscription?.user || userId,
      email,
      firstName: firstName || '',
      lastName: lastName || '',
      url: normalizedUrl,
      taskId,
      planId: planId,
      device: selectedDevice,
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
    
    // Rollback usage increment on failure (only for subscription scans)
    if (!isOneTimeScan && subscription) {
      await Subscription.findByIdAndUpdate(subscription._id, {
        $inc: { 'usage.scansThisMonth': -1 }
      }).catch(err => console.error('Failed to rollback usage:', err));
    }
    
    // Rollback one-time scan decrement on failure
    if (isOneTimeScan) {
      await User.findByIdAndUpdate(userId, {
        $inc: { oneTimeScans: 1 }
      }).catch(err => console.error('Failed to rollback one-time scan:', err));
    }
    
    res.status(500).json({ error: 'Failed to queue audit request' });
  }
}

export async function quickAudit(req, res) {
  const { email, url, firstName, lastName } = req.body || {};
  if (!email || !url) {
    return res.status(400).json({ error: 'Email and URL are required.' });
  }

  // Quick scan is now FREE - no authentication or subscription limits required
  console.log(`🆓 FREE Quick scan requested for ${firstName} ${lastName} (${email}) on ${url}`);

  // Precheck and normalize URL
  const { candidateUrls } = buildCandidateUrls(url);
  if (!candidateUrls.length) return res.status(400).json({ error: 'Invalid URL' });
  let normalizedUrl = null;
  
  for (const candidate of candidateUrls) {
    const r = await tryFetch(candidate, 8000);
    if (r.ok) { 
      normalizedUrl = r.finalUrl || candidate; 
      break; 
    }
  }
  
  // If no URL worked, reject the request
  if (!normalizedUrl) {
    return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });
  }

  // Create persistent audit job
  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  
  try {
    // Save quick scan record to database
    const quickScanRecord = await QuickScan.create({
      url: normalizedUrl,
      email: email.toLowerCase(),
      firstName: firstName || '',
      lastName: lastName || '',
      status: 'queued', // Start as queued; updated when processing finishes
      scanDate: new Date()
    });

    // Add job to persistent queue (FREE - no subscription required)
    const job = await quickScanQueue.addJob({
      email,
      url: normalizedUrl,
      firstName: firstName || '',
      lastName: lastName || '',
      userId: null, // No user required for free scans
      taskId,
      jobType: 'quick-scan',
      subscriptionId: null, // No subscription required
      priority: 2, // Higher priority for quick scans
      quickScanId: quickScanRecord._id // Link to quick scan record
    });

    console.log(`📊 Quick scan record saved: ${quickScanRecord._id} for ${email} on ${normalizedUrl}`);

    res.status(202).json({ 
      message: '🆓 FREE Quick audit request has been queued. You will receive results via email shortly!',
      taskId: job.taskId,
      jobId: job._id
    });
  } catch (error) {
    console.error('Failed to queue quick audit:', error);
    
    res.status(500).json({ error: 'Failed to queue audit request' });
  }
}



