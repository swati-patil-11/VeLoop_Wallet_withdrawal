const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Centralized error handler
 */
function errorHandler(err, req, res, next) {
  // If response has already started streaming, delegate to default express handler
  if (res.headersSent) {
    return next(err);
  }

  const isDev = process.env.NODE_ENV === 'development';

  // Known AppError
  if (err instanceof AppError) {
    logger.warn(
      {
        code: err.code,
        statusCode: err.statusCode,
        message: err.message,
        details: err.details,
        path: req.originalUrl,
        method: req.method
      },
      'Operational Application Error'
    );

    const response = {
      success: false,
      message: err.message,
      code: err.code
    };

    if (err.details && (isDev || err.code === 'VALIDATION_ERROR')) {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    logger.warn({ error: err.message, keyPattern: err.keyPattern }, 'MongoDB Duplicate Key Error');

    let message = 'Duplicate resource detected.';
    if (err.keyPattern && err.keyPattern.email) {
      message = 'An account with this email address already exists.';
    } else if (err.keyPattern && err.keyPattern.idempotencyKey) {
      message = 'Duplicate request detected for this idempotency key.';
    }

    return res.status(409).json({
      success: false,
      message,
      code: 'DUPLICATE_KEY_ERROR'
    });
  }

  // Handle Mongoose CastError or ValidationError
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message || 'Validation failed.',
      code: 'VALIDATION_ERROR'
    });
  }

  // Unhandled / Internal Errors
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method
    },
    'Unhandled Server Error'
  );

  return res.status(500).json({
    success: false,
    message: 'An internal server error occurred. Please try again later.',
    code: 'INTERNAL_ERROR',
    ...(isDev ? { stack: err.stack } : {})
  });
}

/**
 * 404 Route Not Found Handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND'
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};

