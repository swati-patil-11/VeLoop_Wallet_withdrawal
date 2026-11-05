# VELoop Rewards Wallet & Payout System — API Documentation

Base URL: `http://localhost:5000/api` (or deployed URL)

---

## Table of Contents
1. [Authentication Endpoints](#1-authentication-endpoints)
2. [Wallet & Ledger Endpoints](#2-wallet--ledger-endpoints)
3. [Payout Configuration Endpoints](#3-payout-configuration-endpoints)
4. [Withdrawal Management Endpoints](#4-withdrawal-management-endpoints)
5. [Administrative Review & Audit Endpoints](#5-administrative-review--audit-endpoints)
6. [Internal & Webhook Endpoints](#6-internal--webhook-endpoints)
7. [Standard Error Formats](#7-standard-error-formats)

---

## 1. Authentication Endpoints

### 1.1 Register User
- **Method**: `POST`
- **Path**: `/api/auth/register`
- **Auth**: None (Public, Rate-Limited)
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "name": "Jane Doe",
    "password": "Password123!"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Account registered successfully.",
    "user": {
      "userId": "d748f34d-1768-4509-8472-a43878b663b7",
      "email": "user@example.com",
      "name": "Jane Doe",
      "role": "USER",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-11-05T12:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "wallet": {
      "ves": 0,
      "sves": 0,
      "gems": 0,
      "tokens": 0,
      "spins": 0
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation failure (short password, invalid email).
  - `409 Conflict`: Email already exists.

### 1.2 Login User
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Auth**: None (Public, Rate-Limited: 20 per 15 min)
- **Request Body**:
  ```json
  {
    "email": "demo@veloop.test",
    "password": "DemoUser123!"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged in successfully.",
    "user": {
      "userId": "212c5ff4-4e96-479b-811c-9e3bc1718dcb",
      "email": "demo@veloop.test",
      "name": "Swati VELoop Demo",
      "role": "USER",
      "accountStatus": "ACTIVE"
    },
    "token": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Invalid credentials.
  - `403 Forbidden`: Account suspended.

### 1.3 Get Current Profile
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Auth**: Required (`Authorization: Bearer <token>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": { "userId": "...", "email": "...", "name": "...", "role": "USER" },
    "wallet": { "ves": 25000, "sves": 5000, "gems": 100, "tokens": 500, "spins": 3 }
  }
  ```

---

## 2. Wallet & Ledger Endpoints

### 2.1 Get Wallet Balances
- **Method**: `GET`
- **Path**: `/api/wallet`
- **Auth**: Required
- **Security Invariant**: Any query parameters like `?userId=...` are strictly ignored. Returns authenticated user's wallet only.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "wallet": {
      "ves": 25000,
      "sves": 5000,
      "gems": 100,
      "tokens": 500,
      "spins": 3
    }
  }
  ```

### 2.2 Get Paginated Ledger Transactions
- **Method**: `GET`
- **Path**: `/api/wallet/transactions?page=1&limit=20&currency=VES&type=CREDIT`
- **Auth**: Required
- **Query Parameters**:
  - `page` (optional, default 1)
  - `limit` (optional, default 20, max 100)
  - `currency` (optional: `VES`, `SVES`, `GEMS`, `TOKENS`, `SPINS`)
  - `type` (optional: `CREDIT`, `DEBIT`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "transactions": [
      {
        "transactionId": "b6a71e42-1248-43d9-9528-56c6d2ad3178",
        "userId": "212c5ff4-4e96-479b-811c-9e3bc1718dcb",
        "currency": "VES",
        "type": "DEBIT",
        "amount": 2400,
        "balanceBefore": 27400,
        "balanceAfter": 25000,
        "source": "WITHDRAWAL",
        "referenceId": "5f13d8d6-3e74-4b95-a226-bf40c7499fc7",
        "status": "COMPLETED",
        "description": "Redemption for UPI Transfer (INR 10)",
        "createdAt": "2026-11-04T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 10,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
  ```

### 2.3 Get Wallet Summary
- **Method**: `GET`
- **Path**: `/api/wallet/summary`
- **Auth**: Required
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "summary": {
      "wallet": { "ves": 25000, "sves": 5000, "gems": 100, "tokens": 500, "spins": 3 },
      "recentTransactions": [ /* 5 most recent transactions */ ],
      "pendingWithdrawals": {
        "count": 1,
        "totalVes": 2400
      }
    }
  }
  ```

---

## 3. Payout Configuration Endpoints

### 3.1 Get Available Payout Methods
- **Method**: `GET`
- **Path**: `/api/payout/methods`
- **Auth**: Required
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "methods": [
      {
        "methodId": "upi",
        "name": "UPI Transfer",
        "description": "Instant transfer directly to your UPI ID (VPA)",
        "requiredFields": ["upiId"]
      },
      {
        "methodId": "paypal",
        "name": "PayPal Cash",
        "description": "Redeem funds sent directly to your PayPal account email",
        "requiredFields": ["email"]
      }
    ]
  }
  ```

### 3.2 Get Payout Options by Method
- **Method**: `GET`
- **Path**: `/api/payout/options/:method`
- **Auth**: Required
- **Description**: Dynamically calculates user eligibility and reasons for disabling options based on balance, account status, and age.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "methodId": "upi",
    "userVes": 25000,
    "options": [
      {
        "optionId": "upi_10",
        "methodName": "UPI Transfer",
        "payoutValue": 10,
        "payoutCurrency": "INR",
        "requiredAmount": 2400,
        "requiredFields": ["upiId"],
        "eligible": true,
        "reason": null
      },
      {
        "optionId": "upi_1000",
        "methodName": "UPI Transfer",
        "payoutValue": 1000,
        "payoutCurrency": "INR",
        "requiredAmount": 150000,
        "requiredFields": ["upiId"],
        "eligible": false,
        "reason": "Insufficient VEs balance."
      }
    ]
  }
  ```

---

## 4. Withdrawal Management Endpoints

### 4.1 Create Withdrawal Request
- **Method**: `POST`
- **Path**: `/api/withdrawals`
- **Auth**: Required
- **Headers**:
  - `Idempotency-Key` (Required, UUID v4)
  - `Content-Type: application/json`
- **Strict Rule**: Body contains ONLY `method`, `optionId`, and `payoutDetails`. Sending any `amount`, `requiredAmount`, `currency` or `balance` results in an immediate **HTTP 400 Bad Request**.
- **Request Body**:
  ```json
  {
    "method": "upi",
    "optionId": "upi_10",
    "payoutDetails": {
      "upiId": "user@okaxis"
    }
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Withdrawal submitted successfully.",
    "duplicate": false,
    "withdrawal": {
      "withdrawalId": "341c2c8d-6976-4d9e-a612-40c242c7590d",
      "userId": "212c5ff4-4e96-479b-811c-9e3bc1718dcb",
      "method": "upi",
      "optionId": "upi_10",
      "currency": "VES",
      "currencyAmount": 2400,
      "payoutAmount": 10,
      "payoutDetails": {
        "upiId": "us***r@okaxis"
      },
      "status": "PENDING",
      "transactionId": "87c4f45d-7524-4f05-8e36-1594e9f78330",
      "requestedAt": "2026-11-05T12:30:00.000Z"
    },
    "wallet": {
      "ves": 22600,
      "sves": 5000,
      "gems": 100,
      "tokens": 500,
      "spins": 3
    }
  }
  ```
- **Duplicate Request (Same Idempotency-Key)**:
  Returns original response snapshot with `duplicate: true`, HTTP 200.

### 4.2 Get User Withdrawals
- **Method**: `GET`
- **Path**: `/api/withdrawals?page=1&limit=20&status=PENDING`
- **Auth**: Required

### 4.3 Get Single Withdrawal
- **Method**: `GET`
- **Path**: `/api/withdrawals/:id`
- **Auth**: Required
- **Security Invariant**: Returns `404 Not Found` if withdrawal belongs to another user.

### 4.4 Cancel Pending Withdrawal
- **Method**: `POST`
- **Path**: `/api/withdrawals/:id/cancel`
- **Auth**: Required (Owner only, while status is `PENDING`)
- **Description**: Changes status to `CANCELLED` and immediately restores VEs via a compensating `WITHDRAWAL_REFUND` credit entry inside one atomic transaction.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Withdrawal cancelled successfully and VEs refunded to wallet.",
    "withdrawal": { "status": "CANCELLED", "refundTransactionId": "..." },
    "wallet": { "ves": 25000, ... }
  }
  ```

---

## 5. Administrative Review & Audit Endpoints

All admin routes require `Authorization: Bearer <token>` where user has role `ADMIN`.

### 5.1 Admin: List Withdrawals
- **Method**: `GET`
- **Path**: `/api/admin/withdrawals?page=1&limit=20&status=PENDING&method=upi`

### 5.2 Admin: Mark as PROCESSING
- **Method**: `POST`
- **Path**: `/api/admin/withdrawals/:id/processing`
- **Request Body**:
  ```json
  { "reviewNote": "Batching for gateway transfer" }
  ```

### 5.3 Admin: Approve Withdrawal
- **Method**: `POST`
- **Path**: `/api/admin/withdrawals/:id/approve`
- **Request Body**:
  ```json
  { "reviewNote": "Payout transaction completed" }
  ```

### 5.4 Admin: Reject Withdrawal
- **Method**: `POST`
- **Path**: `/api/admin/withdrawals/:id/reject`
- **Request Body**:
  ```json
  {
    "rejectionReason": "Invalid UPI ID provided",
    "reviewNote": "Bank returned VPA not found"
  }
  ```
- **Description**: Rejects withdrawal and executes idempotent refund (`WITHDRAWAL_REFUND`) in one transaction.

### 5.5 Admin: View Transactions & Audit Logs
- **Method**: `GET`
- **Path**: `/api/admin/transactions`
- **Method**: `GET`
- **Path**: `/api/admin/audit-logs`

### 5.6 Admin: Update Payout Option Configuration
- **Method**: `PUT`
- **Path**: `/api/admin/payout-options/:optionId`
- **Request Body**:
  ```json
  {
    "active": true,
    "requiredAmount": 19500,
    "payoutValue": 100
  }
  ```
- **Auditing**: Automatically records before/after diff in `auditlogs` with action `PAYOUT_CONFIG_CHANGED`.

---

## 6. Internal & Webhook Endpoints

### 6.1 Internal Credit Wallet
- **Method**: `POST`
- **Path**: `/api/wallet/credit`
- **Auth**: Admin JWT or header `x-internal-api-key: <INTERNAL_API_KEY>`
- **Request Body**:
  ```json
  {
    "targetUserId": "212c5ff4-4e96-479b-811c-9e3bc1718dcb",
    "currency": "VES",
    "amount": 500,
    "source": "AD_REWARD",
    "description": "Watched video ad reward"
  }
  ```

### 6.2 Health Check
- **Method**: `GET`
- **Path**: `/api/health`
- **Auth**: None
- **Response**:
  ```json
  {
    "status": "healthy",
    "database": "connected",
    "timestamp": "2026-11-05T12:45:00.000Z"
  }
  ```

---

## 7. Standard Error Formats

All operational errors return a structured JSON response and never leak stack traces:
```json
{
  "success": false,
  "message": "Insufficient VEs balance.",
  "code": "INSUFFICIENT_BALANCE"
}
```

### Common Error Codes
- `INSUFFICIENT_BALANCE`: Wallet balance is lower than the server-required amount.
- `INVALID_PAYOUT_OPTION`: Selected payout option is missing or deactivated.
- `INACTIVE_PAYOUT_METHOD`: Method is currently deactivated.
- `DUPLICATE_WITHDRAWAL`: Duplicate idempotency key.
- `AUTH_REQUIRED`: Missing or invalid Bearer token.
- `FORBIDDEN`: Insufficient role or account suspended.
- `VALIDATION_ERROR`: Zod schema validation failed (e.g. client tried to send amount).
- `SUSPICIOUS_ACTIVITY`: Velocity limit exceeded or account flagged.
- `RATE_LIMIT_EXCEEDED`: Rate limit window exceeded.
