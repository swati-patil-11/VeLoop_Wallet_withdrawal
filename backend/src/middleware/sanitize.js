/**
 * Recursive sanitizer to remove any keys starting with '$' or containing '.'
 * to prevent MongoDB query injection attacks.
 */
function sanitizeObject(target) {
  if (!target || typeof target !== 'object') {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map(sanitizeObject);
  }

  for (const key of Object.keys(target)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete target[key];
    } else if (typeof target[key] === 'object' && target[key] !== null) {
      sanitizeObject(target[key]);
    }
  }

  return target;
}

function mongoSanitize(req, res, next) {
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  next();
}

module.exports = { mongoSanitize, sanitizeObject };

