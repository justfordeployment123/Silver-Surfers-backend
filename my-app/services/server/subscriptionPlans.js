// Subscription plans configuration
export const SUBSCRIPTION_PLANS = {
  oneTime: {
    id: 'oneTime',
    name: 'One-Time',
    description: 'Perfect for getting started',
    price: 39700, // $397.00
    currency: 'usd',
    type: 'one-time',
    isOneTime: true,
    limits: {
      scansPerMonth: 1,
      maxUsers: 1,
      features: [
        'All devices tested',
        'up to 25 subpages scanned',
        'Detailed PDF report',
        'Actionable recommendations',
        '17-category analysis',
        'Email support'
      ]
    },
    gradient: 'from-blue-500 to-indigo-500',
    popular: false,
    buttonText: 'Get Report'
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: '',
    // Yearly pricing only (in cents)
    yearlyPriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,   // Set in .env
    yearlyPrice: 199700, // $1,997.00
    currency: 'usd',
    // Limits and features (yearly limits)
    limits: {
      scansPerMonth: 60, // 60 scans per year
      maxUsers: 1,
      features: [
        '60 reports per year',
        'Select device per report',
        'up to 25 subpages scanned',
        '1 user account',
        'PDF reports',
        'Actionable recommendations',
        'Priority email support'
      ]
    },

    gradient: 'from-blue-500 to-green-500',
    popular: false
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: '',
    // Yearly pricing only (in cents)
    yearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID,   // Set in .env
    yearlyPrice: 299700, // $2,997.00
    currency: 'usd',
    // Limits and features (yearly limits)
    limits: {
      scansPerMonth: 144, // 144 scans per year
      maxUsers: 3,
      features: [
        '144 reports per year',
        'All devices tested together',
        'up to 25 subpages scanned',
        '3 team users',
        'SilverSurfers Seal',
        'Priority support',
        'Historical tracking',
        'White-label reports',
        'Quarterly consultation'
      ]
    },
    gradient: 'from-green-500 to-teal-500',
    popular: true
  },
  custom: {
    id: 'custom',
    name: 'Custom',
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
        'Unlimited team users',
        'Advanced analytics',
        'API access',
        'White labeling options',
        'Dedicated support',
        'Custom integrations'
      ]
    },
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
    plan.yearlyPriceId === priceId
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
    price: plan.price,
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
};
