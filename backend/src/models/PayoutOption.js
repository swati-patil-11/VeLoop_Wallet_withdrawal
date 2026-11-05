const mongoose = require('mongoose');
const { CURRENCIES, PAYOUT_METHODS, ACCOUNT_STATUS } = require('../config/constants');

const payoutOptionSchema = new mongoose.Schema(
  {
    optionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    methodId: {
      type: String,
      required: true,
      enum: Object.values(PAYOUT_METHODS),
      index: true
    },
    methodName: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: 'standard'
    },
    currency: {
      type: String,
      default: CURRENCIES.VES,
      required: true
    },
    payoutValue: {
      type: Number,
      required: true,
      min: [1, 'Payout value must be at least 1']
    },
    payoutCurrency: {
      type: String,
      default: 'INR',
      required: true
    },
    requiredAmount: {
      type: Number,
      required: true,
      min: [1, 'Required amount must be a positive integer'],
      validate: {
        validator: Number.isInteger,
        message: 'Required amount must be an integer'
      }
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    eligibility: {
      minAccountAgeDays: {
        type: Number,
        default: 0,
        min: 0
      },
      requiredAccountStatus: {
        type: String,
        enum: Object.values(ACCOUNT_STATUS),
        default: ACCOUNT_STATUS.ACTIVE
      },
      minLifetimeEarned: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    requiredFields: {
      type: [String],
      required: true,
      default: ['upiId']
    },
    sortOrder: {
      type: Number,
      default: 0
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

payoutOptionSchema.index({ methodId: 1, active: 1, sortOrder: 1 });

const PayoutOption = mongoose.model('PayoutOption', payoutOptionSchema);
module.exports = PayoutOption;

