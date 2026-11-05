const express = require('express');
const withdrawalController = require('../controllers/withdrawalController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createWithdrawalSchema,
  idempotencyHeaderSchema
} = require('../validators/withdrawalValidators');
const { withdrawalLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Create withdrawal (requires auth, rate limit, strict schema, idempotency header)
router.post(
  '/',
  authenticate,
  withdrawalLimiter,
  validate({
    headers: idempotencyHeaderSchema,
    body: createWithdrawalSchema
  }),
  withdrawalController.createWithdrawal
);

// Get user's own withdrawals
router.get('/', authenticate, withdrawalController.getUserWithdrawals);

// Get specific withdrawal (own only)
router.get('/:id', authenticate, withdrawalController.getWithdrawalById);

// Cancel pending withdrawal (own only)
router.post('/:id/cancel', authenticate, withdrawalController.cancelWithdrawal);

module.exports = router;
