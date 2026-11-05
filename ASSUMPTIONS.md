# VELoop Rewards Wallet & Payout System — Engineering Assumptions & Architectural Decisions

## 1. Financial State Strategy (Option A vs. Option B)
We evaluated two financial state management strategies:
- **Option A (Chosen): Immediate Deduct & Compensating Refund**
  - When a user submits a withdrawal request, VEs are immediately debited from their wallet balance and an immutable debit transaction is recorded in the ledger within a single atomic MongoDB transaction (`session`).
  - If the withdrawal is later **REJECTED** by an admin or **CANCELLED** by the user, a compensating credit transaction (`WITHDRAWAL_REFUND`) is generated within an atomic session that updates the wallet and changes the withdrawal status to REJECTED or CANCELLED.
  - A unique partial index on `(referenceId, source)` guarantees that a withdrawal can never be refunded more than once at the database level.
  - **Why Option A was chosen**:
    1. **Strict Overdraft Prevention**: Prevents any race condition or double-spending where a user might initiate a withdrawal, then spend those same VEs elsewhere while the withdrawal is pending.
    2. **Simplified Invariants**: The wallet balance reflects spendable funds at all times (`ves >= 0`). There is no need for dual-balance reconciliation or complex multi-bucket balance schemas (`available` vs `reserved` vs `pending`).
    3. **Double-Entry Ledger Integrity**: Every balance shift has a single corresponding ledger record with `balanceBefore` and `balanceAfter`. Compensating entries maintain transparent, auditable history without in-place ledger mutations.
- **Option B (Alternative): Reserved Balance Bucket**
  - In Option B, when a withdrawal is created, VEs move from `available` to `reserved` (`$inc: { ves: -amount, reservedVes: +amount }`). On approval, `reservedVes` is decremented; on rejection, it is returned to `available`.
  - While Option B preserves total equity in a dedicated field, it increases complexity across every transaction, complicates balance reconciliation, and creates race conditions if other balance operations do not account for reserved funds.

## 2. Currency & Balance Semantics
- The VELoop ecosystem uses five distinct currencies: **VEs**, **SVEs**, **Gems**, **Tokens**, and **Spins**.
- All currency balances and transaction amounts are stored as **non-negative integers** (whole units). Floating-point math is strictly forbidden in balance arithmetic.
- Only VEs are redeemable for real-world payouts in this version. Other currencies are part of the rewards ecosystem and can be earned, displayed, and tracked in the ledger.

## 3. Payout Configuration & Tiers
- **UPI Tiers (Calibrated to Live VELoop Specs)**:
  - INR 10: 2,400 VEs (optionId: `upi_10`) [Minimum threshold]
  - INR 25: 5,800 VEs (optionId: `upi_25`)
  - INR 50: 10,000 VEs (optionId: `upi_50`)
  - INR 100: 19,500 VEs (optionId: `upi_100`)
  - INR 150: 28,500 VEs (optionId: `upi_150`)
  - INR 300: 52,500 VEs (optionId: `upi_300`)
  - INR 500: 80,500 VEs (optionId: `upi_500`)
  - INR 1,000: 150,000 VEs (optionId: `upi_1000`)
- **Placeholder Methods & Options**:
  - `paypal`: seeded with placeholder ratios (e.g., $5, $10, $25).
  - `amazon_gift_card`: seeded with placeholder INR voucher tiers.
  - `google_play_gift_card`: seeded with placeholder INR code tiers.
  > **Notice**: As per prompt guidelines, PayPal, Amazon Gift Card, and Google Play Gift Card options use reasonable placeholder values and must be replaced with the exact values shown on the live VELoop Payout page prior to production rollout. All options are stored in MongoDB and dynamically loaded by the API.

## 4. Security & Tamper Resistance
- **Backend Owns All Financial Logic**:
  - The client may only supply identifiers (`method`, `optionId`), validated payout recipient fields (e.g. `upiId`), and an `Idempotency-Key` header.
  - Any request body containing `amount`, `requiredAmount`, `currency`, `balance`, or `payoutAmount` is rejected immediately with HTTP 400 Bad Request.
  - The backend queries the database for the active option, verifies eligibility, enforces account age, status, and velocity limits, and executes atomic conditional deductions.
- **Idempotency**:
  - Every withdrawal requires an `Idempotency-Key` header (UUID v4).
  - A unique compound index on `(userId, idempotencyKey)` at the MongoDB level guarantees that concurrent duplicate requests produce exactly one deduction. Duplicate calls return the original response snapshot with `duplicate: true`.
  - Generic admin credit/debit endpoints also support idempotency via the `IdempotencyRecord` collection with TTL indexes.

## 5. Storage & Database Transactions
- MongoDB multi-document transactions require a replica set.
- **Testing**: Handled automatically using `mongodb-memory-server` in replica set mode (`MongoMemoryReplSet`).
- **Local Dev / Docker**: Configured via a single-node replica set (`mongo:7` running with `--replSet rs0`).
- **Production**: Configured via MongoDB Atlas (which defaults to a 3-node replica set).

## 6. Demo Accounts & Seed Data
- Passwords are encrypted with bcrypt (10 rounds).
- Demo credentials provided for development and grading:
  - User: `demo@veloop.test` / `DemoUser123!` (Seeded with 25,000 VEs, 5,000 SVEs, 100 Gems, 500 Tokens, 3 Spins + matching ledger history)
  - Secondary User: `demo2@veloop.test` / `DemoUser123!` (Used to verify multi-tenant isolation)
  - Admin: `admin@veloop.test` / `AdminPass123!`

