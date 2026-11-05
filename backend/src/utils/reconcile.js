require('dotenv').config();
const mongoose = require('mongoose');
const { Wallet, WalletTransaction } = require('../models');
const { CURRENCY_LIST, TRANSACTION_TYPES, TRANSACTION_STATUS } = require('../config/constants');
const { connectDB } = require('../config/db');
const logger = require('./logger');

const CURRENCY_FIELD_MAP = {
  VES: 'ves',
  SVES: 'sves',
  GEMS: 'gems',
  TOKENS: 'tokens',
  SPINS: 'spins'
};

/**
 * Reconcile ledger balances vs. wallet balances for a specific user
 * @param {string} userId
 * @param {import('mongoose').ClientSession} [session]
 */
async function reconcileUser(userId, session = null) {
  const wallet = await Wallet.findOne({ userId }).session(session);
  if (!wallet) {
    return {
      userId,
      reconciled: true,
      message: 'No wallet found for user',
      discrepancies: []
    };
  }

  // Aggregate ledger by currency and type
  const ledgerAggregation = await WalletTransaction.aggregate([
    {
      $match: {
        userId,
        status: TRANSACTION_STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: { currency: '$currency', type: '$type' },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]).session(session);

  const ledgerTotals = {};
  for (const c of CURRENCY_LIST) {
    ledgerTotals[c] = { credits: 0, debits: 0, net: 0 };
  }

  for (const item of ledgerAggregation) {
    const cur = item._id.currency;
    const typ = item._id.type;
    if (ledgerTotals[cur]) {
      if (typ === TRANSACTION_TYPES.CREDIT) {
        ledgerTotals[cur].credits += item.totalAmount;
      } else if (typ === TRANSACTION_TYPES.DEBIT) {
        ledgerTotals[cur].debits += item.totalAmount;
      }
    }
  }

  const discrepancies = [];
  let isAllReconciled = true;

  for (const cur of CURRENCY_LIST) {
    const field = CURRENCY_FIELD_MAP[cur];
    const actualWalletBalance = wallet[field] || 0;
    const computedNet = ledgerTotals[cur].credits - ledgerTotals[cur].debits;
    const drift = actualWalletBalance - computedNet;

    ledgerTotals[cur].net = computedNet;
    ledgerTotals[cur].walletBalance = actualWalletBalance;
    ledgerTotals[cur].drift = drift;

    if (drift !== 0) {
      isAllReconciled = false;
      discrepancies.push({
        currency: cur,
        walletBalance: actualWalletBalance,
        ledgerNet: computedNet,
        credits: ledgerTotals[cur].credits,
        debits: ledgerTotals[cur].debits,
        drift
      });
    }
  }

  return {
    userId,
    reconciled: isAllReconciled,
    balances: ledgerTotals,
    discrepancies
  };
}

/**
 * Reconcile all users in the system
 */
async function reconcileAll() {
  const wallets = await Wallet.find({}).lean();
  logger.info(`Reconciling ${wallets.length} wallets against the immutable ledger...`);

  const results = [];
  let totalDiscrepancies = 0;

  for (const w of wallets) {
    const res = await reconcileUser(w.userId);
    results.push(res);
    if (!res.reconciled) {
      totalDiscrepancies += res.discrepancies.length;
    }
  }

  return {
    totalWallets: wallets.length,
    reconciledWallets: results.filter((r) => r.reconciled).length,
    unreconciledWallets: results.filter((r) => !r.reconciled).length,
    totalDiscrepancies,
    results
  };
}

async function runCli() {
  await connectDB();
  logger.info('--- RUNNING LEDGER RECONCILIATION ---');

  const report = await reconcileAll();

  console.log('\n================================================================');
  console.log('             VELoop Rewards Ledger Reconciliation Report        ');
  console.log('================================================================');
  console.log(`Total Wallets Checked: ${report.totalWallets}`);
  console.log(`Fully Reconciled:     ${report.reconciledWallets}`);
  console.log(`Discrepancies Found:  ${report.totalDiscrepancies}`);
  console.log('----------------------------------------------------------------');

  for (const userRes of report.results) {
    console.log(`User ID: ${userRes.userId} | Status: ${userRes.reconciled ? '✓ RECONCILED (0 drift)' : '✗ DRIFT DETECTED'}`);
    for (const cur of CURRENCY_LIST) {
      const data = userRes.balances[cur];
      console.log(
        `  ${cur.padEnd(6)} -> Wallet: ${String(data.walletBalance).padStart(7)} | Credits: ${String(data.credits).padStart(7)} | Debits: ${String(data.debits).padStart(7)} | Net Ledger: ${String(data.net).padStart(7)} | Drift: ${data.drift}`
      );
    }
  }
  console.log('================================================================\n');

  await mongoose.connection.close();
  if (report.totalDiscrepancies > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    logger.error({ error: err.message }, 'Reconciliation failed');
    process.exit(1);
  });
}

module.exports = { reconcileUser, reconcileAll };
