// Subscription plans configuration
export const SUBSCRIPTION_PLANS = {
  oneTime: {
    id: 'oneTime',
    name: 'One-Time',
    description: 'Perfect for getting started',
    price: 49700, // $497.00
    currency: 'usd',
    type: 'one-time',
    limits: {
      scansPerMonth: 1,
      maxUsers: 1,
      features: [
        '1 comprehensive audit',
        'Choose ONE device type',
        'All subpages scanned',
        'Detailed PDF report',
        'Visual annotations',
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
    description: 'Regular monitoring with savings',
    // Monthly pricing (in cents)
    monthlyPriceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID, // Set in .env
    yearlyPriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,   // Set in .env
    monthlyPrice: 29700, // $297.00
    yearlyPrice: 297000, // $2,970.00
    currency: 'usd',
    // Limits and features
    limits: {
      scansPerMonth: 5,
      maxUsers: 1,
      features: [
        '60 reports per year',
        'Select device per report',
        'All subpages scanned',
        '1 user account',
        'PDF reports',
        'Actionable recommendations',
        'Priority email support',
        '2 months free'
      ]
    },

    gradient: 'from-blue-500 to-green-500',
    popular: false
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Complete solution + huge savings',
    // Monthly pricing (in cents)
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID, // Set in .env
    yearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID,   // Set in .env
    monthlyPrice: 69700, // $697.00
    yearlyPrice: 697000, // $6,970.00
    currency: 'usd',
    // Limits and features
    limits: {
      scansPerMonth: 12,
      maxUsers: 3,
      features: [
        '144 reports per year',
        'All devices tested together',
        'All subpages scanned',
        '3 team users',
        'SilverSurfers Seal',
        'Priority support',
        'Historical tracking',
        'White-label reports',
        'Quarterly consultation',
        '2 months free'
      ]
    },
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
