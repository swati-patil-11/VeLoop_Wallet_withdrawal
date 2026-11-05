const authService = require('../services/authService');

async function register(req, res, next) {
  try {
    const { email, name, password } = req.body;
    const result = await authService.register({ email, name, password });
    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    // userId strictly from verified JWT token (req.user)
    const result = await authService.getMe(req.user.userId);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe
};

