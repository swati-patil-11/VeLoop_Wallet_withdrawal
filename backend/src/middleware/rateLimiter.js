const rateLimit = require('express-rate-limit');

/**
 * Standard error response formatter for rate limits
 */
const rateLimitHandler = (message = 'Too many requests, please try again later.') => {
  return (req, res) => {
    res.status(429).json({
      success: false,
      message,
      code: 'RATE_LIMIT_EXCEEDED'
    });
  };
};

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX, 10) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Global rate limit exceeded. Please slow down your requests.')
});

// Strict limiter for authentication (login / register)
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many authentication attempts. Please try again after 15 minutes.')
});

// Strict limiter for withdrawal creation
const withdrawalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WITHDRAWAL_WINDOW_MS, 10) || 60 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_WITHDRAWAL_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.userId : req.ip;
  },
  handler: rateLimitHandler('Withdrawal request rate limit exceeded. Please try again later.')
});

// Strict limiter for credit / debit mutations
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many wallet mutation attempts. Please slow down.')
});

module.exports = {
  globalLimiter,
  authLimiter,
  withdrawalLimiter,
  mutationLimiter
};

