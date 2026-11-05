const mongoose = require('mongoose');

const integerNonNegativeValidator = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer.'
};

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    ves: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'VES balance cannot be negative'],
      validate: integerNonNegativeValidator
    },
    sves: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'SVES balance cannot be negative'],
      validate: integerNonNegativeValidator
    },
    gems: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Gems balance cannot be negative'],
      validate: integerNonNegativeValidator
    },
    tokens: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Tokens balance cannot be negative'],
      validate: integerNonNegativeValidator
    },
    spins: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Spins balance cannot be negative'],
      validate: integerNonNegativeValidator
    },
    version: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;

