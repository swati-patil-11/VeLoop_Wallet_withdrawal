const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const walletService = require('./walletService');
const {
  AuthRequiredError,
  ForbiddenError,
  ValidationError,
  NotFoundError
} = require('../utils/errors');
const { ROLES, ACCOUNT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

const JWT_SECRET =
  process.env.JWT_SECRET || 'demo_jwt_secret_change_in_production_super_secure_key_12345';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for user
 * @param {object} user
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Register a new user
 */
async function register({ email, name, password, role = ROLES.USER }) {
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ValidationError('An account with this email address already exists.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await User.create({
    email: normalizedEmail,
    name: name.trim(),
    passwordHash,
    role
  });

  // Automatically provision zeroed wallet
  const wallet = await walletService.getWallet(user.userId);
  user.walletId = wallet._id.toString();
  await user.save();

  const token = generateToken(user);

  logger.info({ userId: user.userId, email: user.email }, 'New user registered');

  return {
    user: user.toSafeObject(),
    token,
    wallet: {
      ves: wallet.ves,
      sves: wallet.sves,
      gems: wallet.gems,
      tokens: wallet.tokens,
      spins: wallet.spins
    }
  };
}

/**
 * Login user
 */
async function login({ email, password }) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AuthRequiredError('Invalid email or password.');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AuthRequiredError('Invalid email or password.');
  }

  if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended. Please contact support.');
  }

  const token = generateToken(user);

  logger.info({ userId: user.userId, email: user.email }, 'User logged in successfully');

  return {
    user: user.toSafeObject(),
    token
  };
}

/**
 * Get profile and wallet for authenticated user
 */
async function getMe(userId) {
  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User not found.');
  }

  const wallet = await walletService.getWallet(userId);

  return {
    user: user.toSafeObject(),
    wallet: {
      ves: wallet.ves,
      sves: wallet.sves,
      gems: wallet.gems,
      tokens: wallet.tokens,
      spins: wallet.spins
    }
  };
}

module.exports = {
  generateToken,
  register,
  login,
  getMe
};
