const payoutService = require('../services/payoutService');

async function getMethods(req, res, next) {
  try {
    const methods = await payoutService.getMethods();
    res.status(200).json({
      success: true,
      methods
    });
  } catch (err) {
    next(err);
  }
}

async function getAllOptions(req, res, next) {
  try {
    const userId = req.user.userId;
    const methodsWithdrawn = await payoutService.getAllOptionsGrouped(userId);
    res.status(200).json({
      success: true,
      methods: methodsWithdrawn
    });
  } catch (err) {
    next(err);
  }
}

async function getOptionsByMethod(req, res, next) {
  try {
    const { method } = req.params;
    const userId = req.user.userId;

    const result = await payoutService.getOptionsByMethod(method, userId);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMethods,
  getAllOptions,
  getOptionsByMethod
};

