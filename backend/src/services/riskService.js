const { Withdrawal, AuditLog } = require('../models');
const { ACCOUNT_STATUS, AUDIT_ACTIONS, WITHDRAWAL_STATUS } = require('../config/constants');
const {
  ForbiddenError,
  SuspiciousActivityError,
  ValidationError
} = require('../utils/errors');
const logger = require('../utils/logger');

const MAX_ATTEMPTS_PER_HOUR =
  parseInt(process.env.MAX_WITHDRAWAL_ATTEMPTS_PER_HOUR, 10) || 5;
const DAILY_WITHDRAWAL_CAP_VES =
  parseInt(process.env.DAILY_WITHDRAWAL_CAP_VES, 10) || 200000;

/**
 * Perform comprehensive risk and eligibility checks on a user and withdrawal request
 * @param {object} params
 * @param {object} params.user - User document
 * @param {object} params.option - PayoutOption document
 * @param {string} [params.ip] - Request IP
 * @param {string} [params.userAgent] - Request user agent
 */
async function performRiskChecks({ user, option, ip = 'unknown', userAgent = 'unknown' }) {
  const userId = user.userId;

  // 1. Account status checks
  if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended. Please contact support.');
  }

  if (user.accountStatus === ACCOUNT_STATUS.FLAGGED) {
    await AuditLog.create({
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.SUSPICIOUS_ACTIVITY,
      targetUserId: userId,
      targetType: 'USER',
      referenceId: option.optionId,
      metadata: { reason: 'FLAGGED_ACCOUNT_WITHDRAWAL_ATTEMPT' },
      ip,
      userAgent
    });
    throw new SuspiciousActivityError('This request requires additional verification.');
  }

  // 2. Eligibility checks from PayoutOption
  if (option.eligibility) {
    // Required account status check
    if (
      option.eligibility.requiredAccountStatus &&
      user.accountStatus !== option.eligibility.requiredAccountStatus
    ) {
      throw new ValidationError(
        `Account status (${user.accountStatus}) does not meet the requirement for this reward.`
      );
    }

    // Min account age check
    if (option.eligibility.minAccountAgeDays > 0) {
      const userAgeDays =
        (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (userAgeDays < option.eligibility.minAccountAgeDays) {
        throw new ValidationError(
          `Account must be at least ${option.eligibility.minAccountAgeDays} days old to redeem this option.`
        );
      }
    }
  }

  // 3. Velocity check: withdrawals created in the last 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentAttemptsCount = await Withdrawal.countDocuments({
    userId,
    requestedAt: { $gte: oneHourAgo }
  });

  if (recentAttemptsCount >= MAX_ATTEMPTS_PER_HOUR) {
    logger.warn(
      { userId, recentAttemptsCount, limit: MAX_ATTEMPTS_PER_HOUR },
      'Withdrawal velocity limit triggered'
    );

    await AuditLog.create({
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.SUSPICIOUS_ACTIVITY,
      targetUserId: userId,
      targetType: 'WITHDRAWAL',
      referenceId: option.optionId,
      metadata: {
        reason: 'VELOCITY_LIMIT_EXCEEDED',
        recentAttemptsCount,
        maxAllowedPerHour: MAX_ATTEMPTS_PER_HOUR
      },
      ip,
      userAgent
    });

    throw new SuspiciousActivityError('This request requires additional verification.');
  }

  // 4. Per-user daily withdrawal cap check
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todaysWithdrawals = await Withdrawal.find({
    userId,
    requestedAt: { $gte: startOfDay },
    status: { $nin: [WITHDRAWAL_STATUS.REJECTED, WITHDRAWAL_STATUS.CANCELLED] }
  });

  const dailyTotalVES = todaysWithdrawals.reduce(
    (acc, curr) => acc + (curr.currencyAmount || 0),
    0
  );

  if (dailyTotalVES + option.requiredAmount > DAILY_WITHDRAWAL_CAP_VES) {
    throw new ValidationError(
      `Daily withdrawal limit of ${DAILY_WITHDRAWAL_CAP_VES.toLocaleString()} VEs exceeded. You have already requested ${dailyTotalVES.toLocaleString()} VEs today.`
    );
  }

  return true;
}

module.exports = {
  performRiskChecks,
  MAX_ATTEMPTS_PER_HOUR,
  DAILY_WITHDRAWAL_CAP_VES
};
