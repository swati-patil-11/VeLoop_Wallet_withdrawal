const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  rejectWithdrawalSchema,
  reviewWithdrawalSchema,
  updatePayoutOptionSchema
} = require('../validators/withdrawalValidators');
const { ROLES } = require('../config/constants');

const router = express.Router();

// Require authenticated user with ADMIN role on all admin routes
router.use(authenticate, authorize(ROLES.ADMIN));

// Withdrawals review pipeline
router.get('/withdrawals', adminController.getWithdrawals);
router.post(
  '/withdrawals/:id/processing',
  validate({ body: reviewWithdrawalSchema }),
  adminController.setProcessing
);
router.post(
  '/withdrawals/:id/approve',
  validate({ body: reviewWithdrawalSchema }),
  adminController.approveWithdrawal
);
router.post(
  '/withdrawals/:id/reject',
  validate({ body: rejectWithdrawalSchema }),
  adminController.rejectWithdrawal
);

// Ledger & Audit Inspection
router.get('/transactions', adminController.getTransactions);
router.get('/audit-logs', adminController.getAuditLogs);

// Payout Option Configuration
router.put(
  '/payout-options/:optionId',
  validate({ body: updatePayoutOptionSchema }),
  adminController.updatePayoutOption
);

module.exports = router;
