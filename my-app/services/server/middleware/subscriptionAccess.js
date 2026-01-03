import User from '../models/User.js';
import Subscription from '../models/Subscription.js';

export async function hasSubscriptionAccess(req, res, next) {
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
      req.user.oneTimeScans = user.oneTimeScans || 0;
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
          req.user.oneTimeScans = user.oneTimeScans || 0;
          return next();
        }
      }

      // Clean up invalid team membership
      await User.findByIdAndUpdate(userId, {
        'subscription.isTeamMember': false,
        'subscription.teamOwner': null
      });
    }

    // Check if user has one-time scans available (no subscription required)
    if (user.oneTimeScans && user.oneTimeScans > 0) {
      req.user.oneTimeScans = user.oneTimeScans;
      req.hasOneTimeScans = true;
      // Create a temporary subscription object for compatibility
      req.subscription = {
        _id: null,
        user: userId,
        usage: { scansThisMonth: 0 },
        limits: { scansPerMonth: user.oneTimeScans }
      };
      return next();
    }

    return res.status(403).json({ error: 'No active subscription or one-time scans available.' });

  } catch (err) {
    console.error('Subscription access check error:', err);
    return res.status(500).json({ error: 'Failed to verify subscription access.' });
  }
}




