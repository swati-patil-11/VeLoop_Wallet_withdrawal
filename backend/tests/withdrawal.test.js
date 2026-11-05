require('./setup');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../src/app');
const { Wallet, WalletTransaction, Withdrawal } = require('../src/models');
const { createTestUser, seedTestPayoutOptions } = require('./helpers');
const { ROLES, WITHDRAWAL_STATUS } = require('../src/config/constants');

describe('Withdrawals & Financial State Machine (Scenarios 2, 3, 4, 5, 6, 8, 9)', () => {
  beforeEach(async () => {
    await seedTestPayoutOptions();
  });

  // SCENARIO 2: Normal withdrawal: 1500 - 1000 = 500 VEs, debit ledger linked to withdrawal
  test('Scenario 2: Normal withdrawal deducts correct VEs and links ledger debit', async () => {
    // upi_10 requires 2400 VEs. User has 3400 VEs.
    const { user, token } = await createTestUser({ walletBalances: { ves: 3400 } });
    const idempotencyKey = uuidv4();

    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        method: 'upi',
        optionId: 'upi_10',
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.withdrawal.status).toBe('PENDING');
    expect(res.body.withdrawal.currencyAmount).toBe(2400);
    expect(res.body.wallet.ves).toBe(1000); // 3400 - 2400 = 1000

    // Verify debit ledger entry
    const ledger = await WalletTransaction.findOne({
      userId: user.userId,
      referenceId: res.body.withdrawal.withdrawalId
    });

    expect(ledger).toBeDefined();
    expect(ledger.amount).toBe(2400);
    expect(ledger.balanceBefore).toBe(3400);
    expect(ledger.balanceAfter).toBe(1000);
    expect(ledger.source).toBe('WITHDRAWAL');
  });

  // SCENARIO 3: Insufficient balance: 500 VEs, withdrawal needing 1000+ -> rejected, nothing changes
  test('Scenario 3: Insufficient balance rejected and leaves balance unchanged', async () => {
    const { user, token } = await createTestUser({ walletBalances: { ves: 500 } });
    const idempotencyKey = uuidv4();

    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        method: 'upi',
        optionId: 'upi_10', // requires 2400 VEs
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Insufficient/i);

    // Assert wallet unchanged
    const wallet = await Wallet.findOne({ userId: user.userId });
    expect(wallet.ves).toBe(500);

    // Assert no withdrawal document created
    const count = await Withdrawal.countDocuments({ userId: user.userId });
    expect(count).toBe(0);
  });

  // SCENARIO 4: Double-click: two identical requests with same Idempotency-Key fired in parallel
  test('Scenario 4: Double-click parallel requests produce exactly one withdrawal and one debit', async () => {
    const { user, token } = await createTestUser({ walletBalances: { ves: 5000 } });
    const idempotencyKey = uuidv4();

    const payload = {
      method: 'upi',
      optionId: 'upi_10', // 2400 VEs
      payoutDetails: { upiId: 'user@okaxis' }
    };

    // Fire two identical requests concurrently
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Exactly one was original and one was duplicate snapshot
    const duplicateCount = (res1.body.duplicate ? 1 : 0) + (res2.body.duplicate ? 1 : 0);
    expect(duplicateCount).toBe(1);

    // Exactly one debit of 2400 VEs occurred -> remaining: 2600
    const wallet = await Wallet.findOne({ userId: user.userId });
    expect(wallet.ves).toBe(2600);

    const withdrawalsCount = await Withdrawal.countDocuments({ userId: user.userId });
    expect(withdrawalsCount).toBe(1);

    const ledgerCount = await WalletTransaction.countDocuments({ userId: user.userId, source: 'WITHDRAWAL' });
    expect(ledgerCount).toBe(1);
  });

  // SCENARIO 5: Concurrent withdrawals: balance 10,000, two DIFFERENT idempotency keys, each needing 8,000+ VEs
  test('Scenario 5: Concurrent race condition with different keys permits exactly one to succeed', async () => {
    // upi_test_8000 requires 8000 VEs. Total balance: 10,000 VEs.
    const { user, token } = await createTestUser({ walletBalances: { ves: 10000 } });

    const key1 = uuidv4();
    const key2 = uuidv4();

    const payload = {
      method: 'upi',
      optionId: 'upi_test_8000',
      payoutDetails: { upiId: 'user@okaxis' }
    };

    // Fire in parallel with Promise.all
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key1)
        .send(payload),
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key2)
        .send(payload)
    ]);

    // Exactly one succeeds with 200, one fails with 400 Insufficient Balance
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 400]);

    // Balance must be 2000 (10000 - 8000), never negative!
    const wallet = await Wallet.findOne({ userId: user.userId });
    expect(wallet.ves).toBe(2000);
    expect(wallet.ves).toBeGreaterThanOrEqual(0);

    const successfulWithdrawals = await Withdrawal.countDocuments({ userId: user.userId });
    expect(successfulWithdrawals).toBe(1);
  });

  // SCENARIO 6: Invalid payout option: fake optionId -> rejected; inactive method -> rejected
  test('Scenario 6: Fake optionId and inactive method are rejected', async () => {
    const { token } = await createTestUser({ walletBalances: { ves: 10000 } });

    // Fake optionId
    const resFake = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_non_existent_fake_id',
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(resFake.status).toBe(400);
    expect(resFake.body.message).toMatch(/unavailable/i);

    // Inactive option
    const resInactive = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_inactive',
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(resInactive.status).toBe(400);
    expect(resInactive.body.message).toMatch(/unavailable/i);
  });

  // SCENARIO 8: Rejected withdrawal: balance restored exactly once, refund ledger created, second reject does not double refund
  test('Scenario 8: Admin rejection restores balance exactly once without double refund', async () => {
    const { user, token } = await createTestUser({ walletBalances: { ves: 5000 } });
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });

    // Step 1: Create withdrawal (2400 VEs deducted -> 2600 remaining)
    const createRes = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_10',
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(createRes.status).toBe(200);
    const withdrawalId = createRes.body.withdrawal.withdrawalId;

    // Verify balance is 2600
    let wallet = await Wallet.findOne({ userId: user.userId });
    expect(wallet.ves).toBe(2600);

    // Step 2: Admin rejects withdrawal
    const rejectRes = await request(app)
      .post(`/api/admin/withdrawals/${withdrawalId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rejectionReason: 'Invalid UPI handle'
      });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.withdrawal.status).toBe('REJECTED');
    expect(rejectRes.body.wallet.ves).toBe(5000); // Restored!

    // Verify refund ledger transaction
    const refundTx = await WalletTransaction.findOne({
      userId: user.userId,
      referenceId: withdrawalId,
      source: 'WITHDRAWAL_REFUND'
    });
    expect(refundTx).toBeDefined();
    expect(refundTx.amount).toBe(2400);

    // Step 3: Attempt second reject on same withdrawal -> state machine rejects, NO second refund!
    const secondRejectRes = await request(app)
      .post(`/api/admin/withdrawals/${withdrawalId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rejectionReason: 'Duplicate attempt'
      });

    expect(secondRejectRes.status).toBe(400);

    // Balance remains 5000, NOT 7400!
    wallet = await Wallet.findOne({ userId: user.userId });
    expect(wallet.ves).toBe(5000);

    // Refund ledger count is strictly 1
    const refundTxCount = await WalletTransaction.countDocuments({
      userId: user.userId,
      referenceId: withdrawalId,
      source: 'WITHDRAWAL_REFUND'
    });
    expect(refundTxCount).toBe(1);
  });

  // SCENARIO 9: API manipulation: sending amount, requiredAmount: 1, tampered currency -> rejected (400)
  test('Scenario 9: API manipulation attempting to tamper amount, currency or balance is rejected with 400', async () => {
    const { token } = await createTestUser({ walletBalances: { ves: 5000 } });

    // Client attempts to send requiredAmount: 1
    const resTamperAmount = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_10',
        requiredAmount: 1, // MALICIOUS FIELD
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(resTamperAmount.status).toBe(400);

    // Client attempts to send fake amount
    const resTamperFake = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_10',
        amount: 10, // MALICIOUS FIELD
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(resTamperFake.status).toBe(400);

    // Client attempts to send fake currency
    const resTamperCur = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_10',
        currency: 'USD', // MALICIOUS FIELD
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(resTamperCur.status).toBe(400);

    // A valid request without client amounts succeeds and deducts server-configured amount
    const resValid = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_10',
        payoutDetails: { upiId: 'user@okaxis' }
      });

    expect(resValid.status).toBe(200);
    expect(resValid.body.withdrawal.currencyAmount).toBe(2400); // Server-defined amount
    expect(resValid.body.wallet.ves).toBe(2600); // 5000 - 2400 = 2600
  });
});

