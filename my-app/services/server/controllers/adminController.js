/**
 * Admin Controller
 */

import AnalysisRecord from '../models/AnalysisRecord.js';
import QuickScan from '../models/QuickScan.js';
import ContactMessage from '../models/ContactMessage.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Stripe from 'stripe';
import { getPlanById } from '../subscriptionPlans.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// Queue references (set by server.js)
let fullAuditQueue, quickScanQueue;

export function setQueues(fullQueue, quickQueue) {
  fullAuditQueue = fullQueue;
  quickScanQueue = quickQueue;
}

export async function rerunAnalysis(req, res) {
  try {
    const { idOrTaskId } = req.params;
    let rec = null;
    
    try { 
      rec = await AnalysisRecord.findById(idOrTaskId); 
    } catch {} 
    
    if (!rec) {
      rec = await AnalysisRecord.findOne({ taskId: String(idOrTaskId) });
    }
    
    if (!rec) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    if (!rec.email || !rec.url) {
      return res.status(400).json({ error: 'Record missing email or url' });
    }

    // Reset fields for rerun
    rec.status = 'queued';
    rec.emailStatus = 'pending';
    rec.emailError = undefined;
    rec.failureReason = undefined;
    rec.attachmentCount = 0;
    rec.emailAccepted = undefined;
    rec.emailRejected = undefined;
    await rec.save().catch(()=>{});

    // Enqueue using the same taskId
    await fullAuditQueue.addJob({ 
      email: rec.email, 
      url: rec.url, 
      userId: rec.user || undefined, 
      taskId: rec.taskId,
      planId: rec.planId,
      selectedDevice: rec.device,
      firstName: rec.firstName || '',
      lastName: rec.lastName || ''
    });
    
    return res.json({ message: 'Re-run queued on existing record', taskId: rec.taskId, id: rec._id });
  } catch (err) {
    console.error('Admin rerun error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to queue re-run' });
  }
}

export async function getContactMessages(req, res) {
  try {
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

    const {
      page = 1,
      limit = 100,
      search,
      planId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 100, 500);
    const parsedPage = parseInt(page) || 1;
    const skip = (parsedPage - 1) * parsedLimit;

    // Base query: only records tied to a plan (subscription or one-time)
    const query = { planId: { $ne: null } };

    if (planId && planId !== 'all') {
      query.planId = planId;
    }

    if (search) {
      const regex = { $regex: search, $options: 'i' };
      query.$or = [{ url: regex }, { email: regex }];
    }

    const allowedSorts = new Set(['createdAt', 'email', 'url', 'score', 'status']);
    const sortField = allowedSorts.has(sortBy) ? sortBy : 'createdAt';
    const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

    const [items, total, stats] = await Promise.all([
      AnalysisRecord.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      AnalysisRecord.countDocuments(query),
      AnalysisRecord.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalScans: { $sum: 1 },
            completedScans: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            failedScans: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            uniqueEmails: { $addToSet: '$email' },
            uniqueUrls: { $addToSet: '$url' }
          }
        },
        {
          $project: {
            totalScans: 1,
            completedScans: 1,
            failedScans: 1,
            uniqueEmails: { $size: '$uniqueEmails' },
            uniqueUrls: { $size: '$uniqueUrls' }
          }
        }
      ])
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
      items,
      total,
      page: parsedPage,
      limit: parsedLimit,
      pages: Math.ceil(total / parsedLimit),
      statistics
    });
  } catch (error) {
    console.error('Error fetching subscription scans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription scans' });
  }
}

export async function bulkQuickScans(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { urls, email, firstName, lastName } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required and must not be empty.' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const results = [];

    for (const url of urls) {
      try {
        const quickScanRecord = await QuickScan.create({
          url: url.trim(),
          email: email.toLowerCase(),
          firstName: firstName || '',
          lastName: lastName || '',
          status: 'queued',
          scanDate: new Date()
        });

        const taskId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        
        await quickScanQueue.addJob({
          email,
          url: url.trim(),
          firstName: firstName || '',
          lastName: lastName || '',
          userId: null,
          taskId,
          jobType: 'quick-scan',
          subscriptionId: null,
          priority: 2,
          quickScanId: quickScanRecord._id
        });

        results.push({ url, success: true, taskId, quickScanId: quickScanRecord._id });
      } catch (error) {
        console.error(`Failed to queue quick scan for ${url}:`, error);
        results.push({ url, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Queued ${results.filter(r => r.success).length} of ${urls.length} quick scans.`,
      results
    });
  } catch (error) {
    console.error('Bulk quick scans error:', error);
    res.status(500).json({ error: 'Failed to queue bulk quick scans' });
  }
}

// User management functions
export async function getUsers(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { search, role, subscriptionStatus, page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } } // Support legacy 'name' field
      ];
    }
    
    if (role && role !== 'all') {
      query.role = role;
    }
    
    // Fetch users (without subscription filtering first)
    let users = await User.find(query)
      .select('-password -passwordHash')
      .sort({ createdAt: -1 })
      .lean();
    
    // Populate subscription details for each user
    // First check embedded subscription in User, then fall back to Subscription collection
    const usersWithSubscriptions = await Promise.all(
      users.map(async (user) => {
        const userObj = { ...user };
        
        // Add computed 'name' field from firstName and lastName (for frontend compatibility)
        if (!userObj.name && (userObj.firstName || userObj.lastName)) {
          userObj.name = [userObj.firstName, userObj.lastName].filter(Boolean).join(' ') || userObj.email;
        }
        
        // Use embedded subscription from User model if it exists and has status
        if (user.subscription && user.subscription.status && user.subscription.status !== 'none') {
          userObj.subscription = {
            planName: user.subscription.planId,
            planId: user.subscription.planId,
            status: user.subscription.status,
            scansPerMonth: user.subscription.scansPerMonth || 0,
            usage: user.subscription.usage?.scansThisMonth || 0,
            limit: user.subscription.scansPerMonth || 0,
            currentPeriodEnd: user.subscription.currentPeriodEnd,
            periodEnd: user.subscription.currentPeriodEnd,
            isTeamMember: user.subscription.isTeamMember || false,
            billingCycle: user.subscription.billingCycle || 'yearly'
          };
        } else {
          // Fall back to Subscription collection
          const subscription = await Subscription.findOne({ 
            user: user._id, 
            status: { $in: ['active', 'trialing', 'past_due', 'canceled'] } 
          }).sort({ createdAt: -1 }).lean();
          
          if (subscription) {
            userObj.subscription = {
              planName: subscription.planId,
              planId: subscription.planId,
              status: subscription.status,
              scansPerMonth: subscription.limits?.scansPerMonth || 0,
              usage: subscription.usage?.scansThisMonth || 0,
              limit: subscription.limits?.scansPerMonth || 0,
              currentPeriodEnd: subscription.currentPeriodEnd,
              periodEnd: subscription.currentPeriodEnd,
              isTeamMember: subscription.teamMembers?.length > 0 || false,
              billingCycle: 'yearly'
            };
          } else {
            userObj.subscription = null;
          }
        }
        
        return userObj;
      })
    );
    
    // Filter by subscription status if needed
    let filteredUsers = usersWithSubscriptions;
    if (subscriptionStatus && subscriptionStatus !== 'all') {
      filteredUsers = usersWithSubscriptions.filter(user => {
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
    
    // Apply pagination after filtering
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = filteredUsers.length;
    const paginatedUsers = filteredUsers.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      users: paginatedUsers, // Frontend expects 'users' not 'items'
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
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
        $set: { 'usage.scansThisMonth': 0 }
      });
    }

    // Also reset in User collection if it has subscription.usage
    await User.findByIdAndUpdate(id, {
      $set: { 'subscription.usage.scansThisMonth': 0 }
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

    // Prevent admin from demoting themselves
    if (req.user.id === id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot demote yourself from admin role' });
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

export async function updateUserSubscription(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { userId, planId, billingCycle = 'yearly' } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'User ID and Plan ID are required.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Get current subscription (if any)
    const currentSubscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    // If no active subscription exists, create a new one
    if (!currentSubscription) {
      console.log(`🔧 Admin creating new subscription for user ${userId} with plan ${planId}`);
      
      // Check if user has a Stripe customer ID, create one if not
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

      // Create a new subscription in Stripe (always yearly now)
      const newPriceId = plan.yearlyPriceId;
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

      // Create local subscription record
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
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        cancelAtPeriodEnd: false
      });

      await newSubscription.save();

      // Update user subscription info
      await User.findByIdAndUpdate(userId, {
        'subscription.status': 'active',
        'subscription.planId': planId,
        'subscription.priceId': newPriceId,
        'subscription.limits': plan.limits,
        'subscription.usage.scansThisMonth': 0,
        'subscription.currentPeriodStart': new Date(),
        'subscription.currentPeriodEnd': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        'subscription.cancelAtPeriodEnd': false
      });

      console.log(`✅ Admin successfully created new subscription for user ${userId} with plan ${planId}`);

      return res.json({ 
        message: 'New subscription created successfully',
        subscription: newSubscription,
        created: true
      });
    }

    // Update existing subscription
    const newPriceId = plan.yearlyPriceId; // Always yearly now
    if (!newPriceId) {
      return res.status(400).json({ error: 'Price ID not configured for this plan.' });
    }

    // Retrieve Stripe subscription to get the subscription item id
    const stripeSub = await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId);
    const subscriptionItemId = stripeSub?.items?.data?.[0]?.id;
    if (!subscriptionItemId) {
      return res.status(500).json({ error: 'Could not determine subscription item to update.' });
    }

    // Update subscription in Stripe
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
          billingCycle: 'yearly',
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
}


