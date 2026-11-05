const withdrawalService = require('../services/withdrawalService');
const payoutService = require('../services/payoutService');
const { WalletTransaction, AuditLog } = require('../models');

async function getWithdrawals(req, res, next) {
  try {
    const { page, limit, status, userId, method } = req.query;
    const result = await withdrawalService.adminGetWithdrawals({
      page,
      limit,
      status,
      userId,
      method
    });

    res.status(200).json({
      success: true,
      withdrawals: result.withdrawals,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
}

async function setProcessing(req, res, next) {
  try {
    const { id } = req.params;
    const { reviewNote } = req.body || {};
    const adminUserId = req.user.userId;

    const withdrawal = await withdrawalService.adminSetProcessing(
      id,
      adminUserId,
      reviewNote,
      req.ip,
      req.headers['user-agent'] || 'unknown'
    );

    res.status(200).json({
      success: true,
      message: 'Withdrawal status updated to PROCESSING.',
      withdrawal
    });
  } catch (err) {
    next(err);
  }
}

async function approveWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const { reviewNote } = req.body || {};
    const adminUserId = req.user.userId;

    const withdrawal = await withdrawalService.adminApprove(
      id,
      adminUserId,
      reviewNote,
      req.ip,
      req.headers['user-agent'] || 'unknown'
    );

    res.status(200).json({
      success: true,
      message: 'Withdrawal approved successfully.',
      withdrawal
    });
  } catch (err) {
    next(err);
  }
}

async function rejectWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const { rejectionReason, reviewNote } = req.body;
    const adminUserId = req.user.userId;

    const result = await withdrawalService.adminReject(
      id,
      adminUserId,
      rejectionReason,
      reviewNote,
      req.ip,
      req.headers['user-agent'] || 'unknown'
    );

    res.status(200).json({
      success: true,
      message: 'Withdrawal rejected and VEs refunded to user wallet.',
      withdrawal: result.withdrawal,
      wallet: result.wallet
    });
  } catch (err) {
    next(err);
  }
}

async function getTransactions(req, res, next) {
  try {
    const sanitizedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sanitizedLimit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (sanitizedPage - 1) * sanitizedLimit;

    const query = {};
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.currency) query.currency = req.query.currency.toUpperCase();
    if (req.query.type) query.type = req.query.type.toUpperCase();
    if (req.query.source) query.source = req.query.source;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(sanitizedLimit).lean(),
      WalletTransaction.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        total,
        page: sanitizedPage,
        limit: sanitizedLimit,
        totalPages: Math.ceil(total / sanitizedLimit) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const sanitizedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sanitizedLimit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (sanitizedPage - 1) * sanitizedLimit;

    const query = {};
    if (req.query.targetUserId) query.targetUserId = req.query.targetUserId;
    if (req.query.action) query.action = req.query.action;
    if (req.query.actorId) query.actorId = req.query.actorId;

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(sanitizedLimit).lean(),
      AuditLog.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page: sanitizedPage,
        limit: sanitizedLimit,
        totalPages: Math.ceil(total / sanitizedLimit) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updatePayoutOption(req, res, next) {
  try {
    const { optionId } = req.params;
    const adminUserId = req.user.userId;

    const updated = await payoutService.updatePayoutOption(
      optionId,
      req.body,
      adminUserId,
      req.ip,
      req.headers['user-agent'] || 'unknown'
    );

    res.status(200).json({
      success: true,
      message: 'Payout option updated successfully.',
      option: updated
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWithdrawals,
  setProcessing,
  approveWithdrawal,
  rejectWithdrawal,
  getTransactions,
  getAuditLogs,
  updatePayoutOption
};
