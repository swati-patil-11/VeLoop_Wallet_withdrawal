const withdrawalService = require('../services/withdrawalService');
const { NotFoundError, ValidationError } = require('../utils/errors');

async function createWithdrawal(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required.');
    }

    const { method, optionId, payoutDetails } = req.body;
    const userId = req.user.userId;

    const result = await withdrawalService.createWithdrawal({
      userId,
      method,
      optionId,
      payoutDetails,
      idempotencyKey,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    res.status(200).json({
      success: true,
      message: result.duplicate
        ? 'Duplicate withdrawal request recognized.'
        : 'Withdrawal submitted successfully.',
      duplicate: result.duplicate,
      withdrawal: result.withdrawal,
      wallet: result.wallet
    });
  } catch (err) {
    next(err);
  }
}

async function getUserWithdrawals(req, res, next) {
  try {
    const userId = req.user.userId;
    const { page, limit, status } = req.query;

    const result = await withdrawalService.getUserWithdrawals(userId, {
      page,
      limit,
      status
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

async function getWithdrawalById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const withdrawal = await withdrawalService.getWithdrawalById(id, userId);
    if (!withdrawal) {
      // Return 404 instead of 403 to avoid disclosing existence of other users' IDs
      throw new NotFoundError('Withdrawal not found.');
    }

    res.status(200).json({
      success: true,
      withdrawal
    });
  } catch (err) {
    next(err);
  }
}

async function cancelWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await withdrawalService.cancelWithdrawal(
      id,
      userId,
      req.ip,
      req.headers['user-agent'] || 'unknown'
    );

    res.status(200).json({
      success: true,
      message: 'Withdrawal cancelled successfully and VEs refunded to wallet.',
      withdrawal: result.withdrawal,
      wallet: result.wallet
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createWithdrawal,
  getUserWithdrawals,
  getWithdrawalById,
  cancelWithdrawal
};
