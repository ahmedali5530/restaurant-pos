#!/usr/bin/env bash
#
# run-all-tests.sh — runs ALL tests across ALL services in one command.
#
# Executes every test suite in the POSR stack:
#   - Gateway: jwt, jwt-roles, rate-limiter, revocation-store, audit-log, surreal-client
#   - API: session-auth, surreal-client
#   - Payments: session-auth, surreal-client, payment-credential.crypto, paypal.gateway.bypass, payment-drivers.business
#   - Printing: session-auth, print-helpers.business
#   - Tracking-api: session-auth, surreal-client
#   - Sync-service: sync-manager.business
#   - Frontend (vitest): all src/**/*.test.ts files (fiscal, integrations, lib)
#
# Usage:
#   ./run-all-tests.sh                    # run all tests
#   ./run-all-tests.sh --service gateway   # run only gateway tests
#   ./run-all-tests.sh --verbose           # show full test output
#
# Exit code: 0 if all tests pass, 1 if any fail.
#
# Prerequisites:
#   - Node.js 20+
#   - npm or bun installed
#   - Dependencies installed in each service directory (npm install)
#   - For frontend tests: bun install + vitest
#
# CI/CD integration:
#   - This script is designed to be run in CI (GitHub Actions, GitLab CI, etc.)
#   - Set TEST_REPORT_DIR env var to write JUnit-style reports (future)
#   - Each service's tests are run independently — one failure doesn't stop others

set -eo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=false
SERVICE_FILTER=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Results tracking
declare -A PASS_COUNT
declare -A FAIL_COUNT
TOTAL_PASS=0
TOTAL_FAIL=0

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case $1 in
    --service)
      SERVICE_FILTER="$2"
      shift 2
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--service gateway|api|payments|printing|tracking|sync|frontend] [--verbose]"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

section() {
  echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $*${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

run_tests() {
  local service="$1"
  shift
  local dir="$1"
  shift
  local test_files=("$@")

  if [[ -n "$SERVICE_FILTER" && "$service" != "$SERVICE_FILTER" ]]; then
    return 0
  fi

  section "Testing: $service"

  # Install deps if needed
  if [[ ! -d "$dir/node_modules" ]]; then
    echo "  Installing dependencies..."
    (cd "$dir" && npm install --no-audit --no-fund --silent 2>/dev/null)
  fi

  local pass=0
  local fail=0

  for test_file in "${test_files[@]}"; do
    local full_path="$dir/$test_file"
    if [[ ! -f "$full_path" ]]; then
      echo -e "  ${YELLOW}⚠${NC}  $test_file (not found — skipping)"
      continue
    fi

    # Run the test — capture output for non-verbose mode
    output=""
    exit_code=0
    if $VERBOSE; then
      echo -e "  Running: $test_file"
      (cd "$dir" && GATEWAY_JWT_SECRET="${TEST_JWT_SECRET:-test}" SURREAL_USER=test SURREAL_PASS=test node --test "$test_file" 2>&1) || exit_code=$?
    else
      output=$(cd "$dir" && GATEWAY_JWT_SECRET="${TEST_JWT_SECRET:-test}" SURREAL_USER=test SURREAL_PASS=test node --test "$test_file" 2>&1) || exit_code=$?
    fi

    if [[ $exit_code -eq 0 ]]; then
      # Extract pass count from output
      p=$(echo "$output" | grep -oP 'ℹ tests \K\d+' || echo "0")
      f=$(echo "$output" | grep -oP 'ℹ fail \K\d+' || echo "0")
      pass=$((pass + p))
      fail=$((fail + f))
      echo -e "  ${GREEN}✓${NC} $test_file ($p tests)"
    else
      p=$(echo "$output" | grep -oP 'ℹ tests \K\d+' || echo "0")
      f=$(echo "$output" | grep -oP 'ℹ fail \K\d+' || echo "1")
      pass=$((pass + p))
      fail=$((fail + f))
      echo -e "  ${RED}✗${NC} $test_file ($f failed)"
      if ! $VERBOSE; then
        echo "$output" | grep -E "^(✖|Error|TypeError|AssertionError)" | head -5
      fi
    fi
  done

  PASS_COUNT[$service]=$pass
  FAIL_COUNT[$service]=$fail
  TOTAL_PASS=$((TOTAL_PASS + pass))
  TOTAL_FAIL=$((TOTAL_FAIL + fail))

  if [[ $fail -eq 0 ]]; then
    echo -e "  ${GREEN}→ $service: $pass passed, 0 failed${NC}"
  else
    echo -e "  ${RED}→ $service: $pass passed, $fail failed${NC}"
  fi
}

# ---------------------------------------------------------------------------
# Run each service's tests
# ---------------------------------------------------------------------------

TEST_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" 2>/dev/null || echo "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

echo -e "${BLUE}POSR Test Runner${NC}"
echo "JWT secret: ${TEST_JWT_SECRET:0:16}..."
echo "Filter: ${SERVICE_FILTER:-all services}"
echo ""

# Gateway
run_tests "gateway" "$SCRIPT_DIR/gateway" \
  "src/jwt.test.js" \
  "src/jwt-roles.test.js" \
  "src/rate-limiter.test.js" \
  "src/revocation-store.test.js" \
  "src/audit-log.test.js" \
  "src/surreal-client.test.js"

# API
run_tests "api" "$SCRIPT_DIR/api" \
  "src/lib/session-auth.middleware.test.js" \
  "src/lib/surreal-client.test.js"

# Payments
run_tests "payments" "$SCRIPT_DIR/payments" \
  "src/lib/session-auth.middleware.test.js" \
  "src/lib/surreal-client.test.js" \
  "src/lib/payment-credential.crypto.test.js" \
  "src/gateways/drivers/paypal.gateway.bypass.test.js" \
  "src/gateways/drivers/payment-drivers.business.test.cjs"

# Printing
run_tests "printing" "$SCRIPT_DIR/printing" \
  "session-auth.middleware.test.js" \
  "lib/print-helpers.business.test.cjs"

# Tracking-api
run_tests "tracking-api" "$SCRIPT_DIR/tracking-api" \
  "src/session-auth.middleware.test.js" \
  "src/surreal-client.test.js"

# Sync-service
run_tests "sync-service" "$SCRIPT_DIR/sync-service" \
  "src/sync-manager.business.test.cjs"

# Frontend (vitest)
if [[ -z "$SERVICE_FILTER" || "$SERVICE_FILTER" == "frontend" ]]; then
  section "Testing: frontend (vitest)"

  if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
    echo "  Installing dependencies (bun install)..."
    (cd "$SCRIPT_DIR" && bun install --silent 2>/dev/null)
  fi

  fe_output=""
  if $VERBOSE; then
    (cd "$SCRIPT_DIR" && npx vitest run 2>&1) || true
  else
    fe_output=$(cd "$SCRIPT_DIR" && npx vitest run 2>&1) || true
    echo "$fe_output" | grep -E "Test Files|Tests " | head -5
  fi

  fe_pass=$(echo "$fe_output" | grep -oP '\d+ passed' | head -1 | grep -oP '\d+' || echo "0")
  fe_fail=$(echo "$fe_output" | grep -oP '\d+ failed' | head -1 | grep -oP '\d+' || echo "0")
  PASS_COUNT["frontend"]=$fe_pass
  FAIL_COUNT["frontend"]=$fe_fail
  TOTAL_PASS=$((TOTAL_PASS + fe_pass))
  TOTAL_FAIL=$((TOTAL_FAIL + fe_fail))

  if [[ "$fe_fail" -eq 0 ]]; then
    echo -e "  ${GREEN}→ frontend: $fe_pass passed, 0 failed${NC}"
  else
    echo -e "  ${RED}→ frontend: $fe_pass passed, $fe_fail failed${NC}"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

section "Summary"

echo ""
printf "  %-20s %10s %10s\n" "Service" "Passed" "Failed"
printf "  %-20s %10s %10s\n" "-------" "------" "------"
for service in gateway api payments printing tracking-api sync-service frontend; do
  if [[ -n "${PASS_COUNT[$service]:-}" || -n "${FAIL_COUNT[$service]:-}" ]]; then
    p="${PASS_COUNT[$service]:-0}"
    f="${FAIL_COUNT[$service]:-0}"
    if [[ "$f" -eq 0 ]]; then
      printf "  ${GREEN}%-20s${NC} %10s %10s\n" "$service" "$p" "$f"
    else
      printf "  ${RED}%-20s${NC} %10s %10s\n" "$service" "$p" "$f"
    fi
  fi
done
echo ""
printf "  %-20s %10s %10s\n" "TOTAL" "$TOTAL_PASS" "$TOTAL_FAIL"
echo ""

if [[ $TOTAL_FAIL -eq 0 ]]; then
  echo -e "${GREEN}✓ All $TOTAL_PASS tests passed across all services.${NC}"
  exit 0
else
  echo -e "${RED}✗ $TOTAL_FAIL test(s) failed across all services.${NC}"
  exit 1
fi
