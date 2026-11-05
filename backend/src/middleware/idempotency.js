const crypto = require('crypto');
const { IdempotencyRecord } = require('../models');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Hash request body for idempotency validation
 */
function hashPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload || {}))
    .digest('hex');
}

/**
 * Generic idempotency middleware for mutation endpoints
 * @param {object} options
 * @param {boolean} [options.required=false] - Whether Idempotency-Key header is strictly required
 * @param {number} [options.ttlSeconds=86400] - Snapshot retention duration (default 24h)
 */
function idempotency({ required = false, ttlSeconds = 86400 } = {}) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];

    if (!key) {
      if (required) {
        return next(new ValidationError('Idempotency-Key header is required for this operation.'));
      }
      return next();
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(key)) {
      return next(new ValidationError('Idempotency-Key header must be a valid UUID.'));
    }

    const userId = req.user ? req.user.userId : 'anonymous';
    const endpoint = req.originalUrl;
    const requestHash = hashPayload(req.body);

    try {
      const existing = await IdempotencyRecord.findOne({ userId, key, endpoint });
      if (existing) {
        logger.info({ userId, key, endpoint }, 'Idempotency record hit, replaying snapshot');
        return res.status(existing.statusCode || 200).json({
          ...existing.responseSnapshot,
          duplicate: true
        });
      }

      // Intercept res.json to capture response snapshot
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only save snapshot for successful 2xx responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
          IdempotencyRecord.create({
            key,
            userId,
            endpoint,
            requestHash,
            responseSnapshot: body,
            statusCode: res.statusCode,
            expiresAt
          }).catch((err) => {
            logger.warn({ error: err.message, key }, 'Failed to save idempotency record');
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  idempotency,
  hashPayload
};

