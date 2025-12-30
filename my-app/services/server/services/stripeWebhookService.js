import Stripe from 'stripe';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { getPlanById, getPlanByPriceId } from '../subscriptionPlans.js';
import { 
  sendOneTimePurchaseEmail, 
  sendSubscriptionWelcomeEmail, 
  sendSubscriptionCancellationEmail, 
  sendSubscriptionReinstatementEmail 
} from '../email.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

export async function handleCheckoutSessionCompleted(session) {
  console.log('Checkout session completed:', session.id, 'Mode:', session.mode);
  
  try {
    // Handle one-time payments
    if (session.mode === 'payment' && session.metadata?.type === 'one-time') {
      const userId = session.metadata.userId;
      const planId = session.metadata.planId;
      
      const user = await User.findById(userId);
      if (!user) {
        console.error('User not found for one-time payment:', userId);
        return;
      }
      
      const plan = getPlanById(planId);
      if (!plan) {
        console.error('Plan not found for one-time payment:', planId);
        return;
      }
      
      // Grant one-time scan credit to user
      if (!user.oneTimeScans) {
        user.oneTimeScans = 0;
      }
      user.oneTimeScans += 1;
      
      // Record the purchase
      if (!user.purchaseHistory) {
        user.purchaseHistory = [];
      }
      user.purchaseHistory.push({
        date: new Date(),
        planId: planId,
        planName: plan.name,
        amount: session.amount_total,
        sessionId: session.id,
        type: 'one-time'
      });
      
      await user.save();
      
      console.log(`✅ One-time scan credit granted to user ${user.email}`);
      
      // Send confirmation email
      await sendOneTimePurchaseEmail(user.email, plan.name);
      
      console.log(`📧 One-time purchase email sent to ${user.email}`);
    }
  } catch (error) {
    console.error('Failed to handle checkout session completed:', error);
  }
}

export async function handleSubscriptionCreated(subscription) {
  console.log('Subscription created:', subscription.id, 'Status:', subscription.status);
  
  try {
    // Only send welcome email if subscription is actually active/trialing
    // Don't send for incomplete, past_due, or unpaid subscriptions
    if (!['active', 'trialing'].includes(subscription.status)) {
      console.log(`⏳ Subscription ${subscription.id} is ${subscription.status}, not sending welcome email yet`);
      return;
    }

    // Get the user associated with this subscription
    const user = await User.findOne({ stripeCustomerId: subscription.customer });
    
    if (!user) {
      console.error('User not found for subscription:', subscription.id);
      return;
    }

    // Get plan information
    const priceId = subscription?.items?.data?.[0]?.price?.id;
    const plan = priceId ? getPlanByPriceId(priceId) : null;
    const planName = plan?.name || 'Unknown Plan';
    
    // Determine billing cycle
    const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval;
    const billingCycle = interval === 'year' ? 'yearly' : 'monthly';
    
    // Get current period end date
    const currentPeriodEnd = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000) 
      : null;

    // Send welcome email only for active/trialing subscriptions
    await sendSubscriptionWelcomeEmail(
      user.email,
      planName,
      billingCycle,
      currentPeriodEnd
    );
    
    console.log(`📧 Subscription welcome email sent to ${user.email} for ${planName} plan (${subscription.status})`);
  } catch (error) {
    console.error('Failed to send subscription welcome email:', error);
    // Don't fail the webhook if email fails
  }
}

export async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id);
  
  const localSubscription = await Subscription.findOne({ 
    stripeSubscriptionId: subscription.id 
  });
  
  if (localSubscription) {
    const priceId = subscription?.items?.data?.[0]?.price?.id;
    const plan = priceId ? getPlanByPriceId(priceId) : null;

    const startUnix = Number(subscription?.current_period_start);
    const endUnix = Number(subscription?.current_period_end);
    const periodStart = Number.isFinite(startUnix) ? new Date(startUnix * 1000) : undefined;
    const periodEnd = Number.isFinite(endUnix) ? new Date(endUnix * 1000) : undefined;

    // Check if this is a new billing period (usage should be reset)
    let shouldResetUsage = false;
    if (periodStart && localSubscription.currentPeriodStart) {
      // If the new period start is different from the current one, it's a new billing period
      shouldResetUsage = periodStart.getTime() !== localSubscription.currentPeriodStart.getTime();
    }

    // Check if subscription was reactivated (cancel_at_period_end changed from true to false)
    const wasReactivated = localSubscription.cancelAtPeriodEnd === true && subscription.cancel_at_period_end === false;

    const subUpdate = {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(plan && { planId: plan.id, limits: plan.limits })
    };
    if (periodStart) subUpdate.currentPeriodStart = periodStart;
    if (periodEnd) subUpdate.currentPeriodEnd = periodEnd;

    // Reset monthly usage if it's a new billing period
    if (shouldResetUsage) {
      subUpdate['usage.scansThisMonth'] = 0;
      console.log(`🔄 Resetting monthly usage for subscription ${subscription.id} - new billing period started`);
    }

    await Subscription.findByIdAndUpdate(localSubscription._id, subUpdate);

    // Update user subscription status
    const userUpdate = {
      'subscription.status': subscription.status,
      'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end
    };
    if (periodStart) userUpdate['subscription.currentPeriodStart'] = periodStart;
    if (periodEnd) userUpdate['subscription.currentPeriodEnd'] = periodEnd;
    if (shouldResetUsage) userUpdate['subscription.usage.scansThisMonth'] = 0;

    const updatedUser = await User.findOneAndUpdate(
      { stripeCustomerId: subscription.customer },
      userUpdate,
      { new: true }
    );

    // Send reinstatement email if subscription was reactivated
    if (wasReactivated && updatedUser) {
      try {
        const planName = plan?.name || 'Unknown Plan';
        await sendSubscriptionReinstatementEmail(updatedUser.email, planName);
        console.log(`📧 Subscription reinstatement email sent to ${updatedUser.email}`);
      } catch (emailErr) {
        console.error('Failed to send reinstatement email:', emailErr);
        // Don't fail the webhook if email fails
      }
    }

    // Send welcome email if subscription just became active from incomplete status
    const wasIncomplete = localSubscription.status && !['active', 'trialing'].includes(localSubscription.status);
    const isNowActive = ['active', 'trialing'].includes(subscription.status);
    
    if (wasIncomplete && isNowActive && updatedUser) {
      try {
        const planName = plan?.name || 'Unknown Plan';
        const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval;
        const billingCycle = interval === 'year' ? 'yearly' : 'monthly';
        const currentPeriodEnd = subscription.current_period_end 
          ? new Date(subscription.current_period_end * 1000) 
          : null;
        
        await sendSubscriptionWelcomeEmail(
          updatedUser.email,
          planName,
          billingCycle,
          currentPeriodEnd
        );
        console.log(`📧 Subscription welcome email sent to ${updatedUser.email} for ${planName} plan (subscription became active)`);
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr);
        // Don't fail the webhook if email fails
      }
    }

    // Send cancellation email if subscription is set to cancel at period end
    if (subscription.cancel_at_period_end && updatedUser) {
      try {
        const planName = plan?.name || 'Unknown Plan';
        const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
        await sendSubscriptionCancellationEmail(updatedUser.email, planName, subscription.cancel_at_period_end, currentPeriodEnd);
        console.log(`📧 Subscription cancellation email sent to ${updatedUser.email}`);
      } catch (emailErr) {
        console.error('Failed to send cancellation email:', emailErr);
        // Don't fail the webhook if email fails
      }
    }
  }
}

export async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription deleted:', subscription.id);

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    {
      status: 'canceled',
      canceledAt: new Date()
    }
  );

  // Update user subscription status
  const user = await User.findOneAndUpdate(
    { stripeCustomerId: subscription.customer },
    {
      'subscription.status': 'canceled'
    },
    { new: true }
  );

  // Get plan information for email
  let planName = 'Unknown Plan';
  try {
    const priceId = subscription?.items?.data?.[0]?.price?.id;
    if (priceId) {
      const plan = getPlanByPriceId(priceId);
      if (plan?.name) planName = plan.name;
    }
  } catch (e) {
    console.warn('Could not determine plan name for cancellation email:', e);
  }

  // Send cancellation email if user exists and has email
  if (user && user.email) {
    try {
      const cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
      const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
      await sendSubscriptionCancellationEmail(user.email, planName, cancelAtPeriodEnd, currentPeriodEnd);
      console.log(`📧 Subscription cancellation email sent to ${user.email} for ${planName}`);
    } catch (emailErr) {
      console.error('Failed to send cancellation email:', emailErr);
    }
  } else {
    console.warn('No user or user email found for subscription cancellation email.');
  }
}

export async function handlePaymentSucceeded(invoice) {
  console.log('Payment succeeded for invoice:', invoice.id);
  
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionUpdated(subscription);
  }
}

export async function handlePaymentFailed(invoice) {
  console.log('Payment failed for invoice:', invoice.id);
  
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionUpdated(subscription);
  }
}

