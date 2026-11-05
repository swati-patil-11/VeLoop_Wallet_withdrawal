const { Wallet, WalletTransaction } = require('../models');
const {
  CURRENCY_LIST,
  CURRENCIES,
  TRANSACTION_TYPES,
  CREDIT_SOURCES,
  DEBIT_SOURCES,
  TRANSACTION_STATUS
} = require('../config/constants');
const {
  InsufficientBalanceError,
  NotFoundError,
  ValidationError
} = require('../utils/errors');
const { withTransaction } = require('../utils/transactionHelper');
const logger = require('../utils/logger');

// Currency name to Wallet document field mapping
const CURRENCY_FIELD_MAP = Object.freeze({
  VES: 'ves',
  SVES: 'sves',
  GEMS: 'gems',
  TOKENS: 'tokens',
  SPINS: 'spins'
});

/**
 * Normalize and validate currency
 * @param {string} currency
 * @returns {string} canonical uppercase currency
 */
function getValidCurrency(currency) {
  if (!currency || typeof currency !== 'string') {
    throw new ValidationError('Currency is required and must be a string.');
  }
  const upper = currency.toUpperCase();
  if (!CURRENCY_LIST.includes(upper)) {
    throw new ValidationError(`Unsupported currency: ${currency}. Allowed: ${CURRENCY_LIST.join(', ')}`);
  }
  return upper;
}

/**
 * Validate positive integer amount
 * @param {any} amount
 * @returns {number}
 */
function validatePositiveIntegerAmount(amount) {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || !Number.isFinite(amount)) {
    throw new ValidationError('Amount must be a positive integer.');
  }
  return amount;
}

/**
 * Get or create wallet for a user
 * @param {string} userId
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<import('../models/Wallet')>}
 */
async function getWallet(userId, session = null) {
  if (!userId) {
    throw new ValidationError('userId is required.');
  }

  let wallet = await Wallet.findOne({ userId }).session(session);
  if (!wallet) {
    // Upsert atomically in case of race
    wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, ves: 0, sves: 0, gems: 0, tokens: 0, spins: 0, version: 0 } },
      { new: true, upsert: true, session }
    );
  }
  return wallet;
}

/**
 * Get paginated transactions for a user
 * @param {string} userId
 * @param {object} options
 */
async function getTransactions(userId, { page = 1, limit = 20, currency, type } = {}) {
  if (!userId) {
    throw new ValidationError('userId is required.');
  }

  const sanitizedPage = Math.max(1, parseInt(page, 10) || 1);
  const sanitizedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (sanitizedPage - 1) * sanitizedLimit;

  const query = { userId };
  if (currency) {
    query.currency = getValidCurrency(currency);
  }
  if (type) {
    const upperType = type.toUpperCase();
    if (!Object.values(TRANSACTION_TYPES).includes(upperType)) {
      throw new ValidationError(`Invalid transaction type: ${type}`);
    }
    query.type = upperType;
  }

  const [transactions, total] = await Promise.all([
    WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(sanitizedLimit)
      .lean(),
    WalletTransaction.countDocuments(query)
  ]);

  return {
    transactions,
    pagination: {
      total,
      page: sanitizedPage,
      limit: sanitizedLimit,
      totalPages: Math.ceil(total / sanitizedLimit) || 1
    }
  };
}

/**
 * Validate if wallet has sufficient balance
 * @param {object} wallet
 * @param {string} currency
 * @param {number} amount
 */
function validateBalance(wallet, currency, amount) {
  const canonCurrency = getValidCurrency(currency);
  const validAmount = validatePositiveIntegerAmount(amount);
  const field = CURRENCY_FIELD_MAP[canonCurrency];

  const currentBalance = (wallet && wallet[field]) || 0;
  return currentBalance >= validAmount;
}

/**
 * Create ledger entry (WalletTransaction) inside a session
 * @param {import('mongoose').ClientSession} session
 * @param {object} data
 */
async function createLedgerEntry(session, data) {
  const [entry] = await WalletTransaction.create([data], { session });
  return entry;
}

/**
 * Credit a user's wallet and write immutable ledger entry inside a transaction
 * @param {object} params
 */
async function creditWallet({
  userId,
  currency = CURRENCIES.VES,
  amount,
  source,
  referenceId = null,
  description = '',
  metadata = {},
  session: externalSession = null
}) {
  const canonCurrency = getValidCurrency(currency);
  const validAmount = validatePositiveIntegerAmount(amount);
  const field = CURRENCY_FIELD_MAP[canonCurrency];

  if (!source || !Object.values(CREDIT_SOURCES).includes(source)) {
    throw new ValidationError(`Invalid credit source: ${source}`);
  }

  return await withTransaction(async (session) => {
    // Atomic update with upsert: $inc adds the amount
    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        $inc: { [field]: validAmount, version: 1 },
        $setOnInsert: {
          userId,
          ves: field === 'ves' ? 0 : 0,
          sves: field === 'sves' ? 0 : 0,
          gems: field === 'gems' ? 0 : 0,
          tokens: field === 'tokens' ? 0 : 0,
          spins: field === 'spins' ? 0 : 0
        }
      },
      { new: true, upsert: true, session }
    );

    const balanceAfter = updatedWallet[field];
    const balanceBefore = balanceAfter - validAmount;

    const ledgerEntry = await createLedgerEntry(session, {
      userId,
      currency: canonCurrency,
      type: TRANSACTION_TYPES.CREDIT,
      amount: validAmount,
      balanceBefore,
      balanceAfter,
      source,
      referenceId,
      status: TRANSACTION_STATUS.COMPLETED,
      description: description || `Credit from ${source}`,
      metadata
    });

    logger.info(
      { userId, currency: canonCurrency, amount: validAmount, source, referenceId },
      'Wallet credited successfully'
    );

    return {
      wallet: updatedWallet,
      transaction: ledgerEntry
    };
  }, externalSession);
}

/**
 * Debit a user's wallet atomically with conditional check and write ledger entry inside a transaction
 * @param {object} params
 */
async function debitWallet({
  userId,
  currency = CURRENCIES.VES,
  amount,
  source,
  referenceId = null,
  description = '',
  metadata = {},
  session: externalSession = null
}) {
  const canonCurrency = getValidCurrency(currency);
  const validAmount = validatePositiveIntegerAmount(amount);
  const field = CURRENCY_FIELD_MAP[canonCurrency];

  if (!source || !Object.values(DEBIT_SOURCES).includes(source)) {
    throw new ValidationError(`Invalid debit source: ${source}`);
  }

  return await withTransaction(async (session) => {
    // Atomic conditional update: balance must be >= amount
    const updatedWallet = await Wallet.findOneAndUpdate(
      {
        userId,
        [field]: { $gte: validAmount }
      },
      {
        $inc: { [field]: -validAmount, version: 1 }
      },
      { new: true, session }
    );

    if (!updatedWallet) {
      // Check if wallet exists to give precise error
      const existing = await Wallet.findOne({ userId }).session(session);
      if (!existing) {
        throw new NotFoundError('Wallet not found for this user.');
      }
      throw new InsufficientBalanceError(`Insufficient ${canonCurrency} balance.`);
    }

    const balanceAfter = updatedWallet[field];
    const balanceBefore = balanceAfter + validAmount;

    const ledgerEntry = await createLedgerEntry(session, {
      userId,
      currency: canonCurrency,
      type: TRANSACTION_TYPES.DEBIT,
      amount: validAmount,
      balanceBefore,
      balanceAfter,
      source,
      referenceId,
      status: TRANSACTION_STATUS.COMPLETED,
      description: description || `Debit for ${source}`,
      metadata
    });

    logger.info(
      { userId, currency: canonCurrency, amount: validAmount, source, referenceId },
      'Wallet debited successfully'
    );

    return {
      wallet: updatedWallet,
      transaction: ledgerEntry
    };
  }, externalSession);
}

module.exports = {
  CURRENCY_FIELD_MAP,
  getValidCurrency,
  validatePositiveIntegerAmount,
  getWallet,
  getTransactions,
  validateBalance,
  createLedgerEntry,
  creditWallet,
  debitWallet
};
