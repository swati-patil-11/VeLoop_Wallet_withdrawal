const express = require('express');
const walletController = require('../controllers/walletController');
const { authenticate, authorizeAdminOrInternalKey } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  creditWalletSchema,
  debitWalletSchema,
  transactionQuerySchema
} = require('../validators/walletValidators');
const { idempotency } = require('../middleware/idempotency');
const { mutationLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// User Wallet Routes (Authenticated)
router.get('/', authenticate, walletController.getWallet);
router.get(
  '/transactions',
  authenticate,
  validate({ query: transactionQuerySchema }),
  walletController.getTransactions
);
router.get('/summary', authenticate, walletController.getSummary);

// Admin / Internal Management Routes (Admin Role or Internal API Key + Idempotency)
router.post(
  '/credit',
  authorizeAdminOrInternalKey,
  mutationLimiter,
  idempotency({ required: false }),
  validate({ body: creditWalletSchema }),
  walletController.creditWallet
);

router.post(
  '/debit',
  authorizeAdminOrInternalKey,
  mutationLimiter,
  idempotency({ required: false }),
  validate({ body: debitWalletSchema }),
  walletController.debitWallet
);

module.exports = router;

