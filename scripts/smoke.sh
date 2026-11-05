#!/usr/bin/env bash
# ==============================================================================
# VELoop Rewards Wallet & Payout System — Post-Deploy Smoke Test Script
# Usage: ./scripts/smoke.sh [BASE_URL]
# Example: ./scripts/smoke.sh http://localhost:5000
# ==============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:5000}"
API_URL="${BASE_URL}/api"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ PASS:${NC} $1"; }
fail() { echo -e "${RED}✗ FAIL:${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}ℹ INFO:${NC} $1"; }

info "Running Smoke Tests against: $API_URL"

# 1. Health Endpoint
info "Testing GET /api/health..."
HEALTH_RES=$(curl -s -w "\n%{http_code}" "$API_URL/health")
HEALTH_CODE=$(echo "$HEALTH_RES" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RES" | head -n -1)

if [[ "$HEALTH_CODE" == "200" ]]; then
  pass "Health check OK ($HEALTH_CODE)"
else
  fail "Health check failed with code $HEALTH_CODE ($HEALTH_BODY)"
fi

# 2. User Login
info "Testing POST /api/auth/login..."
LOGIN_RES=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@veloop.test","password":"DemoUser123!"}')
LOGIN_CODE=$(echo "$LOGIN_RES" | tail -n1)
LOGIN_BODY=$(echo "$LOGIN_RES" | head -n -1)

if [[ "$LOGIN_CODE" == "200" ]]; then
  TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  pass "User login successful. Token acquired."
else
  fail "Login failed with code $LOGIN_CODE: $LOGIN_BODY"
fi

# 3. GET /api/wallet
info "Testing GET /api/wallet..."
WALLET_RES=$(curl -s -w "\n%{http_code}" "$API_URL/wallet" \
  -H "Authorization: Bearer $TOKEN")
WALLET_CODE=$(echo "$WALLET_RES" | tail -n1)
WALLET_BODY=$(echo "$WALLET_RES" | head -n -1)

if [[ "$WALLET_CODE" == "200" ]]; then
  VES=$(echo "$WALLET_BODY" | grep -o '"ves":[0-9]*' | cut -d':' -f2)
  pass "GET /api/wallet OK. Current VEs: $VES"
else
  fail "GET /api/wallet failed with code $WALLET_CODE"
fi

# 4. GET /api/payout/methods
info "Testing GET /api/payout/methods..."
METHODS_RES=$(curl -s -w "\n%{http_code}" "$API_URL/payout/methods" \
  -H "Authorization: Bearer $TOKEN")
METHODS_CODE=$(echo "$METHODS_RES" | tail -n1)

if [[ "$METHODS_CODE" == "200" ]]; then
  pass "GET /api/payout/methods OK"
else
  fail "GET /api/payout/methods failed with code $METHODS_CODE"
fi

# 5. GET /api/payout/options/upi
info "Testing GET /api/payout/options/upi..."
OPTIONS_RES=$(curl -s -w "\n%{http_code}" "$API_URL/payout/options/upi" \
  -H "Authorization: Bearer $TOKEN")
OPTIONS_CODE=$(echo "$OPTIONS_RES" | tail -n1)

if [[ "$OPTIONS_CODE" == "200" ]]; then
  pass "GET /api/payout/options/upi OK"
else
  fail "GET /api/payout/options/upi failed with code $OPTIONS_CODE"
fi

# 6. Create Withdrawal (Idempotent)
IDEMPOTENCY_KEY=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N | md5sum | head -c 32)
info "Testing POST /api/withdrawals with Idempotency-Key: $IDEMPOTENCY_KEY..."

WITHDRAWAL_RES=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/withdrawals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "method": "upi",
    "optionId": "upi_10",
    "payoutDetails": { "upiId": "smoke_test@okaxis" }
  }')
WITHDRAWAL_CODE=$(echo "$WITHDRAWAL_RES" | tail -n1)
WITHDRAWAL_BODY=$(echo "$WITHDRAWAL_RES" | head -n -1)

if [[ "$WITHDRAWAL_CODE" == "200" ]]; then
  pass "Withdrawal created successfully ($WITHDRAWAL_CODE)"
else
  fail "Withdrawal creation failed ($WITHDRAWAL_CODE): $WITHDRAWAL_BODY"
fi

# 7. Repeat Identical Withdrawal (Idempotency Check)
info "Re-testing POST /api/withdrawals with same Idempotency-Key..."
DUP_RES=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/withdrawals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "method": "upi",
    "optionId": "upi_10",
    "payoutDetails": { "upiId": "smoke_test@okaxis" }
  }')
DUP_CODE=$(echo "$DUP_RES" | tail -n1)
DUP_BODY=$(echo "$DUP_RES" | head -n -1)

if [[ "$DUP_CODE" == "200" ]] && echo "$DUP_BODY" | grep -q '"duplicate":true'; then
  pass "Idempotency verified: Duplicate snapshot returned with duplicate:true"
else
  fail "Idempotency check failed ($DUP_CODE): $DUP_BODY"
fi

# 8. Malicious Tamper Test (Send Malicious Amount -> Expect 400)
info "Testing Client Tamper Defense: injecting client amount..."
TAMPER_KEY=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N | md5sum | head -c 32)
TAMPER_RES=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/withdrawals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $TAMPER_KEY" \
  -d '{
    "method": "upi",
    "optionId": "upi_10",
    "requiredAmount": 1,
    "payoutDetails": { "upiId": "attacker@bank" }
  }')
TAMPER_CODE=$(echo "$TAMPER_RES" | tail -n1)

if [[ "$TAMPER_CODE" == "400" ]]; then
  pass "Tamper defense verified: Client-injected amount rejected with HTTP 400"
else
  fail "Tamper test failed: Expected 400 but got $TAMPER_CODE"
fi

# 9. Unauthorized Role Check (Normal User accessing Admin -> Expect 403)
info "Testing RBAC: Normal user attempting /api/admin/withdrawals..."
RBAC_RES=$(curl -s -w "\n%{http_code}" "$API_URL/admin/withdrawals" \
  -H "Authorization: Bearer $TOKEN")
RBAC_CODE=$(echo "$RBAC_RES" | tail -n1)

if [[ "$RBAC_CODE" == "403" ]]; then
  pass "RBAC verified: Non-admin access rejected with HTTP 403"
else
  fail "RBAC test failed: Expected 403 but got $RBAC_CODE"
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   ALL SMOKE TESTS PASSED SUCCESSFULLY!               ${NC}"
echo -e "${GREEN}======================================================${NC}"
