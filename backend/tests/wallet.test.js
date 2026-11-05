require('./setup');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const app = require('../src/app');
const walletService = require('../src/services/walletService');
const { Wallet, WalletTransaction, Withdrawal } = require('../src/models');
const { reconcileUser } = require('../src/utils/reconcile');
const { createTestUser } = require('./helpers');
const {
  CURRENCIES,
  CREDIT_SOURCES,
  DEBIT_SOURCES,
  TRANSACTION_TYPES
} = require('../src/config/constants');
const { withTransaction } = require('../src/utils/transactionHelper');

describe('Wallet & Ledger Service (Scenarios 1, 12, 13)', () => {
  // SCENARIO 1: Normal credit: 1000 + 500 = 1500 VEs, ledger entry correct (balanceBefore/After)
  test('Scenario 1: Normal credit: 1000 + 500 = 1500 VEs, ledger entry correct', async () => {
    const { user } = await createTestUser({ walletBalances: { ves: 1000 } });

    const result = await walletService.creditWallet({
      userId: user.userId,
      currency: CURRENCIES.VES,
      amount: 500,
      source: CREDIT_SOURCES.REWARD,
      description: 'Daily activity reward'
    });

    expect(result.wallet.ves).toBe(1500);

    // Verify ledger entry
    const ledger = await WalletTransaction.findOne({
      userId: user.userId,
      transactionId: result.transaction.transactionId
    });

    expect(ledger).toBeDefined();
    expect(ledger.type).toBe(TRANSACTION_TYPES.CREDIT);
    expect(ledger.amount).toBe(500);
    expect(ledger.balanceBefore).toBe(1000);
    expect(ledger.balanceAfter).toBe(1500);
    expect(ledger.source).toBe(CREDIT_SOURCES.REWARD);
  });

  // SCENARIO 12: Ledger reconciliation: asserts wallet = sum(credits) - sum(debits) after a mixed scenario
  test('Scenario 12: Ledger reconciliation after a complex mixed sequence of credits & debits', async () => {
    const { user } = await createTestUser({ walletBalances: { ves: 0 } });
    const uid = user.userId;

    // Mixed operations:
    // +2000 (BONUS)
    await walletService.creditWallet({ userId: uid, currency: 'VES', amount: 2000, source: CREDIT_SOURCES.BONUS });
    // +1500 (AD_REWARD)
    await walletService.creditWallet({ userId: uid, currency: 'VES', amount: 1500, source: CREDIT_SOURCES.AD_REWARD });
    // -1200 (WITHDRAWAL debit)
    await walletService.debitWallet({ userId: uid, currency: 'VES', amount: 1200, source: DEBIT_SOURCES.WITHDRAWAL });
    // +800 (REFERRAL)
    await walletService.creditWallet({ userId: uid, currency: 'VES', amount: 800, source: CREDIT_SOURCES.REFERRAL });
    // -600 (WITHDRAWAL debit)
    await walletService.debitWallet({ userId: uid, currency: 'VES', amount: 600, source: DEBIT_SOURCES.WITHDRAWAL });
    // +600 (WITHDRAWAL_REFUND)
    await walletService.creditWallet({
      userId: uid,
      currency: 'VES',
      amount: 600,
      source: CREDIT_SOURCES.WITHDRAWAL_REFUND,
      referenceId: 'ref_cancelled_tx_123'
    });

    // Net expected: 2000 + 1500 - 1200 + 800 - 600 + 600 = 3100
    const wallet = await walletService.getWallet(uid);
    expect(wallet.ves).toBe(3100);

    // Run reconciliation engine
    const recon = await reconcileUser(uid);
    expect(recon.reconciled).toBe(true);
    expect(recon.discrepancies.length).toBe(0);
    expect(recon.balances.VES.drift).toBe(0);
    expect(recon.balances.VES.walletBalance).toBe(3100);
    expect(recon.balances.VES.net).toBe(3100);
    expect(recon.balances.VES.credits).toBe(4900);
    expect(recon.balances.VES.debits).toBe(1800);
  });

  // SCENARIO 13: Transaction rollback: simulate a failure after debit and assert wallet is unchanged
  test('Scenario 13: Transaction rollback leaves wallet balance completely unchanged on failure', async () => {
    const { user } = await createTestUser({ walletBalances: { ves: 5000 } });
    const uid = user.userId;

    // Simulate an atomic operation where debit succeeds but subsequent creation throws an error
    let errorThrown = false;
    try {
      await withTransaction(async (session) => {
        // Step 1: Debit 2000 VEs
        await walletService.debitWallet({
          userId: uid,
          currency: 'VES',
          amount: 2000,
          source: DEBIT_SOURCES.WITHDRAWAL,
          referenceId: 'failed_withdrawal_simulation',
          session
        });

        // Step 2: Force an intentional crash/rollback
        throw new Error('SIMULATED_FAILURE_AFTER_DEBIT');
      });
    } catch (err) {
      errorThrown = true;
      expect(err.message).toBe('SIMULATED_FAILURE_AFTER_DEBIT');
    }

    expect(errorThrown).toBe(true);

    // Assert wallet is completely unchanged (still 5000)
    const wallet = await Wallet.findOne({ userId: uid });
    expect(wallet.ves).toBe(5000);

    // Assert no orphaned ledger entry was committed
    const ledger = await WalletTransaction.findOne({
      userId: uid,
      referenceId: 'failed_withdrawal_simulation'
    });
    expect(ledger).toBeNull();
  });
});

