// Pricing Configuration for EduChain
// This file allows easy adjustment of subscription plans and pricing

const PRICING_CONFIG = {
  // Base subscription plans
  plans: {
    basic: {
      name: 'Basic',
      price: 29.99,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        'Up to 100 certificates per month',
        'Basic verification',
        'Email support',
        'Standard templates',
        'Basic analytics',
      ],
      limits: {
        certificatesPerMonth: 100,
        storageGB: 1,
        apiCalls: 1000,
        customBranding: false,
        whiteLabel: false
      },
      yearlyDiscount: 0.20,
      yearlyPrice: 23.99
    },
    
    professional: {
      name: 'Professional',
      price: 99.99,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        'Up to 500 certificates per month',
        'Advanced verification',
        'Priority support',
        'Custom templates',
        'Analytics dashboard',
        'Bulk operations',
        'Custom branding'
      ],
      limits: {
        certificatesPerMonth: 500,
        storageGB: 10,
        apiCalls: 5000,
        customBranding: true,
        whiteLabel: false
      },
      yearlyDiscount: 0.20,
      yearlyPrice: 79.99
    },
    
    enterprise: {
      name: 'Enterprise',
      price: 299.99,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        'Unlimited certificates',
        'Premium verification',
        '24/7 support',
        'Custom branding',
        'Advanced analytics',
        'API access',
        'White-label solution',
        'Dedicated account manager'
      ],
      limits: {
        certificatesPerMonth: -1, // Unlimited
        storageGB: 100,
        apiCalls: 50000,
        customBranding: true,
        whiteLabel: true
      },
      yearlyDiscount: 0.25,
      yearlyPrice: 224.99
    }
  },

  // Regional pricing (optional)
  regionalPricing: {
    'US': {
      currency: 'USD',
      multiplier: 1.0
    },
    'EU': {
      currency: 'EUR',
      multiplier: 0.85
    },
    'UK': {
      currency: 'GBP',
      multiplier: 0.75
    },
    'IN': {
      currency: 'INR',
      multiplier: 75.0
    }
  },

  // Promotional pricing
  promotions: {
    'NEW_USER_50': {
      name: 'New User Discount',
      discount: 0.50, // 50% off
      duration: 30, // days
      applicablePlans: ['basic', 'professional']
    },
    'YEARLY_SAVE': {
      name: 'Yearly Savings',
      discount: 0.20, // 20% off
      duration: 365, // days
      applicablePlans: ['basic', 'professional', 'enterprise']
    }
  },

  // Usage-based pricing (optional)
  usagePricing: {
    overageCertificates: 0.50, // $0.50 per additional certificate
    overageStorage: 0.10, // $0.10 per GB
    overageApiCalls: 0.001 // $0.001 per API call
  },

  // Payment methods and fees
  paymentMethods: {
    stripe: {
      enabled: true,
      processingFee: 0.029, // 2.9%
      fixedFee: 0.30 // $0.30
    },
    paypal: {
      enabled: true,
      processingFee: 0.029,
      fixedFee: 0.30
    },
    crypto: {
      enabled: true,
      processingFee: 0.01, // 1%
      fixedFee: 0
    }
  }
};

// Helper functions for pricing calculations
const PricingCalculator = {
  // Calculate final price with discounts
  calculatePrice: (planId, billingCycle = 'monthly', region = 'US', promotionCode = null) => {
    const plan = PRICING_CONFIG.plans[planId];
    if (!plan) throw new Error('Invalid plan ID');

    let basePrice = plan.price;
    
    // Apply regional pricing
    const regionalConfig = PRICING_CONFIG.regionalPricing[region];
    if (regionalConfig) {
      basePrice *= regionalConfig.multiplier;
    }

    // Apply yearly discount
    if (billingCycle === 'yearly' && plan.yearlyDiscount) {
      basePrice *= (1 - plan.yearlyDiscount);
    }

    // Apply promotional discount
    if (promotionCode && PRICING_CONFIG.promotions[promotionCode]) {
      const promotion = PRICING_CONFIG.promotions[promotionCode];
      if (promotion.applicablePlans.includes(planId)) {
        basePrice *= (1 - promotion.discount);
      }
    }

    return Math.round(basePrice * 100) / 100; // Round to 2 decimal places
  },

  // Calculate usage overage charges
  calculateOverage: (planId, actualUsage) => {
    const plan = PRICING_CONFIG.plans[planId];
    const usagePricing = PRICING_CONFIG.usagePricing;
    
    let overageTotal = 0;

    // Certificate overage
    if (plan.limits.certificatesPerMonth !== -1 && 
        actualUsage.certificates > plan.limits.certificatesPerMonth) {
      const overage = actualUsage.certificates - plan.limits.certificatesPerMonth;
      overageTotal += overage * usagePricing.overageCertificates;
    }

    // Storage overage
    if (actualUsage.storage > plan.limits.storageGB) {
      const overage = actualUsage.storage - plan.limits.storageGB;
      overageTotal += overage * usagePricing.overageStorage;
    }

    // API calls overage
    if (actualUsage.apiCalls > plan.limits.apiCalls) {
      const overage = actualUsage.apiCalls - plan.limits.apiCalls;
      overageTotal += overage * usagePricing.overageApiCalls;
    }

    return Math.round(overageTotal * 100) / 100;
  },

  // Get all available plans with calculated prices
  getAllPlans: (region = 'US', billingCycle = 'monthly') => {
    const plans = {};
    
    Object.keys(PRICING_CONFIG.plans).forEach(planId => {
      plans[planId] = {
        ...PRICING_CONFIG.plans[planId],
        calculatedPrice: PricingCalculator.calculatePrice(planId, billingCycle, region)
      };
    });

    return plans;
  }
};

// Admin functions for pricing management
const PricingAdmin = {
  // Update plan pricing
  updatePlanPrice: (planId, newPrice) => {
    if (PRICING_CONFIG.plans[planId]) {
      PRICING_CONFIG.plans[planId].price = newPrice;
      return true;
    }
    return false;
  },

  // Add new plan
  addPlan: (planId, planConfig) => {
    if (!PRICING_CONFIG.plans[planId]) {
      PRICING_CONFIG.plans[planId] = planConfig;
      return true;
    }
    return false;
  },

  // Remove plan
  removePlan: (planId) => {
    if (PRICING_CONFIG.plans[planId]) {
      delete PRICING_CONFIG.plans[planId];
      return true;
    }
    return false;
  },

  // Add promotional code
  addPromotion: (code, promotionConfig) => {
    PRICING_CONFIG.promotions[code] = promotionConfig;
  },

  // Remove promotional code
  removePromotion: (code) => {
    delete PRICING_CONFIG.promotions[code];
  }
};

module.exports = {
  plans: PRICING_CONFIG.plans,
  calculator: PricingCalculator,
  admin: PricingAdmin,
  config: PRICING_CONFIG
};