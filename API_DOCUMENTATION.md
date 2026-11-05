# VELoop Rewards Wallet & Payout System — API Documentation

This document describes all endpoints provided by the VELoop Rewards Wallet & Payout System.

Base URL: `http://localhost:5000/api`

---

## Authentication & Headers
- **Authorization**: Bearer JWT (`Authorization: Bearer <token>`) required for all authenticated endpoints.
- **Idempotency-Key**: UUID v4 required in header for mutation endpoints (e.g. `POST /api/withdrawals`).
- **Content-Type**: `application/json`

---

## Summary of Endpoints
Detailed schemas, request/response bodies, error codes, and curl examples are documented in this file.

