const { v4: uuidv4 } = require('uuid');
const { Withdrawal, AuditLog, User } = require('../models');
const payoutService = require('./payoutService');
const walletService = require('./walletService');
const { performRiskChecks } = require('./riskService');
const { withTransaction } = require('../utils/transactionHelper');
const {
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  InvalidPayoutOptionError,
  DuplicateWithdrawalError
} = require('../utils/errors');
const {
  WITHDRAWAL_STATUS,
  AUDIT_ACTIONS,
  CURRENCIES,
  CREDIT_SOURCES,
  DEBIT_SOURCES,
  PAYOUT_METHODS
} = require('../config/constants');
const logger = require('../utils/logger');

// Minimum INR payout threshold
const MIN_WITHDRAWAL_INR = 10;

/**
 * Mask sensitive details for storage & display
 */
function maskPayoutDetails(method, details) {
  if (!details || typeof details !== 'object') return {};
  const masked = { ...details };

  if (method === PAYOUT_METHODS.UPI && typeof masked.upiId === 'string') {
    const parts = masked.upiId.split('@');
    if (parts.length === 2 && parts[0].length > 3) {
      masked.upiId = `${parts[0].slice(0, 2)}***${parts[0].slice(-1)}@${parts[1]}`;
    }
  } else if (typeof masked.email === 'string') {
    const parts = masked.email.split('@');
    if (parts.length === 2 && parts[0].length > 2) {
      masked.email = `${parts[0].slice(0, 2)}***@${parts[1]}`;
    }
  }

  return masked;
}

/**
 * Validate method-specific payout details
 */
function validatePayoutDetails(method, details) {
  if (!details || typeof details !== 'object') {
    throw new ValidationError('Payout details are required.');
  }

  if (method === PAYOUT_METHODS.UPI) {
    if (!details.upiId || typeof details.upiId !== 'string') {
      throw new ValidationError('UPI ID is required.');
    }
    const upiRegex = /^[\w.-]+@[\w.-]+$/;
    if (!upiRegex.test(details.upiId.trim())) {
      throw new ValidationError('Invalid UPI ID format. Expected format: name@bank.');
    }
  } else if (method === PAYOUT_METHODS.PAYPAL) {
    if (!details.email || typeof details.email !== 'string') {
      throw new ValidationError('PayPal account email is required.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(details.email.trim())) {
      throw new ValidationError('Invalid PayPal email address.');
    }
  } else if (
    method === PAYOUT_METHODS.AMAZON_GIFT_CARD ||
    method === PAYOUT_METHODS.GOOGLE_PLAY_GIFT_CARD
  ) {
    if (!details.email || typeof details.email !== 'string') {
      throw new ValidationError('Delivery email address is required for gift cards.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(details.email.trim())) {
      throw new ValidationError('Invalid delivery email address.');
    }
  }
}

/**
 * Create a withdrawal request inside a MongoDB transaction
 * Server owns all amounts and balances; client passes only identifiers
 */
async function createWithdrawal({
  userId,
  method,
  optionId,
  payoutDetails,
  idempotencyKey,
  ip = 'unknown',
  userAgent = 'unknown'
}) {
  // 1. Idempotency Check: if identical (userId, idempotencyKey) exists, return original snapshot
  const existingWithdrawal = await Withdrawal.findOne({ userId, idempotencyKey });
  if (existingWithdrawal) {
    logger.info({ userId, idempotencyKey }, 'Idempotent withdrawal hit, returning original');
    const wallet = await walletService.getWallet(userId);
    return {
      duplicate: true,
      withdrawal: existingWithdrawal,
      wallet: {
        ves: wallet.ves,
        sves: wallet.sves,
        gems: wallet.gems,
        tokens: wallet.tokens,
        spins: wallet.spins
      }
    };
  }

  // 2. Load PayoutOption from database by optionId AND methodId
  const option = await payoutService.getOptionById(optionId, method);

  // 3. Validate payout details
  validatePayoutDetails(method, payoutDetails);

  // 4. Load User & execute risk and eligibility checks
  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User not found.');
  }

  await performRiskChecks({ user, option, ip, userAgent });

  // 5. Enforce minimum withdrawal INR threshold
  if (option.payoutValue < MIN_WITHDRAWAL_INR) {
    throw new ValidationError(`Minimum withdrawal is INR ${MIN_WITHDRAWAL_INR}.`);
  }

  const withdrawalId = uuidv4();
  const maskedDetails = maskPayoutDetails(method, payoutDetails);

  // 6. Execute atomic deduction and withdrawal creation inside one transaction
  let result;
  try {
    result = await withTransaction(async (session) => {
      // Atomic conditional debit on user's VES balance
      const debitResult = await walletService.debitWallet({
        userId,
        currency: CURRENCIES.VES,
        amount: option.requiredAmount,
        source: DEBIT_SOURCES.WITHDRAWAL,
        referenceId: withdrawalId,
        description: `Redemption for ${option.methodName} (INR ${option.payoutValue})`,
        metadata: {
          method,
          optionId,
          payoutAmount: option.payoutValue,
          payoutCurrency: option.payoutCurrency
        },
        session
      });

      // Create immutable withdrawal record with status PENDING
      const [withdrawal] = await Withdrawal.create(
        [
          {
            withdrawalId,
            userId,
            method,
            optionId,
            currency: CURRENCIES.VES,
            currencyAmount: option.requiredAmount,
            payoutAmount: option.payoutValue,
            payoutDetails: maskedDetails,
            status: WITHDRAWAL_STATUS.PENDING,
            transactionId: debitResult.transaction.transactionId,
            idempotencyKey,
            requestedAt: new Date(),
            statusHistory: [
              {
                status: WITHDRAWAL_STATUS.PENDING,
                at: new Date(),
                by: userId,
                note: 'Withdrawal requested'
              }
            ]
          }
        ],
        { session }
      );

      // Create Audit Log
      await AuditLog.create(
        [
          {
            actorId: userId,
            actorRole: user.role,
            action: AUDIT_ACTIONS.WITHDRAWAL_CREATED,
            targetUserId: userId,
            targetType: 'WITHDRAWAL',
            referenceId: withdrawalId,
            metadata: {
              method,
              optionId,
              currencyAmount: option.requiredAmount,
              payoutAmount: option.payoutValue,
              transactionId: debitResult.transaction.transactionId
            },
            ip,
            userAgent
          }
        ],
        { session }
      );

      return {
        withdrawal,
        wallet: debitResult.wallet
      };
    });
  } catch (err) {
    // If a concurrent thread committed with this idempotency key in the interim,
    // handle the duplicate gracefully by returning the winning thread's record
    if (err.code === 11000) {
      const concurrentWithdrawal = await Withdrawal.findOne({ userId, idempotencyKey });
      if (concurrentWithdrawal) {
        logger.info({ userId, idempotencyKey }, 'Concurrent idempotency race caught, returning winning record');
        const wallet = await walletService.getWallet(userId);
        return {
          duplicate: true,
          withdrawal: concurrentWithdrawal,
          wallet: {
            ves: wallet.ves,
            sves: wallet.sves,
            gems: wallet.gems,
            tokens: wallet.tokens,
            spins: wallet.spins
          }
        };
      }
    }
    throw err;
  }

  logger.info({ withdrawalId, userId, optionId }, 'Withdrawal created successfully');

  return {
    duplicate: false,
    withdrawal: result.withdrawal,
    wallet: {
      ves: result.wallet.ves,
      sves: result.wallet.sves,
      gems: result.wallet.gems,
      tokens: result.wallet.tokens,
      spins: result.wallet.spins
    }
  };
}

/**
 * Get paginated withdrawals for authenticated user
 */
async function getUserWithdrawals(userId, { page = 1, limit = 20, status } = {}) {
  const sanitizedPage = Math.max(1, parseInt(page, 10) || 1);
  const sanitizedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (sanitizedPage - 1) * sanitizedLimit;

  const query = { userId };
  if (status) {
    query.status = status;
  }

  const [withdrawals, total] = await Promise.all([
    Withdrawal.find(query).sort({ requestedAt: -1 }).skip(skip).limit(sanitizedLimit).lean(),
    Withdrawal.countDocuments(query)
  ]);

  return {
    withdrawals,
    pagination: {
      total,
      page: sanitizedPage,
      limit: sanitizedLimit,
      totalPages: Math.ceil(total / sanitizedLimit) || 1
    }
  };
}

/**
 * Get a single withdrawal by ID, strictly scoped to userId
 */
async function getWithdrawalById(withdrawalId, userId) {
  // Returns null if belongs to another user so controller returns 404
  return await Withdrawal.findOne({ withdrawalId, userId }).lean();
}

/**
 * Cancel a pending withdrawal by the owner
 * Status changes to CANCELLED and compensating credit restores VEs atomically
 */
async function cancelWithdrawal(withdrawalId, userId, ip = 'unknown', userAgent = 'unknown') {
  return await withTransaction(async (session) => {
    // Atomically find and update status from PENDING to CANCELLED
    const withdrawal = await Withdrawal.findOneAndUpdate(
      {
        withdrawalId,
        userId,
        status: WITHDRAWAL_STATUS.PENDING
      },
      {
        status: WITHDRAWAL_STATUS.CANCELLED,
        $push: {
          statusHistory: {
            status: WITHDRAWAL_STATUS.CANCELLED,
            at: new Date(),
            by: userId,
            note: 'Cancelled by user'
          }
        }
      },
      { new: true, session }
    );

    if (!withdrawal) {
      // Check if withdrawal exists to return clean error
      const existing = await Withdrawal.findOne({ withdrawalId, userId }).session(session);
      if (!existing) {
        throw new NotFoundError('Withdrawal not found.');
      }
      throw new ValidationError(
        `Cannot cancel withdrawal in ${existing.status} status. Only PENDING withdrawals can be cancelled.`
      );
    }

    // Compensating credit (source WITHDRAWAL_REFUND) restores VEs
    const creditResult = await walletService.creditWallet({
      userId,
      currency: CURRENCIES.VES,
      amount: withdrawal.currencyAmount,
      source: CREDIT_SOURCES.WITHDRAWAL_REFUND,
      referenceId: withdrawalId,
      description: `Refund for cancelled withdrawal #${withdrawalId}`,
      session
    });

    // Save refund transaction ID
    withdrawal.refundTransactionId = creditResult.transaction.transactionId;
    await withdrawal.save({ session });

    // Audit Log
    await AuditLog.create(
      [
        {
          actorId: userId,
          actorRole: 'USER',
          action: AUDIT_ACTIONS.WITHDRAWAL_CANCELLED,
          targetUserId: userId,
          targetType: 'WITHDRAWAL',
          referenceId: withdrawalId,
          metadata: {
            refundTransactionId: creditResult.transaction.transactionId,
            refundedAmount: withdrawal.currencyAmount
          },
          ip,
          userAgent
        }
      ],
      { session }
    );

    logger.info({ withdrawalId, userId }, 'Withdrawal cancelled and refunded successfully');

    return {
      withdrawal,
      wallet: creditResult.wallet
    };
  });
}

/**
 * Admin: list withdrawals with filtering
 */
async function adminGetWithdrawals({ page = 1, limit = 20, status, userId, method } = {}) {
  const sanitizedPage = Math.max(1, parseInt(page, 10) || 1);
  const sanitizedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (sanitizedPage - 1) * sanitizedLimit;

  const query = {};
  if (status) query.status = status;
  if (userId) query.userId = userId;
  if (method) query.method = method;

  const [withdrawals, total] = await Promise.all([
    Withdrawal.find(query).sort({ requestedAt: -1 }).skip(skip).limit(sanitizedLimit).lean(),
    Withdrawal.countDocuments(query)
  ]);

  return {
    withdrawals,
    pagination: {
      total,
      page: sanitizedPage,
      limit: sanitizedLimit,
      totalPages: Math.ceil(total / sanitizedLimit) || 1
    }
  };
}

/**
 * Admin: Move withdrawal from PENDING to PROCESSING
 */
async function adminSetProcessing(withdrawalId, adminUserId, reviewNote = '', ip = 'unknown', userAgent = 'unknown') {
  const withdrawal = await Withdrawal.findOneAndUpdate(
    {
      withdrawalId,
      status: WITHDRAWAL_STATUS.PENDING
    },
    {
      status: WITHDRAWAL_STATUS.PROCESSING,
      processedAt: new Date(),
      reviewedBy: adminUserId,
      reviewNote: reviewNote || null,
      $push: {
        statusHistory: {
          status: WITHDRAWAL_STATUS.PROCESSING,
          at: new Date(),
          by: adminUserId,
          note: reviewNote || 'Marked as PROCESSING by admin'
        }
      }
    },
    { new: true }
  );

  if (!withdrawal) {
    const existing = await Withdrawal.findOne({ withdrawalId });
    if (!existing) throw new NotFoundError('Withdrawal not found.');
    throw new ValidationError(
      `Cannot move withdrawal in ${existing.status} status to PROCESSING. Only PENDING withdrawals can be processed.`
    );
  }

  await AuditLog.create({
    actorId: adminUserId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTIONS.WITHDRAWAL_PROCESSING,
    targetUserId: withdrawal.userId,
    targetType: 'WITHDRAWAL',
    referenceId: withdrawalId,
    metadata: { reviewNote },
    ip,
    userAgent
  });

  return withdrawal;
}

/**
 * Admin: Approve withdrawal (PROCESSING -> APPROVED)
 */
async function adminApprove(withdrawalId, adminUserId, reviewNote = '', ip = 'unknown', userAgent = 'unknown') {
  const withdrawal = await Withdrawal.findOneAndUpdate(
    {
      withdrawalId,
      status: WITHDRAWAL_STATUS.PROCESSING
    },
    {
      status: WITHDRAWAL_STATUS.APPROVED,
      reviewedBy: adminUserId,
      reviewNote: reviewNote || null,
      $push: {
        statusHistory: {
          status: WITHDRAWAL_STATUS.APPROVED,
          at: new Date(),
          by: adminUserId,
          note: reviewNote || 'Approved by admin'
        }
      }
    },
    { new: true }
  );

  if (!withdrawal) {
    const existing = await Withdrawal.findOne({ withdrawalId });
    if (!existing) throw new NotFoundError('Withdrawal not found.');
    throw new ValidationError(
      `Cannot approve withdrawal in ${existing.status} status. Only PROCESSING withdrawals can be approved.`
    );
  }

  await AuditLog.create({
    actorId: adminUserId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTIONS.WITHDRAWAL_APPROVED,
    targetUserId: withdrawal.userId,
    targetType: 'WITHDRAWAL',
    referenceId: withdrawalId,
    metadata: { reviewNote, payoutAmount: withdrawal.payoutAmount },
    ip,
    userAgent
  });

  return withdrawal;
}

/**
 * Admin: Reject withdrawal (PENDING or PROCESSING -> REJECTED)
 * Performs an idempotent refund via WITHDRAWAL_REFUND inside a MongoDB transaction
 */
async function adminReject(
  withdrawalId,
  adminUserId,
  rejectionReason,
  reviewNote = '',
  ip = 'unknown',
  userAgent = 'unknown'
) {
  if (!rejectionReason) {
    throw new ValidationError('rejectionReason is required for rejecting a withdrawal.');
  }

  return await withTransaction(async (session) => {
    // Conditional update: only PENDING or PROCESSING can be rejected
    const withdrawal = await Withdrawal.findOneAndUpdate(
      {
        withdrawalId,
        status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING] }
      },
      {
        status: WITHDRAWAL_STATUS.REJECTED,
        rejectionReason,
        reviewedBy: adminUserId,
        reviewNote: reviewNote || null,
        $push: {
          statusHistory: {
            status: WITHDRAWAL_STATUS.REJECTED,
            at: new Date(),
            by: adminUserId,
            note: `Rejected: ${rejectionReason}`
          }
        }
      },
      { new: true, session }
    );

    if (!withdrawal) {
      const existing = await Withdrawal.findOne({ withdrawalId }).session(session);
      if (!existing) throw new NotFoundError('Withdrawal not found.');
      throw new ValidationError(
        `Cannot reject withdrawal in ${existing.status} status. It may have already been reviewed or refunded.`
      );
    }

    // Double refund protection: check if refundTransactionId is already set
    if (withdrawal.refundTransactionId) {
      logger.warn({ withdrawalId }, 'Withdrawal already has a refundTransactionId; skipping second refund');
      return { withdrawal };
    }

    // Create compensating CREDIT ledger entry inside transaction
    const creditResult = await walletService.creditWallet({
      userId: withdrawal.userId,
      currency: CURRENCIES.VES,
      amount: withdrawal.currencyAmount,
      source: CREDIT_SOURCES.WITHDRAWAL_REFUND,
      referenceId: withdrawalId,
      description: `Refund for rejected withdrawal #${withdrawalId} (${rejectionReason})`,
      session
    });

    withdrawal.refundTransactionId = creditResult.transaction.transactionId;
    await withdrawal.save({ session });

    // Audit Log
    await AuditLog.create(
      [
        {
          actorId: adminUserId,
          actorRole: 'ADMIN',
          action: AUDIT_ACTIONS.WITHDRAWAL_REJECTED,
          targetUserId: withdrawal.userId,
          targetType: 'WITHDRAWAL',
          referenceId: withdrawalId,
          metadata: {
            rejectionReason,
            reviewNote,
            refundTransactionId: creditResult.transaction.transactionId,
            refundedAmount: withdrawal.currencyAmount
          },
          ip,
          userAgent
        }
      ],
      { session }
    );

    logger.info({ withdrawalId, adminUserId }, 'Withdrawal rejected and refunded successfully');

    return {
      withdrawal,
      wallet: creditResult.wallet
    };
  });
}

module.exports = {
  createWithdrawal,
  getUserWithdrawals,
  getWithdrawalById,
  cancelWithdrawal,
  adminGetWithdrawals,
  adminSetProcessing,
  adminApprove,
  adminReject,
  maskPayoutDetails,
  MIN_WITHDRAWAL_INR
};
