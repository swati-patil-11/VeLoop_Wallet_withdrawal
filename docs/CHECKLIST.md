# VELoop Rewards Wallet & Payout System — Submission Checklist

Every item in this checklist has been independently implemented, tested, and verified against the automated test suite and running application.

---

## 1. Core Architecture & Rules
- [x] **Backend Owns All Financial Logic**: The client transmits only identifiers (`method`, `optionId`), validated payout recipient fields, and an `Idempotency-Key` header.
- [x] **Client Amount Tampering Defense**: Body containing `amount`, `requiredAmount`, `currency`, or `balance` is rejected with HTTP 400 Bad Request by strict Zod validation.
- [x] **Integer Balances**: All money-like values (VEs, SVEs, Gems, Tokens, Spins) are whole integers (`Number.isInteger`, min: 0). Floating point arithmetic is forbidden.
- [x] **No Invented Wallet Sections**: Wallet shows strictly the authentic VELoop currencies: VEs, SVEs, Gems, Tokens, Spins.
- [x] **Client Storage Security**: Client `localStorage` stores only non-sensitive tokens (JWT); no wallet balances or financial states are stored in browser storage.
- [x] **Option A Financial Strategy**: Deducts VEs immediately upon withdrawal creation inside a MongoDB ACID transaction. Rejections and cancellations issue an idempotent compensating credit (`WITHDRAWAL_REFUND`).

---

## 2. Models & Database Layer
- [x] **User Model**: UUID `userId`, unique lowercase `email`, `passwordHash`, role (`USER`, `ADMIN`), status (`ACTIVE`, `SUSPENDED`, `FLAGGED`), timestamps.
- [x] **Wallet Model**: `userId` unique indexed, `ves`, `sves`, `gems`, `tokens`, `spins` (all min 0, integer validated), `version`.
- [x] **WalletTransaction Model**: UUID `transactionId` unique, `userId`, `currency`, `type` (`CREDIT`, `DEBIT`), `amount` (min 1 integer), `balanceBefore`, `balanceAfter`, `source`, `referenceId`, `status`.
- [x] **Partial Unique Index on Ledger**: Compound partial unique index on `{ referenceId: 1, source: 1 }` for `WITHDRAWAL` and `WITHDRAWAL_REFUND` prevents double posting or double refunding at the database engine level.
- [x] **PayoutOption Model**: `optionId` unique, `methodId`, `methodName`, `payoutValue`, `payoutCurrency`, `requiredAmount` (VEs), `active`, `eligibility`, `requiredFields`, `sortOrder`.
- [x] **Withdrawal Model**: UUID `withdrawalId` unique, `userId`, `method`, `optionId`, `currencyAmount`, `payoutAmount`, `payoutDetails` (masked), `status`, `rejectionReason`, `transactionId`, `refundTransactionId`, `idempotencyKey`, `statusHistory`.
- [x] **Compound Unique Index on Withdrawal**: `{ userId: 1, idempotencyKey: 1 }` guarantees zero duplicate withdrawals on network retries or double clicks.
- [x] **AuditLog Model**: Append-only log recording actor, role, action, target, reference, IP, user-agent, metadata.
- [x] **IdempotencyRecord Model**: Generic TTL indexed store for endpoint snapshot replays.

---

## 3. Services & Security
- [x] **Wallet Service (`src/services/walletService.js`)**: All balance changes go through this service only. No direct balance mutations elsewhere.
- [x] **Atomic Conditional Updates**: Debit uses single `findOneAndUpdate({ userId, [currency]: { $gte: amount } }, { $inc: { [currency]: -amount } })`. Read-then-write is prohibited.
- [x] **withTransaction Helper**: Wraps operations in MongoDB transactions with exponential backoff retry on `TransientTransactionError` and `UnknownTransactionCommitResult`.
- [x] **JWT Authentication**: Authenticate middleware verifies token; `userId` comes strictly from verified token, never query/body.
- [x] **Role Authorization**: `authorize('ADMIN')` protects admin and internal routes.
- [x] **Zod Validation**: Strict schemas on body, params, query, and headers.
- [x] **Rate Limiting**: Moderate global limiter, strict limiter on login/register (20 per 15 min), and strict limiter on withdrawals (10 per hour).
- [x] **NoSQL Injection Defense**: Recursive sanitization stripping `$` and `.` characters.
- [x] **Risk Service**: Blocks FLAGGED and SUSPENDED accounts, enforces min account age and status eligibility, checks 1-hour velocity, and enforces daily withdrawal cap.

---

## 4. APIs & State Machine
- [x] **`GET /api/wallet`**: Returns authenticated user's wallet only. Query parameters (`?userId=`) are ignored.
- [x] **`GET /api/wallet/transactions`**: Paginated ledger history with total, page, totalPages.
- [x] **`GET /api/wallet/summary`**: Wallet balances + 5 recent transactions + pending withdrawals count and total VEs.
- [x] **`GET /api/payout/methods`**: Returns active payout methods (UPI, PayPal, Amazon, Google Play) dynamically.
- [x] **`GET /api/payout/options/:method`**: Returns active denominations with computed per-user `eligible` and `reason` flags.
- [x] **`POST /api/withdrawals`**: Accepts only `method`, `optionId`, `payoutDetails`, and `Idempotency-Key` header. Deducts VEs atomically inside a transaction.
- [x] **`POST /api/withdrawals/:id/cancel`**: User cancels pending withdrawal; triggers `WITHDRAWAL_REFUND` compensating credit.
- [x] **Admin Withdrawal State Machine**: Enforces `PENDING` → `PROCESSING` → `APPROVED` and `PENDING`/`PROCESSING` → `REJECTED`. Terminal states cannot change.
- [x] **Admin Reject**: Requires `rejectionReason` and performs an idempotent refund restoring user's VEs.

---

## 5. Seed Data & Reconciliation
- [x] **UPI Denominations Seeded**: Calibrated to real VELoop tiers (INR 10 = 2,400 VEs ... INR 1,000 = 150,000 VEs).
- [x] **Placeholder Methods Marked**: PayPal, Amazon Gift Card, and Google Play Gift Card seeded with placeholder ratios and documented in `ASSUMPTIONS.md`.
- [x] **Demo Users Seeded**:
  - `demo@veloop.test` (User, VEs 25,000, SVEs 5,000, Gems 100, Tokens 500, Spins 3 + full ledger history).
  - `demo2@veloop.test` (Secondary user for multi-tenant isolation tests).
  - `admin@veloop.test` (Admin).
- [x] **Ledger Reconciles Exactly**: `npm run reconcile` recomputes balance from ledger (`wallet = sum(credits) - sum(debits)`) reporting 0 drift.
- [x] **Production Guard**: Seed refuses to execute in production unless `SEED_ALLOW_PROD=true`.

---

## 6. Automated Testing (13 Required Scenarios)
- [x] **Test 1**: Normal credit (1000 + 500 = 1500 VEs, ledger balanceBefore/After).
- [x] **Test 2**: Normal withdrawal (1500 - 1000 = 500 VEs, debit ledger linked to withdrawal).
- [x] **Test 3**: Insufficient balance (500 VEs, needing 1000+ -> rejected, nothing changes).
- [x] **Test 4**: Double-click (two identical requests with same Idempotency-Key fired in parallel -> 1 withdrawal, 1 debit).
- [x] **Test 5**: Concurrent race (10,000 balance, two requests for 8,000 VEs in parallel -> 1 succeeds, balance never negative).
- [x] **Test 6**: Invalid payout option (fake optionId -> rejected; inactive option -> rejected).
- [x] **Test 7**: Multi-tenant isolation (userA token with `?userId=userB` and userA requesting userB's withdrawal -> never exposes data).
- [x] **Test 8**: Rejected withdrawal (balance restored once, refund ledger created, second reject does not double refund).
- [x] **Test 9**: API manipulation (sending `amount`, `requiredAmount`, `currency` -> rejected with 400).
- [x] **Test 10**: Auth check (unauthenticated returns 401; normal user accessing admin routes returns 403).
- [x] **Test 11**: Rate limiting (triggers HTTP 429 on excessive withdrawal requests).
- [x] **Test 12**: Ledger reconciliation (asserts `wallet = sum(credits) - sum(debits)` after complex sequence).
- [x] **Test 13**: Transaction rollback (simulated failure after debit rolls back completely, wallet unchanged).
- [x] **All Tests Green**: `npm test` and `npm run test:coverage` pass 100%.

---

## 7. Demo Frontend & DevOps
- [x] **React 18 + Vite SPA**: Clean routes `/login`, `/wallet`, `/payout`.
- [x] **Wallet Page**: Displays all 5 currencies, paginated ledger, recent redemptions with status badges and Cancel button for PENDING.
- [x] **Payout Page**: Dynamic method selection, options with disabled state and eligibility reasons, dynamic required destination fields, confirmation modal, UUID idempotency key per attempt.
- [x] **Security DevTools Box**: Interactive component allowing evaluators to send tampered requests and view the HTTP 400 rejection in real-time.
- [x] **Docker & Compose**: `Dockerfile` for backend, `Dockerfile` for frontend with Nginx, `docker-compose.yml` with single-node MongoDB replica set (`rs0`).
- [x] **Cloud Deployment Configs**: `render.yaml` for backend, `vercel.json` and `_redirects` for frontend SPA routing.
- [x] **Post-deploy Smoke Script**: `scripts/smoke.sh` executable test suite.

