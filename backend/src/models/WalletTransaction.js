const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const {
  CURRENCY_LIST,
  CURRENCIES,
  TRANSACTION_TYPES,
  ALL_TRANSACTION_SOURCES,
  TRANSACTION_STATUS
} = require('../config/constants');

const walletTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    currency: {
      type: String,
      enum: CURRENCY_LIST,
      default: CURRENCIES.VES,
      required: true
    },
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPES),
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Amount must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer'
      }
    },
    balanceBefore: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'balanceBefore must be an integer'
      }
    },
    balanceAfter: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'balanceAfter must be an integer'
      }
    },
    source: {
      type: String,
      enum: ALL_TRANSACTION_SOURCES,
      required: true
    },
    referenceId: {
      type: String,
      index: true,
      default: null
    },
    status: {
      type: String,
      enum: Object.values(TRANSACTION_STATUS),
      default: TRANSACTION_STATUS.COMPLETED,
      required: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Indexes
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, currency: 1, createdAt: -1 });

// Partial unique index on (referenceId, source) for sources that must happen once
// This guarantees at the database level that a referenceId cannot have multiple WITHDRAWAL or WITHDRAWAL_REFUND entries
walletTransactionSchema.index(
  { referenceId: 1, source: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceId: { $type: 'string' },
      source: { $in: ['WITHDRAWAL', 'WITHDRAWAL_REFUND'] }
    }
  }
);

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
module.exports = WalletTransaction;

