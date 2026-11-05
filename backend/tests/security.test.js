require('./setup');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../src/app');
const { createTestUser, seedTestPayoutOptions } = require('./helpers');
const { ROLES } = require('../src/config/constants');

describe('Security, Auth & Isolation (Scenarios 7, 10, 11)', () => {
  beforeEach(async () => {
    await seedTestPayoutOptions();
  });

  // SCENARIO 7: Another user's wallet: userA token with ?userId=userB and requesting userB's withdrawal id
  test("Scenario 7: Multi-tenant isolation: User A cannot access User B's wallet or withdrawal details", async () => {
    const { user: userA, token: tokenA } = await createTestUser({ walletBalances: { ves: 1000 } });
    const { user: userB, token: tokenB } = await createTestUser({ walletBalances: { ves: 9999 } });

    // 1. User A tries to pass ?userId=userB to /api/wallet -> MUST return userA's balance (1000), not userB's (9999)
    const walletRes = await request(app)
      .get(`/api/wallet?userId=${userB.userId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(walletRes.status).toBe(200);
    expect(walletRes.body.wallet.ves).toBe(1000);
    expect(walletRes.body.wallet.ves).not.toBe(9999);

    // 2. User B creates a withdrawal
    const bWithdrawalRes = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        method: 'upi',
        optionId: 'upi_10',
        payoutDetails: { upiId: 'userb@okaxis' }
      });

    expect(bWithdrawalRes.status).toBe(200);
    const bWithdrawalId = bWithdrawalRes.body.withdrawal.withdrawalId;

    // 3. User A requests User B's withdrawal ID -> returns 404 (NotFoundError), never 200 or 403
    const aAccessBRes = await request(app)
      .get(`/api/withdrawals/${bWithdrawalId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(aAccessBRes.status).toBe(404);
  });

  // SCENARIO 10: Unauthenticated access returns 401; normal user calling admin routes returns 403
  test('Scenario 10: Proper HTTP 401 and 403 responses for unauthenticated and unauthorized requests', async () => {
    const { token: userToken } = await createTestUser({ role: ROLES.USER });

    // 1. Unauthenticated request to /api/wallet -> 401
    const unauthWallet = await request(app).get('/api/wallet');
    expect(unauthWallet.status).toBe(401);
    expect(unauthWallet.body.success).toBe(false);

    // 2. Unauthenticated request to /api/withdrawals -> 401
    const unauthWithdrawal = await request(app)
      .post('/api/withdrawals')
      .set('Idempotency-Key', uuidv4())
      .send({ method: 'upi', optionId: 'upi_10', payoutDetails: { upiId: 'user@okaxis' } });
    expect(unauthWithdrawal.status).toBe(401);

    // 3. Normal user calling Admin route /api/admin/withdrawals -> 403 Forbidden
    const userAdminRes = await request(app)
      .get('/api/admin/withdrawals')
      .set('Authorization', `Bearer ${userToken}`);

    expect(userAdminRes.status).toBe(403);
    expect(userAdminRes.body.success).toBe(false);

    // 4. Normal user calling /api/wallet/credit without admin role -> 403 Forbidden
    const userCreditRes = await request(app)
      .post('/api/wallet/credit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        targetUserId: 'some_user',
        currency: 'VES',
        amount: 100,
        source: 'ADMIN_CREDIT'
      });

    expect(userCreditRes.status).toBe(403);
  });

  // SCENARIO 11: Rate limiting triggers 429 on the withdrawal route
  test('Scenario 11: Rate limiting triggers HTTP 429 on excessive withdrawal requests', async () => {
    const { token } = await createTestUser({ walletBalances: { ves: 100000 } });

    // Send rapid requests until rate limit threshold is triggered
    // In setup.js, process.env.RATE_LIMIT_WITHDRAWAL_MAX was set to 5 for test environment
    const responses = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          method: 'upi',
          optionId: 'upi_10',
          payoutDetails: { upiId: `user${i}@okaxis` }
        });
      responses.push(res.status);
    }

    expect(responses).toContain(429);
  });
});
