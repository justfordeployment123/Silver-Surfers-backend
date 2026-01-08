/**
 * Subscription Controller
 */

import Stripe from 'stripe';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { SUBSCRIPTION_PLANS, getPlanById } from '../subscriptionPlans.js';
import { sendOneTimePurchaseEmail } from '../email.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    res.status(500).json({ error: 'Failed to get subscription.' });
  }
}

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
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: userId }
        });
        customerId = customer.id;
      }
      
      await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
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

export async function createPortalSession(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({ error: 'No Stripe customer found.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${frontendUrl}/subscription`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal session error:', err);
    res.status(500).json({ error: 'Failed to create portal session.' });
  }
}

export async function upgradeSubscription(req, res) {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    const userId = req.user.id;

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    const subscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    const priceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!priceId) {
      return res.status(400).json({ error: 'Price ID not configured for this plan.' });
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: subscription.stripeSubscriptionItemId,
        price: priceId,
      }],
      metadata: {
        userId: userId,
        planId: planId,
        billingCycle: billingCycle
      },
    });

    subscription.planId = planId;
    subscription.limits = plan.limits;
    await subscription.save();

    res.json({ message: 'Subscription upgraded successfully.', subscription });
  } catch (err) {
    console.error('Upgrade subscription error:', err);
    res.status(500).json({ error: 'Failed to upgrade subscription.' });
  }
}

export async function cancelSubscription(req, res) {
  try {
    const { cancelAtPeriodEnd = true } = req.body;
    const userId = req.user.id;

    const subscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    subscription.cancelAtPeriodEnd = cancelAtPeriodEnd;
    await subscription.save();

    res.json({ 
      message: cancelAtPeriodEnd 
        ? 'Subscription will be cancelled at the end of the billing period.' 
        : 'Subscription cancellation cancelled.',
      subscription 
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
}

export async function getPlans(req, res) {
  try {
    const plans = Object.values(SUBSCRIPTION_PLANS).map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      monthlyPriceId: plan.monthlyPriceId,
      yearlyPriceId: plan.yearlyPriceId,
      limits: plan.limits,
      features: plan.features,
      type: plan.type
    }));

    res.json({ plans });
  } catch (err) {
    console.error('Get plans error:', err);
    res.status(500).json({ error: 'Failed to get plans.' });
  }
}

export async function paymentSuccess(req, res) {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.metadata?.type === 'one-time') {
      const userId = session.metadata.userId;
      const user = await User.findById(userId);
      
      if (user) {
        // Check if already processed
        const alreadyProcessed = session.metadata.processed === 'true';
        
        if (!alreadyProcessed) {
          // Grant one-time scan credit
          await User.findByIdAndUpdate(userId, {
            $inc: { oneTimeScans: 1 }
          });

          // Mark as processed
          await stripe.checkout.sessions.update(session_id, {
            metadata: { ...session.metadata, processed: 'true' }
          });

          // Send confirmation email
          try {
            await sendOneTimePurchaseEmail({
              to: user.email,
              firstName: user.firstName || '',
              lastName: user.lastName || ''
            });
          } catch (emailErr) {
            console.error('Failed to send one-time purchase email:', emailErr);
          }
        }
      }
    }

    res.json({ success: true, session });
  } catch (err) {
    console.error('Payment success error:', err);
    res.status(500).json({ error: 'Failed to process payment success.' });
  }
}

export async function subscriptionSuccess(req, res) {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({ success: true, session });
  } catch (err) {
    console.error('Subscription success error:', err);
    res.status(500).json({ error: 'Failed to process subscription success.' });
  }
}


