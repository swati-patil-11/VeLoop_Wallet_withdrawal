const { ValidationError } = require('../utils/errors');

/**
 * Validate request against Zod schemas
 * @param {object} schemas
 * @param {import('zod').ZodSchema} [schemas.body]
 * @param {import('zod').ZodSchema} [schemas.query]
 * @param {import('zod').ZodSchema} [schemas.params]
 * @param {import('zod').ZodSchema} [schemas.headers]
 */
function validate({ body, query, params, headers } = {}) {
  return (req, res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (params) {
        req.params = params.parse(req.params);
      }
      if (headers) {
        headers.parse(req.headers);
      }
      next();
    } catch (err) {
      if (err.errors && Array.isArray(err.errors)) {
        const issues = err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message
        }));
        const firstMessage = issues.length > 0 ? issues[0].message : 'Validation failed.';
        return next(new ValidationError(firstMessage, issues));
      }
      return next(err);
    }
  };
}

module.exports = { validate };
