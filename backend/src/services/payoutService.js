const { PayoutOption, AuditLog, User } = require('../models');
const walletService = require('./walletService');
const {
  InvalidPayoutOptionError,
  InactivePayoutMethodError,
  NotFoundError,
  ValidationError
} = require('../utils/errors');
const { AUDIT_ACTIONS, PAYOUT_METHODS } = require('../config/constants');
const logger = require('../utils/logger');

// Method configuration metadata
const METHOD_DETAILS = {
  [PAYOUT_METHODS.UPI]: {
    name: 'UPI Transfer',
    description: 'Instant transfer directly to your UPI ID (VPA)',
    requiredFields: ['upiId'],
    fieldLabels: { upiId: 'UPI ID (e.g. name@bank)' }
  },
  [PAYOUT_METHODS.PAYPAL]: {
    name: 'PayPal Cash',
    description: 'Redeem funds sent directly to your PayPal account email',
    requiredFields: ['email'],
    fieldLabels: { email: 'PayPal Email Address' }
  },
  [PAYOUT_METHODS.AMAZON_GIFT_CARD]: {
    name: 'Amazon Gift Card',
    description: 'Digital Amazon India gift voucher sent to your email',
    requiredFields: ['email'],
    fieldLabels: { email: 'Delivery Email Address' }
  },
  [PAYOUT_METHODS.GOOGLE_PLAY_GIFT_CARD]: {
    name: 'Google Play Gift Card',
    description: 'Google Play digital code delivered to your email',
    requiredFields: ['email'],
    fieldLabels: { email: 'Delivery Email Address' }
  }
};

/**
 * Get all available active payout methods
 */
async function getMethods() {
  const activeOptions = await PayoutOption.find({ active: true }).distinct('methodId');

  return Object.values(PAYOUT_METHODS)
    .filter((methodId) => activeOptions.includes(methodId))
    .map((methodId) => ({
      methodId,
      name: METHOD_DETAILS[methodId]?.name || methodId,
      description: METHOD_DETAILS[methodId]?.description || '',
      requiredFields: METHOD_DETAILS[methodId]?.requiredFields || ['email'],
      fieldLabels: METHOD_DETAILS[methodId]?.fieldLabels || {}
    }));
}

/**
 * Get options for a specific method with computed per-user eligibility
 * @param {string} methodId
 * @param {string} userId
 */
async function getOptionsByMethod(methodId, userId) {
  const options = await PayoutOption.find({ methodId, active: true })
    .sort({ sortOrder: 1, payoutValue: 1 })
    .lean();

  if (options.length === 0) {
    throw new InactivePayoutMethodError(
      `This payout method is currently unavailable or has no active denominations.`
    );
  }

  const [wallet, user] = await Promise.all([
    walletService.getWallet(userId),
    User.findOne({ userId })
  ]);

  const userVes = wallet ? wallet.ves : 0;
  const userAgeDays = user
    ? (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const enrichedOptions = options.map((opt) => {
    let eligible = true;
    let reason = null;

    if (userVes < opt.requiredAmount) {
      eligible = false;
      reason = 'Insufficient VEs balance.';
    } else if (
      opt.eligibility?.requiredAccountStatus &&
      user.accountStatus !== opt.eligibility.requiredAccountStatus
    ) {
      eligible = false;
      reason = 'Account status not eligible.';
    } else if (
      opt.eligibility?.minAccountAgeDays &&
      userAgeDays < opt.eligibility.minAccountAgeDays
    ) {
      eligible = false;
      reason = `Account must be at least ${opt.eligibility.minAccountAgeDays} days old.`;
    }

    return {
      optionId: opt.optionId,
      methodId: opt.methodId,
      methodName: opt.methodName,
      payoutValue: opt.payoutValue,
      payoutCurrency: opt.payoutCurrency,
      requiredAmount: opt.requiredAmount,
      requiredFields: opt.requiredFields,
      eligible,
      reason
    };
  });

  return {
    methodId,
    userVes,
    options: enrichedOptions
  };
}

/**
 * Find a specific active payout option by optionId and methodId
 */
async function getOptionById(optionId, methodId) {
  const option = await PayoutOption.findOne({ optionId, methodId });
  if (!option || !option.active) {
    throw new InvalidPayoutOptionError('Selected payout option is unavailable.');
  }
  return option;
}

/**
 * Update payout option configuration (Admin)
 */
async function updatePayoutOption(optionId, updateData, adminUserId, ip = 'unknown', userAgent = 'unknown') {
  const existing = await PayoutOption.findOne({ optionId });
  if (!existing) {
    throw new NotFoundError(`Payout option ${optionId} not found.`);
  }

  const beforeSnapshot = existing.toObject();

  Object.assign(existing, updateData);
  await existing.save();

  // Audit log with before / after diff
  await AuditLog.create({
    actorId: adminUserId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTIONS.PAYOUT_CONFIG_CHANGED,
    targetUserId: adminUserId,
    targetType: 'PAYOUT_OPTION',
    referenceId: optionId,
    metadata: {
      before: beforeSnapshot,
      after: existing.toObject(),
      changes: updateData
    },
    ip,
    userAgent
  });

  logger.info({ optionId, adminUserId }, 'Payout option updated by admin');
  return existing;
}

/**
 * Get all payout options grouped by method (Page 11 of specification)
 */
async function getAllOptionsGrouped(userId) {
  const methods = await getMethods();
  const grouped = [];
  for (const m of methods) {
    const methodData = await getOptionsByMethod(m.methodId, userId);
    grouped.push({
      method: m.methodId,
      name: m.name,
      description: m.description,
      requiredFields: m.requiredFields,
      options: methodData.options
    });
  }
  return grouped;
}

module.exports = {
  getMethods,
  getOptionsByMethod,
  getAllOptionsGrouped,
  getOptionById,
  updatePayoutOption,
  METHOD_DETAILS
};

