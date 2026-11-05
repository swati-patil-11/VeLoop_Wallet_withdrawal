const { PayoutOption } = require('../src/models');
const { PAYOUT_METHODS, CURRENCIES, ACCOUNT_STATUS } = require('../src/config/constants');
const logger = require('../src/utils/logger');

const defaultPayoutOptions = [
  // --- UPI (Calibrated to authentic VELoop Rewards specs) ---
  {
    optionId: 'upi_10',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 10,
    payoutCurrency: 'INR',
    requiredAmount: 2400,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 1,
    metadata: { isStandard: true }
  },
  {
    optionId: 'upi_25',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 25,
    payoutCurrency: 'INR',
    requiredAmount: 5800,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 2,
    metadata: { isStandard: true }
  },
  {
    optionId: 'upi_50',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 50,
    payoutCurrency: 'INR',
    requiredAmount: 10000,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 3,
    metadata: { isStandard: true }
  },
  {
    optionId: 'upi_100',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 100,
    payoutCurrency: 'INR',
    requiredAmount: 19500,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 4,
    metadata: { isPopular: true }
  },
  {
    optionId: 'upi_150',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 150,
    payoutCurrency: 'INR',
    requiredAmount: 28500,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 5,
    metadata: { isStandard: true }
  },
  {
    optionId: 'upi_300',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 300,
    payoutCurrency: 'INR',
    requiredAmount: 52500,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 6,
    metadata: { isStandard: true }
  },
  {
    optionId: 'upi_500',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 500,
    payoutCurrency: 'INR',
    requiredAmount: 80500,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 7,
    metadata: { isStandard: true }
  },
  {
    optionId: 'upi_1000',
    methodId: PAYOUT_METHODS.UPI,
    methodName: 'UPI Transfer',
    type: 'instant',
    currency: CURRENCIES.VES,
    payoutValue: 1000,
    payoutCurrency: 'INR',
    requiredAmount: 150000,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['upiId'],
    sortOrder: 8,
    metadata: { isStandard: true }
  },

  // --- PayPal (PLACEHOLDER values - see ASSUMPTIONS.md) ---
  {
    optionId: 'paypal_500',
    methodId: PAYOUT_METHODS.PAYPAL,
    methodName: 'PayPal Cash',
    type: 'standard',
    currency: CURRENCIES.VES,
    payoutValue: 500,
    payoutCurrency: 'INR',
    requiredAmount: 85000,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['email'],
    sortOrder: 1,
    metadata: { placeholder: true, note: 'Must be replaced with live VELoop Payout values' }
  },
  {
    optionId: 'paypal_1000',
    methodId: PAYOUT_METHODS.PAYPAL,
    methodName: 'PayPal Cash',
    type: 'standard',
    currency: CURRENCIES.VES,
    payoutValue: 1000,
    payoutCurrency: 'INR',
    requiredAmount: 160000,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['email'],
    sortOrder: 2,
    metadata: { placeholder: true, note: 'Must be replaced with live VELoop Payout values' }
  },

  // --- Amazon Gift Card (PLACEHOLDER values - see ASSUMPTIONS.md) ---
  {
    optionId: 'amazon_50',
    methodId: PAYOUT_METHODS.AMAZON_GIFT_CARD,
    methodName: 'Amazon Gift Card',
    type: 'voucher',
    currency: CURRENCIES.VES,
    payoutValue: 50,
    payoutCurrency: 'INR',
    requiredAmount: 10000,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['email'],
    sortOrder: 1,
    metadata: { placeholder: true, note: 'Must be replaced with live VELoop Payout values' }
  },
  {
    optionId: 'amazon_100',
    methodId: PAYOUT_METHODS.AMAZON_GIFT_CARD,
    methodName: 'Amazon Gift Card',
    type: 'voucher',
    currency: CURRENCIES.VES,
    payoutValue: 100,
    payoutCurrency: 'INR',
    requiredAmount: 19500,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['email'],
    sortOrder: 2,
    metadata: { placeholder: true, note: 'Must be replaced with live VELoop Payout values' }
  },

  // --- Google Play Gift Card (PLACEHOLDER values - see ASSUMPTIONS.md) ---
  {
    optionId: 'gplay_50',
    methodId: PAYOUT_METHODS.GOOGLE_PLAY_GIFT_CARD,
    methodName: 'Google Play Gift Card',
    type: 'digital_code',
    currency: CURRENCIES.VES,
    payoutValue: 50,
    payoutCurrency: 'INR',
    requiredAmount: 10000,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['email'],
    sortOrder: 1,
    metadata: { placeholder: true, note: 'Must be replaced with live VELoop Payout values' }
  },
  {
    optionId: 'gplay_100',
    methodId: PAYOUT_METHODS.GOOGLE_PLAY_GIFT_CARD,
    methodName: 'Google Play Gift Card',
    type: 'digital_code',
    currency: CURRENCIES.VES,
    payoutValue: 100,
    payoutCurrency: 'INR',
    requiredAmount: 19500,
    active: true,
    eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
    requiredFields: ['email'],
    sortOrder: 2,
    metadata: { placeholder: true, note: 'Must be replaced with live VELoop Payout values' }
  }
];

async function seedPayoutOptions() {
  logger.info('Upserting payout options...');
  for (const opt of defaultPayoutOptions) {
    await PayoutOption.findOneAndUpdate({ optionId: opt.optionId }, { $set: opt }, { upsert: true, new: true });
  }
  logger.info(`Successfully seeded ${defaultPayoutOptions.length} payout options.`);
}

module.exports = { seedPayoutOptions, defaultPayoutOptions };
