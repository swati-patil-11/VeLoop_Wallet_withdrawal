const express = require('express');
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validators/authValidators');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  authController.login
);

router.get(
  '/me',
  authenticate,
  authController.getMe
);

module.exports = router;

