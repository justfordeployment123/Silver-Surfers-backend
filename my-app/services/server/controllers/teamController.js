import crypto from 'crypto';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import AnalysisRecord from '../models/AnalysisRecord.js';
import { getPlanById } from '../subscriptionPlans.js';
import { 
  sendTeamInvitationEmail, 
  sendTeamMemberRemovedEmail, 
  sendTeamMemberLeftNotification, 
  sendTeamMemberLeftConfirmation, 
  sendNewTeamMemberNotification 
} from '../email.js';

export async function addTeamMember(req, res) {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const plan = getPlanById(subscription.planId);
    if (!plan || plan.limits.maxUsers <= 1) {
      return res.status(400).json({ error: 'Your current plan does not support team members.' });
    }

    const currentTeamSize = subscription.teamMembers.length;
    if (currentTeamSize >= plan.limits.maxUsers) {
      return res.status(400).json({ error: `Team limit reached (${plan.limits.maxUsers} members).` });
    }

    const existingMember = subscription.teamMembers.find(member => 
      member.email.toLowerCase() === email.toLowerCase()
    );
    if (existingMember) {
      return res.status(400).json({ error: 'This email is already in your team.' });
    }

    const owner = await User.findById(userId);
    if (owner.email.toLowerCase() === email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot add yourself to your own team.' });
    }

    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (targetUser) {
      const existingSubscription = await Subscription.findOne({
        user: targetUser._id,
        status: { $in: ['active', 'trialing'] }
      });
      
      if (existingSubscription) {
        const existingPlan = getPlanById(existingSubscription.planId);
        return res.status(400).json({ 
          error: `This person already has an active ${existingPlan?.name || 'subscription'} plan. They cannot join your team.` 
        });
      }

      const existingActiveMembership = await Subscription.findOne({
        'teamMembers.email': email.toLowerCase(),
        'teamMembers.status': 'active',
        user: { $ne: userId }
      });

      if (existingActiveMembership) {
        const existingTeamOwner = await User.findById(existingActiveMembership.user);
        const existingTeamPlan = getPlanById(existingActiveMembership.planId);
        return res.status(400).json({ 
          error: `This person is already an active member of ${existingTeamOwner?.email || 'another team'}'s ${existingTeamPlan?.name || 'team'}. They cannot join your team.` 
        });
      }

      const existingPendingInvitation = await Subscription.findOne({
        'teamMembers.email': email.toLowerCase(),
        'teamMembers.status': 'pending',
        user: userId
      });

      if (existingPendingInvitation) {
        return res.status(400).json({ 
          error: 'This person already has a pending invitation to your team.' 
        });
      }
    }

    const invitationToken = crypto.randomBytes(32).toString('hex');

    subscription.teamMembers.push({
      email: email.toLowerCase(),
      status: 'pending',
      addedAt: new Date()
    });

    await subscription.save();

    await User.findByIdAndUpdate(userId, {
      $push: {
        'subscription.teamMembers': {
          email: email.toLowerCase(),
          status: 'pending',
          invitedAt: new Date()
        }
      }
    });

    try {
      await sendTeamInvitationEmail(
        email,
        owner.email,
        owner.email,
        plan.name,
        invitationToken
      );
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
    }

    return res.json({ 
      message: 'Team member invited successfully.',
      invitationToken
    });

  } catch (err) {
    console.error('Add team member error:', err);
    return res.status(500).json({ error: 'Failed to add team member.' });
  }
}

export async function leaveTeam(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const subscription = await Subscription.findOne({ 
      'teamMembers.email': userEmail.toLowerCase(),
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No team membership found.' });
    }

    const memberIndex = subscription.teamMembers.findIndex(member => 
      member.email.toLowerCase() === userEmail.toLowerCase()
    );

    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Team membership not found.' });
    }

    const member = subscription.teamMembers[memberIndex];
    subscription.teamMembers.splice(memberIndex, 1);

    await User.findByIdAndUpdate(userId, {
      $unset: { 
        isTeamMember: '',
        teamOwner: ''
      }
    });

    await subscription.save();

    try {
      const owner = await User.findById(subscription.user);
      const plan = getPlanById(subscription.planId);
      const planName = plan?.name || 'Unknown Plan';
      
      if (owner && owner.email) {
        await sendTeamMemberLeftNotification(
          owner.email, 
          userEmail, 
          member.name || userEmail, 
          planName
        );
      }
      
      await sendTeamMemberLeftConfirmation(
        userEmail,
        owner?.email || 'Unknown',
        owner?.email || 'Unknown',
        planName
      );
    } catch (emailError) {
      console.error('Failed to send team member leave notifications:', emailError);
    }

    res.json({ message: 'Successfully left the team.' });
  } catch (error) {
    console.error('Team leave error:', error);
    res.status(500).json({ error: 'Failed to leave team.' });
  }
}

export async function removeTeamMember(req, res) {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const memberIndex = subscription.teamMembers.findIndex(member => 
      member.email.toLowerCase() === email.toLowerCase()
    );

    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    const member = subscription.teamMembers[memberIndex];
    subscription.teamMembers.splice(memberIndex, 1);
    await subscription.save();

    await User.findByIdAndUpdate(userId, {
      $pull: {
        'subscription.teamMembers': { email: email.toLowerCase() }
      }
    });

    if (member.status === 'active') {
      const memberUser = await User.findOne({ email: email.toLowerCase() });
      if (memberUser) {
        await User.findByIdAndUpdate(memberUser._id, {
          'subscription.isTeamMember': false,
          'subscription.teamOwner': null
        });
      }

      try {
        const owner = await User.findById(userId);
        const plan = getPlanById(subscription.planId);
        await sendTeamMemberRemovedEmail(
          email,
          owner.email,
          owner.email,
          plan.name
        );
      } catch (emailError) {
        console.error('Failed to send removal email:', emailError);
      }
    }

    return res.json({ message: 'Team member removed successfully.' });

  } catch (err) {
    console.error('Remove team member error:', err);
    return res.status(500).json({ error: 'Failed to remove team member.' });
  }
}

export async function getTeamMembers(req, res) {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const plan = getPlanById(subscription.planId);
    const availableSlots = plan ? plan.limits.maxUsers - subscription.teamMembers.length : 0;

    return res.json({
      teamMembers: subscription.teamMembers,
      planName: plan?.name || subscription.planId,
      maxUsers: plan?.limits.maxUsers || 1,
      availableSlots: Math.max(0, availableSlots)
    });

  } catch (err) {
    console.error('Get team members error:', err);
    return res.status(500).json({ error: 'Failed to get team members.' });
  }
}

export async function getTeamScans(req, res) {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const teamEmails = [
      req.user.email,
      ...subscription.teamMembers.map(member => member.email)
    ];

    const teamScans = await AnalysisRecord.find({
      email: { $in: teamEmails },
      createdAt: { $gte: subscription.currentPeriodStart }
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('user', 'email')
    .lean();

    const formattedScans = teamScans.map(scan => ({
      id: scan._id,
      url: scan.url,
      email: scan.email,
      status: scan.status,
      emailStatus: scan.emailStatus,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt,
      failureReason: scan.failureReason,
      attachmentCount: scan.attachmentCount,
      isOwner: scan.email === req.user.email
    }));

    res.json({ scans: formattedScans });
  } catch (error) {
    console.error('Get team scans error:', error);
    res.status(500).json({ error: 'Failed to get team scans.' });
  }
}

export async function getTeamInvite(req, res) {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Invitation token is required.' });
    }

    const subscription = await Subscription.findOne({
      'teamMembers.status': 'pending'
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Invalid or expired invitation.' });
    }

    const pendingMember = subscription.teamMembers.find(member => 
      member.status === 'pending'
    );

    if (!pendingMember) {
      return res.status(404).json({ error: 'Invalid or expired invitation.' });
    }

    const owner = await User.findById(subscription.user);
    if (!owner) {
      return res.status(404).json({ error: 'Team owner not found.' });
    }

    const plan = getPlanById(subscription.planId);

    return res.json({
      invitedEmail: pendingMember.email,
      teamOwnerEmail: owner.email,
      teamOwnerName: owner.email,
      planName: plan?.name || 'Unknown Plan',
      invitedAt: pendingMember.addedAt
    });

  } catch (err) {
    console.error('Get invitation details error:', err);
    return res.status(500).json({ error: 'Failed to get invitation details.' });
  }
}

export async function acceptTeamInvite(req, res) {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({ error: 'Invitation token is required.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const existingSubscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] }
    });
    
    if (existingSubscription) {
      const existingPlan = getPlanById(existingSubscription.planId);
      return res.status(400).json({ 
        error: `You already have an active ${existingPlan?.name || 'subscription'} plan. You cannot join a team while having your own subscription.` 
      });
    }

    const subscription = await Subscription.findOne({
      'teamMembers.email': user.email.toLowerCase(),
      'teamMembers.status': 'pending'
    });
    if (!subscription) {
      return res.status(404).json({ error: 'No pending invitation found for this user.' });
    }

    const memberIndex = subscription.teamMembers.findIndex(m => m.email.toLowerCase() === user.email.toLowerCase() && m.status === 'pending');
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Pending team member not found.' });
    }
    subscription.teamMembers[memberIndex].status = 'active';
    subscription.teamMembers[memberIndex].joinedAt = new Date();
    subscription.teamMembers[memberIndex].user = user._id;
    await subscription.save();

    user.subscription.isTeamMember = true;
    user.subscription.teamOwner = subscription.user;
    await user.save();

    try {
      const owner = await User.findById(subscription.user);
      const plan = getPlanById(subscription.planId);
      await sendNewTeamMemberNotification(
        owner.email,
        user.email,
        user.email,
        plan.name
      );
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    return res.json({ 
      message: 'Team invitation accepted successfully.',
      teamOwner: subscription.user,
      planId: subscription.planId
    });
  } catch (err) {
    console.error('Accept team invitation error:', err);
    return res.status(500).json({ error: 'Failed to accept team invitation.' });
  }
}

