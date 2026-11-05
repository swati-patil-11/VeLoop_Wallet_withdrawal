const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { CURRENCIES, WITHDRAWAL_STATUS } = require('../config/constants');

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      required: true
    },
    at: {
      type: Date,
      default: Date.now,
      required: true
    },
    by: {
      type: String,
      required: true
    },
    note: {
      type: String,
      default: ''
    }
  },
  { _id: false }
);

const withdrawalSchema = new mongoose.Schema(
  {
    withdrawalId: {
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
    method: {
      type: String,
      required: true,
      index: true
    },
    optionId: {
      type: String,
      required: true,
      index: true
    },
    currency: {
      type: String,
      default: CURRENCIES.VES,
      required: true
    },
    currencyAmount: {
      type: Number,
      required: true,
      min: [1, 'Currency amount must be positive'],
      validate: {
        validator: Number.isInteger,
        message: 'Currency amount must be an integer'
      }
    },
    payoutAmount: {
      type: Number,
      required: true,
      min: [1, 'Payout amount must be positive']
    },
    payoutDetails: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
      required: true,
      index: true
    },
    rejectionReason: {
      type: String,
      default: null
    },
    reviewNote: {
      type: String,
      default: null
    },
    transactionId: {
      type: String,
      required: true,
      index: true
    },
    refundTransactionId: {
      type: String,
      default: null
    },
    idempotencyKey: {
      type: String,
      required: true
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    processedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: String,
      default: null
    },
    statusHistory: [statusHistoryEntrySchema]
  },
  {
    timestamps: true
  }
);

// Indexes
withdrawalSchema.index({ userId: 1, requestedAt: -1 });
withdrawalSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
module.exports = Withdrawal;
