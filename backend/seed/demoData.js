require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { connectDB } = require('../src/config/db');
const { User, Wallet, WalletTransaction, Withdrawal, PayoutOption } = require('../src/models');
const { seedPayoutOptions } = require('./payoutOptions');
const {
  ROLES,
  ACCOUNT_STATUS,
  CURRENCIES,
  TRANSACTION_TYPES,
  CREDIT_SOURCES,
  DEBIT_SOURCES,
  TRANSACTION_STATUS,
  WITHDRAWAL_STATUS,
  PAYOUT_METHODS
} = require('../src/config/constants');
const logger = require('../src/utils/logger');

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PROD !== 'true') {
    logger.error('Refusing to seed database in production without SEED_ALLOW_PROD=true');
    process.exit(1);
  }

  await connectDB();
  logger.info('Starting database seeding...');

  // 1. Seed Payout Options
  await seedPayoutOptions();

  // 2. Passwords
  const userPasswordHash = await bcrypt.hash('DemoUser123!', 10);
  const adminPasswordHash = await bcrypt.hash('AdminPass123!', 10);

  // 3. Admin User
  const adminEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@veloop.test').toLowerCase();
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      userId: uuidv4(),
      email: adminEmail,
      name: 'System Admin',
      passwordHash: adminPasswordHash,
      role: ROLES.ADMIN,
      accountStatus: ACCOUNT_STATUS.ACTIVE
    });
    logger.info({ email: adminEmail }, 'Created admin user');
  }

  // 4. Secondary User (for isolation tests)
  const demo2Email = 'demo2@veloop.test';
  let demo2 = await User.findOne({ email: demo2Email });
  if (!demo2) {
    demo2 = await User.create({
      userId: uuidv4(),
      email: demo2Email,
      name: 'Secondary Demo User',
      passwordHash: userPasswordHash,
      role: ROLES.USER,
      accountStatus: ACCOUNT_STATUS.ACTIVE
    });

    await Wallet.findOneAndUpdate(
      { userId: demo2.userId },
      { $set: { userId: demo2.userId, ves: 5000, sves: 1000, gems: 20, tokens: 100, spins: 1 } },
      { upsert: true, new: true }
    );
    logger.info({ email: demo2Email }, 'Created secondary demo user');
  }

  // 5. Primary Demo User
  const demoEmail = 'demo@veloop.test';
  let demoUser = await User.findOne({ email: demoEmail });
  if (!demoUser) {
    demoUser = await User.create({
      userId: uuidv4(),
      email: demoEmail,
      name: 'Swati VELoop Demo',
      passwordHash: userPasswordHash,
      role: ROLES.USER,
      accountStatus: ACCOUNT_STATUS.ACTIVE
    });
    logger.info({ email: demoEmail }, 'Created primary demo user');
  }

  const userId = demoUser.userId;

  // Clear existing demo ledger & withdrawals for clean idempotent reconciliation
  await WalletTransaction.deleteMany({ userId, 'metadata.demo': true });
  await Withdrawal.deleteMany({ userId, 'payoutDetails.demo': true });

  // Build ledger sequence for demo@veloop.test:
  // Step 1: Opening balance -> 10,000 VEs
  // Step 2: Daily reward -> +500 VEs (balance: 10,500)
  // Step 3: Ad reward -> +2,500 VEs (balance: 13,000)
  // Step 4: Game reward -> +4,000 VEs (balance: 17,000)
  // Step 5: Referral reward -> +10,400 VEs (balance: 27,400)
  // Step 6: Past Withdrawal -> -2,400 VEs (balance: 25,000)
  // Final VEs: 25,000
  const pastWithdrawalId = uuidv4();
  const pastWithdrawalTxId = uuidv4();

  const transactions = [
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.VES,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 10000,
      balanceBefore: 0,
      balanceAfter: 10000,
      source: CREDIT_SOURCES.BALANCE_OPENING,
      description: 'Opening Rewards Balance',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.SVES,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 5000,
      balanceBefore: 0,
      balanceAfter: 5000,
      source: CREDIT_SOURCES.BALANCE_OPENING,
      description: 'Opening Super VEs Balance',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.GEMS,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 100,
      balanceBefore: 0,
      balanceAfter: 100,
      source: CREDIT_SOURCES.BALANCE_OPENING,
      description: 'Opening Gems Balance',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.TOKENS,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 500,
      balanceBefore: 0,
      balanceAfter: 500,
      source: CREDIT_SOURCES.BALANCE_OPENING,
      description: 'Opening Tokens Balance',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.SPINS,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 3,
      balanceBefore: 0,
      balanceAfter: 3,
      source: CREDIT_SOURCES.BALANCE_OPENING,
      description: 'Opening Daily Wheel Spins',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.VES,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 500,
      balanceBefore: 10000,
      balanceAfter: 10500,
      source: CREDIT_SOURCES.DAILY_REWARD,
      description: 'Day 5 Login Streak Reward',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.VES,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 2500,
      balanceBefore: 10500,
      balanceAfter: 13000,
      source: CREDIT_SOURCES.AD_REWARD,
      description: 'Sponsored Video Bonus',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.VES,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 4000,
      balanceBefore: 13000,
      balanceAfter: 17000,
      source: CREDIT_SOURCES.GAME_REWARD,
      description: 'Level 10 Quest Completion',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: uuidv4(),
      userId,
      currency: CURRENCIES.VES,
      type: TRANSACTION_TYPES.CREDIT,
      amount: 10400,
      balanceBefore: 17000,
      balanceAfter: 27400,
      source: CREDIT_SOURCES.REFERRAL,
      description: 'Friend Referral Bonus (x2)',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    },
    {
      transactionId: pastWithdrawalTxId,
      userId,
      currency: CURRENCIES.VES,
      type: TRANSACTION_TYPES.DEBIT,
      amount: 2400,
      balanceBefore: 27400,
      balanceAfter: 25000,
      source: DEBIT_SOURCES.WITHDRAWAL,
      referenceId: pastWithdrawalId,
      description: 'Redemption for UPI Transfer (INR 10)',
      metadata: { demo: true },
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    }
  ];

  await WalletTransaction.insertMany(transactions);

  // Create matching historical withdrawal
  await Withdrawal.create({
    withdrawalId: pastWithdrawalId,
    userId,
    method: PAYOUT_METHODS.UPI,
    optionId: 'upi_10',
    currency: CURRENCIES.VES,
    currencyAmount: 2400,
    payoutAmount: 10,
    payoutDetails: { upiId: 'sw***1@okaxis', demo: true },
    status: WITHDRAWAL_STATUS.APPROVED,
    transactionId: pastWithdrawalTxId,
    idempotencyKey: uuidv4(),
    requestedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    processedAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
    reviewedBy: admin.userId,
    reviewNote: 'Automated instant approval',
    statusHistory: [
      {
        status: WITHDRAWAL_STATUS.PENDING,
        at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        by: userId,
        note: 'Withdrawal requested'
      },
      {
        status: WITHDRAWAL_STATUS.PROCESSING,
        at: new Date(Date.now() - 23 * 60 * 60 * 1000),
        by: admin.userId,
        note: 'Queued for gateway transfer'
      },
      {
        status: WITHDRAWAL_STATUS.APPROVED,
        at: new Date(Date.now() - 22 * 60 * 60 * 1000),
        by: admin.userId,
        note: 'Transfer completed'
      }
    ]
  });

  // Set wallet balances to exact reconciled figures
  await Wallet.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        ves: 25000,
        sves: 5000,
        gems: 100,
        tokens: 500,
        spins: 3,
        version: transactions.length
      }
    },
    { upsert: true, new: true }
  );

  logger.info('Demo data seeded successfully!');
  logger.info('---------------------------------------------');
  logger.info('Demo Credentials:');
  logger.info(`User:  ${demoEmail} / DemoUser123!`);
  logger.info(`User2: ${demo2Email} / DemoUser123!`);
  logger.info(`Admin: ${adminEmail} / AdminPass123!`);
  logger.info('Wallet: VEs 25,000 | SVEs 5,000 | Gems 100 | Tokens 500 | Spins 3');
  logger.info('---------------------------------------------');

  if (require.main === module) {
    await mongoose.connection.close();
    process.exit(0);
  }
}

if (require.main === module) {
  seed().catch((err) => {
    logger.error({ error: err.message }, 'Seeding failed');
    process.exit(1);
  });
}

module.exports = { seed };

