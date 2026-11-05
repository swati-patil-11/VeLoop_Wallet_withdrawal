const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { AuthRequiredError, ForbiddenError } = require('../utils/errors');
const { ROLES, ACCOUNT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Authenticate incoming request using JWT Bearer token
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthRequiredError('Authentication required. Missing or invalid Bearer token.');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'demo_jwt_secret_change_in_production_super_secure_key_12345');
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthRequiredError('Authentication token has expired.');
      }
      throw new AuthRequiredError('Invalid authentication token.');
    }

    const user = await User.findOne({ userId: decoded.userId });
    if (!user) {
      throw new AuthRequiredError('User account not found.');
    }

    if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
      throw new ForbiddenError('Your account has been suspended. Please contact support.');
    }

    // Attach authenticated user to request - ALWAYS use req.user.userId
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-based authorization middleware
 * @param {...string} allowedRoles
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthRequiredError('Authentication required.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        { userId: req.user.userId, role: req.user.role, requiredRoles: allowedRoles, path: req.path },
        'Unauthorized role access attempt'
      );
      return next(new ForbiddenError('You do not have permission to perform this action.'));
    }

    next();
  };
}

/**
 * Require ADMIN role or valid internal API key
 */
function authorizeAdminOrInternalKey(req, res, next) {
  const internalKey = req.headers['x-internal-api-key'];
  if (internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
    req.isInternalCall = true;
    return next();
  }

  // Fallback to authenticate + authorize('ADMIN')
  return authenticate(req, res, () => {
    if (req.user && req.user.role === ROLES.ADMIN) {
      return next();
    }
    return next(new ForbiddenError('Admin or internal authorization required.'));
  });
}

module.exports = {
  authenticate,
  authorize,
  authorizeAdminOrInternalKey
};

