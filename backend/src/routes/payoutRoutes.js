const express = require('express');
const payoutController = require('../controllers/payoutController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Public / Authenticated method lookup
router.get('/methods', authenticate, payoutController.getMethods);

// All options grouped by method (Page 11 format)
router.get('/options', authenticate, payoutController.getAllOptions);

// Options for a specific method with computed per-user eligibility
router.get('/options/:method', authenticate, payoutController.getOptionsByMethod);

module.exports = router;

