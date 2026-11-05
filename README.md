# VELoop Rewards Wallet & Payout System

A robust, enterprise-grade, backend-driven rewards wallet and payout system featuring an immutable double-entry ledger, multi-document atomic MongoDB transactions, idempotent withdrawal pipelines, fraud/velocity risk controls, full audit logging, and a React 18 interface.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Financial State Strategy (Option A vs Option B)](#financial-state-strategy)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Quick Start & Setup](#quick-start--setup)
6. [Testing & Coverage](#testing--coverage)
7. [Evaluator Guide & Testing Steps](#evaluator-guide--testing-steps)
8. [Security & Tamper Resistance](#security--tamper-resistance)
9. [Final Challenge: Scaling to 1,000,000 Users](#final-challenge-scaling-to-1000000-users)
10. [Submission Checklist](#submission-checklist)

---

## Architecture Overview
The system follows a strict backend-driven financial paradigm:
- **Backend owns all financial logic**: The client only sends abstract identifiers (`method`, `optionId`), validated payout recipient information (e.g., `upiId`), and a unique `Idempotency-Key` header. Clients are never permitted to supply amounts, currencies, balances, or required VEs.
- **Atomic Operations**: All wallet balance modifications and ledger transactions occur inside a single MongoDB ACID transaction using conditional atomic queries (`findOneAndUpdate` with `$gte`).
- **Immutable Ledger**: Transactions are strictly append-only. Compensating entries (`WITHDRAWAL_REFUND`) reverse rejected or cancelled withdrawals.
