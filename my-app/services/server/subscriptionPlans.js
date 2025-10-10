// Subscription plans configuration
export const SUBSCRIPTION_PLANS = {
  starter: {
    id: 'starter',
    name: 'SilverSurfers Starter',
    description: 'Perfect for small businesses starting their accessibility journey.',
    // Monthly pricing (in cents)
    monthlyPriceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID, // Set in .env
    yearlyPriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,   // Set in .env
    monthlyPrice: 2900, // $29.00
    yearlyPrice: 19700, // $197.00 (special offer)
    currency: 'usd',
    // Limits and features
    limits: {
      scansPerMonth: 10,
      maxUsers: 1,
      features: [
        'SilverSurfers Score',
        'Basic accessibility reports',
        'Email support',
        'PDF downloads'
      ]
    },
    // UI display
    icon: '🚀',
    gradient: 'from-blue-500 to-green-500',
    popular: false
  },
  pro: {
    id: 'pro',
    name: 'SilverSurfers Pro',
    description: 'Comprehensive accessibility solution for growing businesses.',
    // Monthly pricing (in cents)
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID, // Set in .env
    yearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID,   // Set in .env
    monthlyPrice: 9900, // $99.00
    yearlyPrice: 89900, // $899.00 (special offer)
    currency: 'usd',
    // Limits and features
    limits: {
      scansPerMonth: 50,
      maxUsers: 5,
      features: [
        'SilverSurfers Score',
        'Detailed accessibility reports',
        'SilverSurfers Seal of Approval',
        'Priority email support',
        'PDF downloads',
        'Multi-user access',
        'Advanced analytics'
      ]
    },
    // UI display
    icon: '⭐',
    gradient: 'from-green-500 to-teal-500',
    popular: true
  },
  custom: {
    id: 'custom',
    name: 'SilverSurfers Custom',
    description: 'Tailored solutions for enterprise-level accessibility needs.',
    // Custom pricing - handled separately
    monthlyPrice: null,
    yearlyPrice: null,
    currency: 'usd',
    // Limits and features
    limits: {
      scansPerMonth: -1, // Unlimited
      maxUsers: -1, // Unlimited
      features: [
        'SilverSurfers Score',
        'Unlimited scans',
        'SilverSurfers Seal of Approval',
        'Advanced analytics',
        'API access',
        'White labeling options',
        'Dedicated support',
        'Custom integrations'
      ]
    },
    // UI display
    icon: '🏆',
    gradient: 'from-purple-500 to-blue-500',
    popular: false,
    contactSales: true
  }
};

// Helper functions
export const getPlanById = (planId) => {
  return SUBSCRIPTION_PLANS[planId] || null;
};

export const getPlanByPriceId = (priceId) => {
  return Object.values(SUBSCRIPTION_PLANS).find(plan => 
    plan.monthlyPriceId === priceId || plan.yearlyPriceId === priceId
  );
};

export const getAvailablePlans = () => {
  return Object.values(SUBSCRIPTION_PLANS);
};

export const getPublicPlans = () => {
  return Object.values(SUBSCRIPTION_PLANS).map(plan => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    currency: plan.currency,
    limits: plan.limits,
    icon: plan.icon,
    gradient: plan.gradient,
    popular: plan.popular,
    contactSales: plan.contactSales
  }));
};
