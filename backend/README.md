# VELoop Rewards Wallet & Payout System — Backend

Backend service providing atomic wallet management, double-entry immutable ledger, payout configuration, withdrawal processing state machine, risk services, and audit logging.

## Technologies
- Node.js 20+
- Express
- MongoDB with Mongoose (Replica Set required for multi-document ACID transactions)
- JWT + Bcrypt Authentication
- Zod schema validation
- Winston / Pino structured logging
- Helmet, Rate Limiting, Mongo Sanitize

See main repository [README.md](../README.md) for full documentation, testing, and deployment instructions.
