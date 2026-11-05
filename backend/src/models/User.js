const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { ROLES, ACCOUNT_STATUS } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
      required: true
    },
    accountStatus: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
      required: true
    },
    walletId: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Method to safely return user object without password
userSchema.methods.toSafeObject = function () {
  return {
    userId: this.userId,
    email: this.email,
    name: this.name,
    role: this.role,
    accountStatus: this.accountStatus,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model('User', userSchema);
module.exports = User;
