# VELoop Rewards Wallet & Payout System — Cloud Deployment Guide

This guide details the step-by-step production deployment procedure using **MongoDB Atlas** (Free M0 Replica Set), **Render** (Node.js API), and **Vercel** (React 18 SPA).

---

## 1. Database Provisioning: MongoDB Atlas Free Cluster

> **Requirement**: Multi-document ACID transactions require a MongoDB Replica Set. All MongoDB Atlas clusters (including Free M0 clusters) are deployed as 3-node replica sets by default.

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign in.
2. Create a new Project (e.g. `VELoop-Rewards`).
3. Click **Create Deployment** → Select **M0 (Free Tier)** on AWS or Google Cloud.
4. Set Cluster Name: `veloop-rewards-cluster`. Click **Create**.
5. **Database Access (Security)**:
   - Create a database user (e.g. `veloop_app_user`).
   - Generate a strong random password (save it safely).
   - Set privileges to **Read and write to any database**.
6. **Network Access**:
   - Add IP Access List entry: Click **Add IP Address** → Choose **Allow Access from Anywhere** (`0.0.0.0/0`) since Render/Vercel use dynamic outbound IP addresses.
7. **Connection String**:
   - Click **Connect** → **Drivers** (Node.js).
   - Copy connection URI. It will have the following structure:
     ```
     mongodb+srv://veloop_app_user:<password>@veloop-rewards-cluster.xxxx.mongodb.net/veloop_rewards?retryWrites=true&w=majority
     ```
   - Replace `<password>` with your database user password.

---

## 2. Backend Deployment: Render (or Railway)

### Deploy via Render Dashboard
1. Go to [Render.com](https://render.com) and create an account / sign in.
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository: `https://github.com/swati-patil-11/VeLoop_Wallet_withdrawal`.
4. Configure service settings:
   - **Name**: `veloop-rewards-backend`
   - **Region**: Oregon (or closest to your Atlas cluster)
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Instance Type**: Free
5. **Environment Variables**:
   Add the following variables in the Render dashboard:
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `5000` |
   | `MONGO_URI` | `mongodb+srv://veloop_app_user:<pass>@.../veloop_rewards?retryWrites=true&w=majority` |
   | `JWT_SECRET` | *(64-character random string, e.g. run `openssl rand -hex 32`)* |
   | `JWT_EXPIRES_IN` | `7d` |
   | `CORS_ORIGIN` | `https://veloop-wallet.vercel.app` *(update with your Vercel URL once created)* |
   | `ADMIN_BOOTSTRAP_EMAIL` | `admin@veloop.test` |
   | `ADMIN_BOOTSTRAP_PASSWORD` | `AdminPass123!` |
   | `DAILY_WITHDRAWAL_CAP_VES` | `200000` |
   | `MAX_WITHDRAWAL_ATTEMPTS_PER_HOUR` | `5` |
   | `SEED_ALLOW_PROD` | `false` |
6. **Health Check Path**:
   Set Health Check Path to `/api/health`.
7. Click **Create Web Service**.
8. Once deployed, note your public API URL (e.g. `https://veloop-rewards-backend.onrender.com`). Verify by visiting `https://veloop-rewards-backend.onrender.com/api/health` in your browser (should return `{"status":"healthy","database":"connected"}`).

---

## 3. Seed Production Demo Data on MongoDB Atlas

Once the backend is connected to Atlas, seed the demo accounts and payout options once:

```bash
# From your local machine with MONGO_URI pointing to your Atlas cluster:
cd backend
MONGO_URI="mongodb+srv://veloop_app_user:<pass>@.../veloop_rewards?retryWrites=true&w=majority" \
SEED_ALLOW_PROD=true \
npm run seed
```

This seeds:
- Payout options (`upi_10` through `upi_1000`, PayPal, Amazon, Google Play placeholders).
- Demo user `demo@veloop.test` with reconciled 25,000 VEs and historical ledger records.
- Secondary user `demo2@veloop.test`.
- Admin account `admin@veloop.test`.

---

## 4. Frontend Deployment: Vercel (or Netlify)

### Deploy via Vercel Dashboard
1. Go to [Vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New...** → **Project**.
3. Import your GitHub repository: `VeLoop_Wallet_withdrawal`.
4. Configure Project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click Edit → Select `frontend`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `VITE_API_BASE_URL` | `https://veloop-rewards-backend.onrender.com` *(your Render API URL)* |
6. Click **Deploy**.
7. Vercel automatically applies the rewrite rule in `frontend/vercel.json` (`/*` → `/index.html`) to support client-side React Router navigation.
8. Copy your live Vercel URL (e.g. `https://veloop-wallet.vercel.app`).
9. Update the `CORS_ORIGIN` variable on Render to match this Vercel domain.

---

## 5. Post-Deployment Verification & Smoke Test

Run the automated smoke test script against your live deployment:

```bash
# Execute smoke test script
./scripts/smoke.sh https://veloop-rewards-backend.onrender.com
```

The script verifies:
1. Health check `/api/health` (HTTP 200).
2. Login with `demo@veloop.test` (receives valid JWT).
3. Fetch wallet `/api/wallet` (HTTP 200).
4. Fetch payout options `/api/payout/options/upi` (HTTP 200).
5. Create withdrawal with `Idempotency-Key` (HTTP 200).
6. Re-submit with same `Idempotency-Key` (asserts HTTP 200 with `duplicate: true`).
7. Malicious tamper test with client-sent `amount` (asserts HTTP 400).
8. Unauthorized admin access test (asserts HTTP 403).

