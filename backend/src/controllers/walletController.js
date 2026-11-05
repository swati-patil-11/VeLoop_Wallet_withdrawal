const walletService = require('../services/walletService');
const { Withdrawal, AuditLog } = require('../models');
const { WITHDRAWAL_STATUS, AUDIT_ACTIONS } = require('../config/constants');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * GET /api/wallet
 * Returns current user's wallet balances only. Query params like ?userId= are completely ignored.
 */
async function getWallet(req, res, next) {
  try {
    const userId = req.user.userId;
    const wallet = await walletService.getWallet(userId);

    res.status(200).json({
      success: true,
      wallet: {
        ves: wallet.ves,
        sves: wallet.sves,
        gems: wallet.gems,
        tokens: wallet.tokens,
        spins: wallet.spins
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallet/transactions
 * Returns paginated transaction history for the authenticated user
 */
async function getTransactions(req, res, next) {
  try {
    const userId = req.user.userId;
    const { page, limit, currency, type } = req.query;

    const result = await walletService.getTransactions(userId, {
      page,
      limit,
      currency,
      type
    });

    res.status(200).json({
      success: true,
      transactions: result.transactions,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallet/summary
 * Returns wallet balances + 5 recent transactions + pending withdrawals count & total VEs
 */
async function getSummary(req, res, next) {
  try {
    const userId = req.user.userId;

    const [wallet, recentResult, pendingWithdrawals] = await Promise.all([
      walletService.getWallet(userId),
      walletService.getTransactions(userId, { page: 1, limit: 5 }),
      Withdrawal.find({ userId, status: WITHDRAWAL_STATUS.PENDING })
    ]);

    const pendingCount = pendingWithdrawals.length;
    const pendingTotalVes = pendingWithdrawals.reduce(
      (sum, w) => sum + (w.currencyAmount || 0),
      0
    );

    res.status(200).json({
      success: true,
      summary: {
        wallet: {
          ves: wallet.ves,
          sves: wallet.sves,
          gems: wallet.gems,
          tokens: wallet.tokens,
          spins: wallet.spins
        },
        recentTransactions: recentResult.transactions,
        pendingWithdrawals: {
          count: pendingCount,
          totalVes: pendingTotalVes
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallet/credit
 * ADMIN / Internal only: Credit user wallet with audit log
 */
async function creditWallet(req, res, next) {
  try {
    const { targetUserId, currency, amount, source, description, referenceId, metadata } = req.body;
    const actorId = req.user ? req.user.userId : 'INTERNAL_SYSTEM';
    const actorRole = req.user ? req.user.role : 'ADMIN';

    const result = await walletService.creditWallet({
      userId: targetUserId,
      currency,
      amount,
      source,
      referenceId,
      description: description || `Admin/System credit: ${source}`,
      metadata
    });

    // Write Audit Log
    await AuditLog.create({
      actorId,
      actorRole,
      action: AUDIT_ACTIONS.WALLET_CREDIT,
      targetUserId,
      targetType: 'WALLET',
      referenceId: result.transaction.transactionId,
      metadata: {
        currency,
        amount,
        source,
        description,
        balanceBefore: result.transaction.balanceBefore,
        balanceAfter: result.transaction.balanceAfter
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    res.status(200).json({
      success: true,
      message: 'Wallet credited successfully.',
      wallet: {
        ves: result.wallet.ves,
        sves: result.wallet.sves,
        gems: result.wallet.gems,
        tokens: result.wallet.tokens,
        spins: result.wallet.spins
      },
      transaction: result.transaction
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallet/debit
 * ADMIN / Internal only: Debit user wallet with audit log
 */
async function debitWallet(req, res, next) {
  try {
    const { targetUserId, currency, amount, source, description, referenceId, metadata } = req.body;
    const actorId = req.user ? req.user.userId : 'INTERNAL_SYSTEM';
    const actorRole = req.user ? req.user.role : 'ADMIN';

    const result = await walletService.debitWallet({
      userId: targetUserId,
      currency,
      amount,
      source,
      referenceId,
      description: description || `Admin/System debit: ${source}`,
      metadata
    });

    // Write Audit Log
    await AuditLog.create({
      actorId,
      actorRole,
      action: source === 'CORRECTION' ? AUDIT_ACTIONS.BALANCE_CORRECTION : AUDIT_ACTIONS.WALLET_DEBIT,
      targetUserId,
      targetType: 'WALLET',
      referenceId: result.transaction.transactionId,
      metadata: {
        currency,
        amount,
        source,
        description,
        balanceBefore: result.transaction.balanceBefore,
        balanceAfter: result.transaction.balanceAfter
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    res.status(200).json({
      success: true,
      message: 'Wallet debited successfully.',
      wallet: {
        ves: result.wallet.ves,
        sves: result.wallet.sves,
        gems: result.wallet.gems,
        tokens: result.wallet.tokens,
        spins: result.wallet.spins
      },
      transaction: result.transaction
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWallet,
  getTransactions,
  getSummary,
  creditWallet,
  debitWallet
};
