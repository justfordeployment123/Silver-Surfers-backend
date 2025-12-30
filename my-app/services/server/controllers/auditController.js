import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import AnalysisRecord from '../models/AnalysisRecord.js';
import QuickScan from '../models/QuickScan.js';
import { buildCandidateUrls, tryFetch } from '../services/urlService.js';

// This will be injected from server.js
let fullAuditQueue, quickScanQueue;

export function setQueues(fullQueue, quickQueue) {
  fullAuditQueue = fullQueue;
  quickScanQueue = quickQueue;
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
    const user = await User.findById(userId);
    if (!user || !user.oneTimeScans || user.oneTimeScans <= 0) {
      return res.status(403).json({ 
        error: 'No one-time scans available. Please purchase a scan or subscribe to a plan.' 
      });
    }

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
  
  if (!normalizedUrl) {
    return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });
  }

  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  
  try {
    const planId = subscription?.planId || 'oneTime';
    const device = req.body.selectedDevice || null;
    
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
      selectedDevice: device,
      priority: 1
    });

    await AnalysisRecord.create({
      user: subscription?.user || userId,
      email,
      firstName: firstName || '',
      lastName: lastName || '',
      url: normalizedUrl,
      taskId,
      planId: planId,
      device: device,
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
    
    if (!isOneTimeScan && subscription) {
      await Subscription.findByIdAndUpdate(subscription._id, {
        $inc: { 'usage.scansThisMonth': -1 }
      }).catch(err => console.error('Failed to rollback usage:', err));
    }
    
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

  console.log(`🆓 FREE Quick scan requested for ${firstName} ${lastName} (${email}) on ${url}`);

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
  
  if (!normalizedUrl) {
    return res.status(400).json({ error: 'URL not reachable. Please check the domain and try again.' });
  }

  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  
  try {
    const quickScanRecord = await QuickScan.create({
      url: normalizedUrl,
      email: email.toLowerCase(),
      firstName: firstName || '',
      lastName: lastName || '',
      status: 'queued',
      scanDate: new Date()
    });

    const job = await quickScanQueue.addJob({
      email,
      url: normalizedUrl,
      firstName: firstName || '',
      lastName: lastName || '',
      userId: null,
      taskId,
      jobType: 'quick-scan',
      subscriptionId: null,
      priority: 2,
      quickScanId: quickScanRecord._id
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

export async function cleanup(req, res) {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath is required.' });
  }
  try {
    const fs = await import('fs/promises');
    await fs.rm(folderPath, { recursive: true, force: true });
    res.status(200).json({ message: 'Cleanup successful.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform cleanup.' });
  }
}

export async function confirmPayment(req, res) {
  try {
    if (!fullAuditQueue) {
      return res.status(503).json({ error: 'Queue not initialized' });
    }
    
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
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

    let existing = await AnalysisRecord.findOne({ stripeSessionId: session.id });
    if (!existing) {
      existing = await AnalysisRecord.findOne({ email, url, status: { $in: ['queued','processing'] } }, {}, { sort: { createdAt: -1 } });
    }

    if (existing) {
      if (!existing.stripeSessionId) {
        existing.stripeSessionId = session.id;
        await existing.save().catch(()=>{});
      }
      if (existing.status === 'queued' || existing.status === 'processing') {
        fullAuditQueue.addBgJob({ email, url, taskId: existing.taskId });
      }
      return res.json({ message: 'Payment confirmed. Audit job queued (existing record).' });
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await AnalysisRecord.create({ email, url, taskId, stripeSessionId: session.id, status: 'queued', emailStatus: 'pending' }).catch(() => {});
    fullAuditQueue.addBgJob({ email, url, taskId });
    return res.json({ message: 'Payment confirmed. Audit job queued.' });
  } catch (err) {
    console.error('Confirm payment error:', err);
    return res.status(500).json({ error: 'Failed to confirm payment.' });
  }
}

