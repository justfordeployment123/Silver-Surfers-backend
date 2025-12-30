import Stripe from 'stripe';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import AnalysisRecord from '../models/AnalysisRecord.js';
import QuickScan from '../models/QuickScan.js';
import { getPlanById } from '../subscriptionPlans.js';
import { buildCandidateUrls, tryFetch } from '../services/urlService.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// Maximum number of URLs that can be submitted in bulk
const MAX_BULK_SUBMISSIONS = 50;

// This will be injected from server.js
let fullAuditQueue, quickScanQueue;

export function setQueues(fullQueue, quickQueue) {
  fullAuditQueue = fullQueue;
  quickScanQueue = quickQueue;
}

export async function updateSubscription(req, res) {
  try {
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

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const currentSubscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!currentSubscription) {
      console.log(`🔧 Admin creating new subscription for user ${userId} with plan ${planId}`);
      
      if (!user.stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.email,
          metadata: {
            userId: userId.toString(),
            createdBy: 'admin'
          }
        });
        user.stripeCustomerId = customer.id;
        await user.save();
      }

      const newPriceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
      if (!newPriceId) {
        return res.status(400).json({ error: 'Price ID not configured for this plan.' });
      }

      const stripeSubscription = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: [{ price: newPriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId: userId.toString(),
          planId: planId,
          createdBy: 'admin'
        }
      });

      const newSubscription = new Subscription({
        user: userId,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: user.stripeCustomerId,
        planId: planId,
        priceId: newPriceId,
        status: 'active',
        limits: plan.limits,
        usage: {
          scansThisMonth: 0,
          totalScans: 0
        },
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        createdByAdmin: true
      });

      await newSubscription.save();

      await User.findByIdAndUpdate(userId, {
        'subscription.status': 'active',
        'subscription.planId': planId,
        'subscription.priceId': newPriceId,
        'subscription.limits': plan.limits,
        'subscription.usage.scansThisMonth': 0,
        'subscription.currentPeriodStart': new Date(),
        'subscription.currentPeriodEnd': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        'subscription.cancelAtPeriodEnd': false
      });

      console.log(`✅ Admin successfully created new subscription for user ${userId} with plan ${planId}`);

      return res.json({ 
        message: 'New subscription created successfully',
        subscription: newSubscription,
        created: true
      });
    }

    const newPriceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!newPriceId) {
      return res.status(400).json({ error: 'Price ID not configured for this plan.' });
    }

    const stripeSub = await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId);
    const subscriptionItemId = stripeSub?.items?.data?.[0]?.id;
    if (!subscriptionItemId) {
      return res.status(500).json({ error: 'Could not determine subscription item to update.' });
    }

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
}

export async function rerunAnalysis(req, res) {
  try {
    const { idOrTaskId } = req.params;
    let rec = null;
    try { rec = await AnalysisRecord.findById(idOrTaskId); } catch {}
    if (!rec) rec = await AnalysisRecord.findOne({ taskId: String(idOrTaskId) });
    if (!rec) return res.status(404).json({ error: 'Record not found' });
    if (!rec.email || !rec.url) return res.status(400).json({ error: 'Record missing email or url' });

    rec.status = 'queued';
    rec.emailStatus = 'pending';
    rec.emailError = undefined;
    rec.failureReason = undefined;
    rec.attachmentCount = 0;
    rec.emailAccepted = undefined;
    rec.emailRejected = undefined;
    await rec.save().catch(()=>{});

    fullAuditQueue.addBgJob({ email: rec.email, url: rec.url, userId: rec.user || undefined, taskId: rec.taskId });
    return res.json({ message: 'Re-run queued on existing record', taskId: rec.taskId, id: rec._id });
  } catch (err) {
    console.error('Admin rerun error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to queue re-run' });
  }
}

export async function getQuickScans(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 50, status, search, sortBy = 'scanDate', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { url: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [quickScans, total] = await Promise.all([
      QuickScan.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      QuickScan.countDocuments(query)
    ]);

    const stats = await QuickScan.aggregate([
      { $group: {
        _id: null,
        totalScans: { $sum: 1 },
        completedScans: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failedScans: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        uniqueEmails: { $addToSet: '$email' },
        uniqueUrls: { $addToSet: '$url' }
      }},
      { $project: {
        totalScans: 1,
        completedScans: 1,
        failedScans: 1,
        uniqueEmails: { $size: '$uniqueEmails' },
        uniqueUrls: { $size: '$uniqueUrls' }
      }}
    ]);

    const statistics = stats[0] || {
      totalScans: 0,
      completedScans: 0,
      failedScans: 0,
      uniqueEmails: 0,
      uniqueUrls: 0
    };

    res.json({
      success: true,
      items: quickScans,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      statistics
    });
  } catch (error) {
    console.error('Error fetching quick scans:', error);
    res.status(500).json({ error: 'Failed to fetch quick scans' });
  }
}

export async function getSubscriptionScans(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 50, planFilter, planId, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    const selectedPlan = planId || planFilter;
    if (selectedPlan && selectedPlan !== 'all') {
      query.planId = selectedPlan;
    }
    if (search) {
      query.$or = [
        { url: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [records, total] = await Promise.all([
      AnalysisRecord.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      AnalysisRecord.countDocuments(query)
    ]);

    const stats = await AnalysisRecord.aggregate([
      { $group: {
        _id: null,
        totalScans: { $sum: 1 },
        starterScans: { $sum: { $cond: [{ $eq: ['$planId', 'starter'] }, 1, 0] } },
        proScans: { $sum: { $cond: [{ $eq: ['$planId', 'pro'] }, 1, 0] } },
        completedScans: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failedScans: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
      }}
    ]);

    const statistics = stats[0] || {
      totalScans: 0,
      starterScans: 0,
      proScans: 0,
      completedScans: 0,
      failedScans: 0
    };

    res.json({
      success: true,
      items: records,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      statistics
    });
  } catch (error) {
    console.error('Error fetching subscription scans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription scans' });
  }
}

export async function getUsers(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 50, search, role, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (role && role !== 'all') {
      query.role = role;
    }
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      items: users,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

export async function getUser(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const user = await User.findById(id).select('-password').lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await Subscription.findOne({ 
      user: id, 
      status: { $in: ['active', 'trialing', 'past_due', 'canceled'] } 
    }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      user: {
        ...user,
        subscription
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

export async function resetUserUsage(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await Subscription.findOne({ 
      user: id, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (subscription) {
      await Subscription.findByIdAndUpdate(subscription._id, {
        'usage.scansThisMonth': 0
      });
    }

    await User.findByIdAndUpdate(id, {
      'subscription.usage.scansThisMonth': 0
    });

    res.json({
      success: true,
      message: 'User usage reset successfully'
    });
  } catch (error) {
    console.error('Error resetting user usage:', error);
    res.status(500).json({ error: 'Failed to reset user usage' });
  }
}

export async function updateUserRole(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Valid role (user or admin) is required' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
}

export async function getQueueStatus(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const fullAuditStats = await fullAuditQueue?.getStats() || { error: 'Queue not initialized' };
    const quickScanStats = await quickScanQueue?.getStats() || { error: 'Queue not initialized' };

    res.json({
      success: true,
      fullAudit: fullAuditStats,
      quickScan: quickScanStats,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Queue status error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
}

export async function recoverQueue(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔍 Admin triggered manual queue recovery');
    await fullAuditQueue?.recoverJobs();
    await quickScanQueue?.recoverJobs();

    const fullAuditStats = await fullAuditQueue?.getStats() || { error: 'Queue not initialized' };
    const quickScanStats = await quickScanQueue?.getStats() || { error: 'Queue not initialized' };

    res.json({
      success: true,
      message: 'Queue recovery completed',
      fullAudit: fullAuditStats,
      quickScan: quickScanStats,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Queue recovery error:', err?.message || err);
    res.status(500).json({ error: 'Failed to recover queue' });
  }
}

export async function bulkQuickScans(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!quickScanQueue) {
      return res.status(503).json({ error: 'Quick scan queue not initialized' });
    }

    const { urls, email, firstName, lastName } = req.body || {};

    // Validate input
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    if (urls.length === 0) {
      return res.status(400).json({ error: 'At least one URL is required' });
    }

    if (urls.length > MAX_BULK_SUBMISSIONS) {
      return res.status(400).json({ 
        error: `Maximum ${MAX_BULK_SUBMISSIONS} URLs allowed per bulk submission. You provided ${urls.length}.` 
      });
    }

    // Use admin email if not provided
    const adminEmail = email || req.user.email || 'admin@silversurfers.ai';
    const adminFirstName = firstName || 'Admin';
    const adminLastName = lastName || 'User';

    console.log(`📦 Admin bulk quick scan submission: ${urls.length} URLs for ${adminEmail}`);

    const results = {
      total: urls.length,
      successful: [],
      failed: [],
      skipped: []
    };

    // Process each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const urlIndex = i + 1;

      try {
        // Validate and normalize URL
        const { candidateUrls } = buildCandidateUrls(url);
        if (!candidateUrls.length) {
          results.failed.push({
            url,
            index: urlIndex,
            error: 'Invalid URL format'
          });
          continue;
        }

        let normalizedUrl = null;
        for (const candidate of candidateUrls) {
          const r = await tryFetch(candidate, 8000);
          if (r.ok) {
            normalizedUrl = r.finalUrl || candidate;
            break;
          }
        }

        if (!normalizedUrl) {
          results.failed.push({
            url,
            index: urlIndex,
            error: 'URL not reachable'
          });
          continue;
        }

        // Check if a quick scan for this URL already exists (within last 24 hours)
        const existingScan = await QuickScan.findOne({
          url: normalizedUrl,
          email: adminEmail.toLowerCase(),
          scanDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).sort({ scanDate: -1 });

        if (existingScan && existingScan.status === 'completed') {
          results.skipped.push({
            url: normalizedUrl,
            index: urlIndex,
            reason: 'Recent scan exists',
            existingScanId: existingScan._id
          });
          continue;
        }

        // Create quick scan record
        const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i}`;
        
        const quickScanRecord = await QuickScan.create({
          url: normalizedUrl,
          email: adminEmail.toLowerCase(),
          firstName: adminFirstName,
          lastName: adminLastName,
          status: 'queued',
          scanDate: new Date()
        });

        // Queue the job
        const job = await quickScanQueue.addJob({
          email: adminEmail,
          url: normalizedUrl,
          firstName: adminFirstName,
          lastName: adminLastName,
          userId: null,
          taskId,
          jobType: 'quick-scan',
          subscriptionId: null,
          priority: 2,
          quickScanId: quickScanRecord._id
        });

        results.successful.push({
          url: normalizedUrl,
          index: urlIndex,
          taskId: job.taskId,
          jobId: job._id,
          quickScanId: quickScanRecord._id
        });

        console.log(`✅ Queued quick scan ${urlIndex}/${urls.length}: ${normalizedUrl}`);

      } catch (error) {
        console.error(`❌ Failed to queue URL ${urlIndex} (${url}):`, error.message);
        results.failed.push({
          url,
          index: urlIndex,
          error: error.message || 'Unknown error'
        });
      }
    }

    const summary = {
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      skipped: results.skipped.length
    };

    console.log(`📊 Bulk submission complete: ${summary.successful} successful, ${summary.failed} failed, ${summary.skipped} skipped`);

    res.status(200).json({
      success: true,
      message: `Bulk submission processed: ${summary.successful} queued, ${summary.failed} failed, ${summary.skipped} skipped`,
      summary,
      results,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Bulk quick scans error:', error);
    res.status(500).json({ 
      error: 'Failed to process bulk quick scans',
      details: error.message 
    });
  }
}

