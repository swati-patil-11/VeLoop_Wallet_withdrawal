const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { User, Wallet, PayoutOption } = require('../src/models');
const { generateToken } = require('../src/services/authService');
const { ROLES, ACCOUNT_STATUS, PAYOUT_METHODS, CURRENCIES } = require('../src/config/constants');

async function createTestUser({
  email = `user_${uuidv4().slice(0, 8)}@test.com`,
  role = ROLES.USER,
  status = ACCOUNT_STATUS.ACTIVE,
  walletBalances = { ves: 0, sves: 0, gems: 0, tokens: 0, spins: 0 }
} = {}) {
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const userId = uuidv4();

  const user = await User.create({
    userId,
    email,
    name: 'Test User',
    passwordHash,
    role,
    accountStatus: status
  });

  const wallet = await Wallet.create({
    userId,
    ves: walletBalances.ves || 0,
    sves: walletBalances.sves || 0,
    gems: walletBalances.gems || 0,
    tokens: walletBalances.tokens || 0,
    spins: walletBalances.spins || 0
  });

  const token = generateToken(user);

  return { user, wallet, token };
}

async function seedTestPayoutOptions() {
  const options = [
    {
      optionId: 'upi_10',
      methodId: PAYOUT_METHODS.UPI,
      methodName: 'UPI Transfer',
      type: 'instant',
      currency: CURRENCIES.VES,
      payoutValue: 10,
      payoutCurrency: 'INR',
      requiredAmount: 2400,
      active: true,
      eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
      requiredFields: ['upiId'],
      sortOrder: 1
    },
    {
      optionId: 'upi_100',
      methodId: PAYOUT_METHODS.UPI,
      methodName: 'UPI Transfer',
      type: 'instant',
      currency: CURRENCIES.VES,
      payoutValue: 100,
      payoutCurrency: 'INR',
      requiredAmount: 19500,
      active: true,
      eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
      requiredFields: ['upiId'],
      sortOrder: 2
    },
    {
      optionId: 'upi_test_8000',
      methodId: PAYOUT_METHODS.UPI,
      methodName: 'UPI Transfer',
      type: 'instant',
      currency: CURRENCIES.VES,
      payoutValue: 40,
      payoutCurrency: 'INR',
      requiredAmount: 8000,
      active: true,
      eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
      requiredFields: ['upiId'],
      sortOrder: 3
    },
    {
      optionId: 'upi_inactive',
      methodId: PAYOUT_METHODS.UPI,
      methodName: 'UPI Transfer',
      type: 'instant',
      currency: CURRENCIES.VES,
      payoutValue: 50,
      payoutCurrency: 'INR',
      requiredAmount: 10000,
      active: false,
      eligibility: { minAccountAgeDays: 0, requiredAccountStatus: ACCOUNT_STATUS.ACTIVE },
      requiredFields: ['upiId'],
      sortOrder: 4
    }
  ];

  for (const opt of options) {
    await PayoutOption.findOneAndUpdate({ optionId: opt.optionId }, { $set: opt }, { upsert: true });
  }
}

module.exports = {
  createTestUser,
  seedTestPayoutOptions
};
