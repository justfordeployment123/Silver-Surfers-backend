import Stripe from 'stripe';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { SUBSCRIPTION_PLANS, getPlanById } from '../subscriptionPlans.js';
import { sendOneTimePurchaseEmail, sendSubscriptionCancellationEmail } from '../email.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

export async function createCheckoutSession(req, res) {
  try {
    const { planId, billingCycle = 'monthly' } = req.body || {};
    const userId = req.user.id;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    if (plan.contactSales) {
      return res.status(400).json({ error: 'Please contact sales for custom pricing.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1
      });
      
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
        console.log(`🔄 Reusing existing Stripe customer: ${customerId} for email: ${user.email}`);
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: userId }
        });
        customerId = customer.id;
        console.log(`🆕 Created new Stripe customer: ${customerId} for email: ${user.email}`);
      }
      
      await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
    } else {
      console.log(`♻️ Using existing customer ID: ${customerId} for email: ${user.email}`);
    }

    const successUrlBase = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (plan.type === 'one-time') {
      if (user.oneTimeScans > 0) {
        return res.status(200).json({
          url: `${successUrlBase}/checkout`
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [{
          price_data: {
            currency: plan.currency || 'usd',
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        }],
        metadata: { 
          userId: userId,
          planId: planId,
          type: 'one-time'
        },
        success_url: `${successUrlBase}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${successUrlBase}/services?canceled=1`,
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      });

      return res.json({ url: session.url });
    } else {
      const priceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
      if (!priceId) {
        return res.status(400).json({ error: 'Price ID not configured for this plan.' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          metadata: { 
            userId: userId,
            planId: planId,
            billingCycle: billingCycle
          },
        },
        metadata: { userId: userId, planId: planId, billingCycle: billingCycle },
        success_url: `${successUrlBase}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${successUrlBase}/subscription?canceled=1`,
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      });

      return res.json({ url: session.url });
    }
  } catch (err) {
    console.error('Stripe session error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
}

export async function getSubscription(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate('subscription');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing', 'past_due'] } 
    }).sort({ createdAt: -1 });

    let isTeamMember = false;

    if (!subscription && user.subscription?.isTeamMember && user.subscription?.teamOwner) {
      subscription = await Subscription.findOne({ 
        user: user.subscription.teamOwner, 
        status: { $in: ['active', 'trialing'] } 
      });

      if (subscription) {
        const isActiveMember = subscription.teamMembers.some(member => 
          member.user && member.user.toString() === userId && member.status === 'active'
        );

        if (isActiveMember) {
          isTeamMember = true;
        } else {
          await User.findByIdAndUpdate(userId, {
            'subscription.isTeamMember': false,
            'subscription.teamOwner': null
          });
          subscription = null;
        }
      }
    }

    const plan = subscription?.planId ? getPlanById(subscription.planId) : null;

    return res.json({
      user: {
        id: user._id,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
        oneTimeScans: user.oneTimeScans || 0
      },
      subscription: subscription ? {
        id: subscription._id,
        status: subscription.status,
        planId: subscription.planId,
        plan: plan,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        usage: subscription.usage,
        limits: subscription.limits,
        isTeamMember: isTeamMember
      } : null,
      oneTimeScans: user.oneTimeScans || 0
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    return res.status(500).json({ error: 'Failed to get subscription.' });
  }
}

export async function createPortalSession(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer found. Please create a subscription first.' });
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription`,
      });

      return res.json({ url: session.url });
    } catch (portalError) {
      console.error('Stripe Customer Portal error:', portalError.message);
      
      if (portalError.type === 'StripeInvalidRequestError' && 
          portalError.message.includes('No configuration provided')) {
        return res.status(400).json({ 
          error: 'Customer Portal not configured. Please contact support or use the direct upgrade option.',
          details: 'Stripe Customer Portal needs to be configured in the Stripe dashboard.'
        });
      }
      
      throw portalError;
    }
  } catch (err) {
    console.error('Create portal session error:', err);
    return res.status(500).json({ error: 'Failed to create portal session.' });
  }
}

export async function upgradeSubscription(req, res) {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    const userId = req.user.id;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    const currentSubscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!currentSubscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const newPriceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!newPriceId) {
      return res.status(400).json({ error: 'Price ID not configured for this plan.' });
    }

    const user = await User.findById(userId);
    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({ error: 'User or Stripe customer not found.' });
    }

    const successUrlBase = process.env.FRONTEND_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: user.stripeCustomerId,
      line_items: [{ price: newPriceId, quantity: 1 }],
      subscription_data: {
        metadata: { 
          userId: userId,
          planId: planId,
          billingCycle: billingCycle,
          isUpgrade: 'true',
          oldSubscriptionId: currentSubscription.stripeSubscriptionId
        },
      },
      metadata: { 
        userId: userId, 
        planId: planId, 
        billingCycle: billingCycle,
        isUpgrade: 'true',
        oldSubscriptionId: currentSubscription.stripeSubscriptionId
      },
      success_url: `${successUrlBase}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successUrlBase}/subscription?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    console.log(`User ${userId} initiated upgrade to plan ${planId} with checkout session`);

    return res.json({ 
      message: 'Checkout session created for upgrade.',
      url: session.url
    });
  } catch (err) {
    console.error('Subscription upgrade error:', err);
    return res.status(500).json({ error: 'Failed to create upgrade checkout session.' });
  }
}

export async function cancelSubscription(req, res) {
  try {
    const { cancelAtPeriodEnd = true } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    const subscription = await Subscription.findOne({ 
      user: userId, 
      status: { $in: ['active', 'trialing'] } 
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const plan = getPlanById(subscription.planId);
    const planName = plan?.name || 'Unknown Plan';

    if (cancelAtPeriodEnd) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
      
      await Subscription.findByIdAndUpdate(subscription._id, {
        cancelAtPeriodEnd: true
      });

      try {
        const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
        await sendSubscriptionCancellationEmail(
          userEmail, 
          planName, 
          true, 
          currentPeriodEnd
        );
        console.log(`📧 Subscription cancellation email sent to ${userEmail}`);
      } catch (emailErr) {
        console.error('Failed to send cancellation email:', emailErr);
      }

      return res.json({ message: 'Subscription will be canceled at the end of the current period.' });
    } else {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      
      await Subscription.findByIdAndUpdate(subscription._id, {
        status: 'canceled',
        canceledAt: new Date()
      });

      try {
        await sendSubscriptionCancellationEmail(
          userEmail, 
          planName, 
          false
        );
        console.log(`📧 Immediate subscription cancellation email sent to ${userEmail}`);
      } catch (emailErr) {
        console.error('Failed to send immediate cancellation email:', emailErr);
      }

      return res.json({ message: 'Subscription canceled immediately.' });
    }
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
}

export async function getPlans(req, res) {
  try {
    const plans = Object.values(SUBSCRIPTION_PLANS).map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      currency: plan.currency,
      type: plan.type,
      isOneTime: plan.isOneTime,
      limits: plan.limits,
      icon: plan.icon,
      gradient: plan.gradient,
      popular: plan.popular,
      contactSales: plan.contactSales
    }));

    return res.json({ plans });
  } catch (err) {
    console.error('Get plans error:', err);
    return res.status(500).json({ error: 'Failed to get plans.' });
  }
}

export async function paymentSuccess(req, res) {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    const session = await stripe.checkout.sessions.retrieve(String(session_id));
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed yet.' });
    }

    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    
    if (!userId || userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access to this payment.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const alreadyProcessed = user.purchaseHistory?.some(
      purchase => purchase.sessionId === session.id
    );

    if (!alreadyProcessed && session.metadata?.type === 'one-time') {
      console.log(`💳 Manually processing one-time payment for session: ${session.id}`);
      
      const plan = getPlanById(planId);
      
      if (!user.oneTimeScans) {
        user.oneTimeScans = 0;
      }
      user.oneTimeScans += 1;
      
      if (!user.purchaseHistory) {
        user.purchaseHistory = [];
      }
      user.purchaseHistory.push({
        date: new Date(),
        planId: planId,
        planName: plan?.name || 'One-Time Report',
        amount: session.amount_total,
        sessionId: session.id,
        type: 'one-time'
      });
      
      await user.save();
      
      console.log(`✅ One-time scan credit granted to user ${user.email} (manual processing)`);
      
      try {
        await sendOneTimePurchaseEmail(user.email, plan?.name || 'One-Time Report');
        console.log(`📧 One-time purchase email sent to ${user.email}`);
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    }

    return res.json({ 
      message: 'Payment successful! Your one-time scan credit has been added.',
      oneTimeScans: user.oneTimeScans || 0,
      purchaseDetails: {
        planId: session.metadata?.planId,
        amount: session.amount_total,
        date: new Date(session.created * 1000)
      }
    });
  } catch (err) {
    console.error('Payment success error:', err);
    return res.status(500).json({ error: 'Failed to confirm payment.' });
  }
}

export async function subscriptionSuccess(req, res) {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    const session = await stripe.checkout.sessions.retrieve(String(session_id));
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed yet.' });
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    const isUpgrade = session.metadata?.isUpgrade === 'true';
    const oldSubscriptionId = session.metadata?.oldSubscriptionId;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'Missing metadata.' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    if (isUpgrade && oldSubscriptionId) {
      try {
        console.log(`🔄 Canceling old subscription ${oldSubscriptionId} for upgrade`);
        await stripe.subscriptions.cancel(oldSubscriptionId);
        await Subscription.deleteOne({ stripeSubscriptionId: oldSubscriptionId });
        console.log(`✅ Old subscription canceled successfully`);
      } catch (cancelError) {
        console.error('Failed to cancel old subscription:', cancelError);
      }
    }

    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        user: userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        status: subscription.status,
        planId: planId,
        priceId: subscription.items.data[0].price.id,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        limits: plan.limits,
        usage: {
          scansThisMonth: 0,
          lastResetDate: new Date(),
          totalScans: 0
        }
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(userId, {
      'subscription.status': subscription.status,
      'subscription.planId': planId,
      'subscription.priceId': subscription.items.data[0].price.id,
      'subscription.currentPeriodStart': new Date(subscription.current_period_start * 1000),
      'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000)
    });

    return res.json({ message: 'Subscription activated successfully.' });
  } catch (err) {
    console.error('Subscription success error:', err);
    return res.status(500).json({ error: 'Failed to activate subscription.' });
  }
}



