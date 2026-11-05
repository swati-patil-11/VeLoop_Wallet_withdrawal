class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient VEs balance.', details = null) {
    super(message, 400, 'INSUFFICIENT_BALANCE', details);
  }
}

class InvalidPayoutOptionError extends AppError {
  constructor(message = 'Selected payout option is unavailable.', details = null) {
    super(message, 400, 'INVALID_PAYOUT_OPTION', details);
  }
}

class InactivePayoutMethodError extends AppError {
  constructor(message = 'This payout method is currently unavailable.', details = null) {
    super(message, 400, 'INACTIVE_PAYOUT_METHOD', details);
  }
}

class DuplicateWithdrawalError extends AppError {
  constructor(message = 'Duplicate withdrawal request detected.', details = null) {
    super(message, 409, 'DUPLICATE_WITHDRAWAL', details);
  }
}

class AuthRequiredError extends AppError {
  constructor(message = 'Authentication required.', details = null) {
    super(message, 401, 'AUTH_REQUIRED', details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden.', details = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found.', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed.', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class SuspiciousActivityError extends AppError {
  constructor(message = 'This request requires additional verification.', details = null) {
    super(message, 429, 'SUSPICIOUS_ACTIVITY', details);
  }
}

module.exports = {
  AppError,
  InsufficientBalanceError,
  InvalidPayoutOptionError,
  InactivePayoutMethodError,
  DuplicateWithdrawalError,
  AuthRequiredError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  SuspiciousActivityError
};
