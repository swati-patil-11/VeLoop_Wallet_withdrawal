# VELoop Rewards Wallet & Payout System — System Architecture

## Architectural Principles
1. **Zero Client Trust**: The frontend is only a UI display. The backend owns 100% of the money and balance arithmetic.
2. **Double-Entry Ledger Invariant**: Every change to a wallet balance must be accompanied by an immutable transaction record storing `balanceBefore` and `balanceAfter`.
3. **Atomic Multi-Document Transactions**: Balance deductions and state mutations occur within a single MongoDB ACID transaction (`session`).
4. **Idempotency by Design**: Duplicate network requests (e.g. double-clicks or mobile retries) produce strictly one financial mutation.
5. **Compensating Refunds (Option A)**: Cancellations and rejections issue compensating credit entries (`WITHDRAWAL_REFUND`) preserving a full audit trail.

---

## Architectural Layers

```mermaid
flowchart TD
    Client["React 18 SPA (Vite + Axios + Bootstrap)"] -->|HTTPS + JWT + Idempotency-Key| Gateway["API Gateway / Express 4"]
    
    subgraph Express_Middleware ["Security & Inspection Middleware"]
        Gateway --> Helmet["Helmet (Security Headers)"]
        Helmet --> CORS["CORS (Env Configured)"]
        CORS --> RateLimiter["Rate Limiters (Global, Auth, Mutation, Withdrawal)"]
        RateLimiter --> Sanitize["Mongo Sanitize (NoSQL Injection Defense)"]
        Sanitize --> Auth["JWT Authenticate & Role Authorize"]
        Auth --> Validation["Zod Strict Schema Validation"]
    end

    subgraph Service_Domain ["Core Domain Services"]
        Validation --> Controllers["Controllers (Auth, Wallet, Payout, Withdrawal, Admin)"]
        Controllers --> RiskService["Risk & Velocity Service"]
        Controllers --> PayoutService["Payout Option Service"]
        Controllers --> WithdrawalService["Withdrawal Service (State Machine)"]
        Controllers --> WalletService["Wallet Service (Atomic Math)"]
        
        WithdrawalService --> TxHelper["withTransaction() ACID Helper"]
        WalletService --> TxHelper
    end

    subgraph Persistence_Layer ["MongoDB 7.0 Replica Set (WiredTiger)"]
        TxHelper --> DB_Wallets[("wallets collection")]
        TxHelper --> DB_Ledger[("wallettransactions collection")]
        TxHelper --> DB_Withdrawals[("withdrawals collection")]
        TxHelper --> DB_Audit[("auditlogs collection")]
        TxHelper --> DB_Idempotency[("idempotencyrecords collection")]
    end
```

---

## Withdrawal Flow Sequence Diagram

The diagram below details the exact transactional flow from user click to ledger persistence and administrative review.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant API as Express API
    participant Middleware as Auth / Zod / RateLimiter
    participant WithdrawalSvc as Withdrawal Service
    participant RiskSvc as Risk Service
    participant WalletSvc as Wallet Service
    participant DB as MongoDB Replica Set
    actor Admin as Administrator

    User->>API: POST /api/withdrawals (method, optionId, payoutDetails) [Header: Idempotency-Key]
    API->>Middleware: Verify JWT & Validate Body (Reject client amounts/balances)
    
    alt Body contains amount or requiredAmount
        Middleware-->>User: HTTP 400 Bad Request (Validation Error)
    end

    Middleware->>WithdrawalSvc: createWithdrawal(userId, method, optionId, ...)
    WithdrawalSvc->>DB: Check existing (userId, idempotencyKey)
    alt Idempotency Key Exists
        DB-->>WithdrawalSvc: Return existing record
        WithdrawalSvc-->>User: HTTP 200 (duplicate: true, original snapshot)
    end

    WithdrawalSvc->>DB: Load active PayoutOption
    WithdrawalSvc->>RiskSvc: performRiskChecks(user, option)
    RiskSvc->>DB: Check 1h velocity count & daily cap
    
    alt Velocity or Daily Cap Exceeded
        RiskSvc->>DB: Write SUSPICIOUS_ACTIVITY AuditLog
        RiskSvc-->>User: HTTP 429 ("This request requires additional verification.")
    end

    WithdrawalSvc->>DB: Start MongoDB ACID Transaction (session)
    
    WithdrawalSvc->>WalletSvc: debitWallet(VES, option.requiredAmount, session)
    WalletSvc->>DB: findOneAndUpdate({userId, ves: {$gte: amount}}, {$inc: {ves: -amount}})
    
    alt Balance < Required VEs
        DB-->>WalletSvc: No document matched
        WalletSvc-->>WithdrawalSvc: InsufficientBalanceError
        WithdrawalSvc->>DB: Abort Transaction
        WithdrawalSvc-->>User: HTTP 400 ("Insufficient VEs balance.")
    end

    WalletSvc->>DB: Insert WalletTransaction (type: DEBIT, source: WITHDRAWAL)
    WithdrawalSvc->>DB: Insert Withdrawal (status: PENDING, transactionId)
    WithdrawalSvc->>DB: Insert AuditLog (action: WITHDRAWAL_CREATED)
    WithdrawalSvc->>DB: Commit Transaction
    WithdrawalSvc-->>User: HTTP 200 ("Withdrawal submitted successfully.", status: PENDING)

    opt Admin Review (Rejection / Refund Flow)
        Admin->>API: POST /api/admin/withdrawals/:id/reject (rejectionReason)
        API->>WithdrawalSvc: adminReject(withdrawalId, adminId, reason)
        WithdrawalSvc->>DB: Start Transaction
        WithdrawalSvc->>DB: findOneAndUpdate({withdrawalId, status: {$in: ['PENDING','PROCESSING']}}, {status: 'REJECTED'})
        WithdrawalSvc->>WalletSvc: creditWallet(VES, amount, source: WITHDRAWAL_REFUND)
        WalletSvc->>DB: $inc: {ves: +amount} + insert WalletTransaction (source: WITHDRAWAL_REFUND)
        WithdrawalSvc->>DB: Insert AuditLog (action: WITHDRAWAL_REJECTED)
        WithdrawalSvc->>DB: Commit Transaction
        WithdrawalSvc-->>Admin: HTTP 200 (Withdrawal rejected and refunded)
    end
```

---

## Failure Handling & Edge Case Matrix

| Failure Point | System Behavior | Data Consistency Result |
|---------------|-----------------|-------------------------|
| **Network drop during withdrawal creation** | Client retries with same `Idempotency-Key`. | Unique compound index `{userId: 1, idempotencyKey: 1}` returns original response. Zero duplicate debits. |
| **Simulated server crash after debit** | MongoDB multi-document transaction aborts automatically. | Balance change rolls back completely. Zero orphaned ledger rows. |
| **Insufficient user funds** | Conditional update `{ ves: { $gte: amount } }` matches 0 documents. | `InsufficientBalanceError` thrown immediately. No write persisted. |
| **Admin double-click on reject** | Conditional update matches `{ status: { $in: ['PENDING', 'PROCESSING'] } }`. Second call matches 0 docs. Unique partial index on `(referenceId, source)` also prevents duplicate refund. | Refund executed exactly once. User balance restored only once. |
| **Tampered client request** | Zod `.strict()` schema detects extraneous fields (`amount`, `balance`). | Rejection with HTTP 400 before financial services are invoked. |
| **Account suspended or flagged** | `riskService` intercept blocks request. | Account cannot initiate withdrawals; `SUSPICIOUS_ACTIVITY` audit log logged. |

