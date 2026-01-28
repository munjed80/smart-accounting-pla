#!/bin/bash
#
# verify-production.sh - Production readiness verification script
#
# This script verifies that the Smart Accounting Platform production deployment
# is correctly configured for TLS, CORS, and API connectivity.
#
# Usage: ./scripts/verify-production.sh [--api-url URL] [--frontend-url URL]
#
# Default URLs:
#   API: https://api.zzpershub.nl
#   Frontend: https://zzpershub.nl

set -e

# Default URLs
API_URL="${API_URL:-https://api.zzpershub.nl}"
FRONTEND_URL="${FRONTEND_URL:-https://zzpershub.nl}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --frontend-url)
            FRONTEND_URL="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--api-url URL] [--frontend-url URL]"
            echo ""
            echo "Options:"
            echo "  --api-url URL       API base URL (default: https://api.zzpershub.nl)"
            echo "  --frontend-url URL  Frontend URL for CORS origin (default: https://zzpershub.nl)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Counters for pass/fail
PASSED=0
FAILED=0

# Function to print test result
print_result() {
    local status=$1
    local message=$2
    local details=$3
    
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $message"
        PASSED=$((PASSED + 1))
    elif [ "$status" = "fail" ]; then
        echo -e "${RED}✗ FAIL${NC}: $message"
        if [ -n "$details" ]; then
            echo -e "  ${YELLOW}→ $details${NC}"
        fi
        FAILED=$((FAILED + 1))
    elif [ "$status" = "warn" ]; then
        echo -e "${YELLOW}⚠ WARN${NC}: $message"
        if [ -n "$details" ]; then
            echo -e "  ${YELLOW}→ $details${NC}"
        fi
    fi
}

echo "========================================"
echo "Smart Accounting Platform - Production Verification"
echo "========================================"
echo ""
echo "API URL: $API_URL"
echo "Frontend URL: $FRONTEND_URL"
echo ""
echo "----------------------------------------"
echo "1. TLS/SSL Certificate Check"
echo "----------------------------------------"

# Test 1: Check TLS certificate validity
TLS_OUTPUT=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 10 "$API_URL/health" 2>&1) || TLS_OUTPUT="FAIL"

if [[ "$TLS_OUTPUT" =~ ^[0-9]+$ ]]; then
    print_result "pass" "TLS connection to API successful"
else
    if echo "$TLS_OUTPUT" | grep -qi "certificate"; then
        print_result "fail" "TLS certificate error" "Check Let's Encrypt configuration in Coolify"
    else
        print_result "fail" "Cannot connect to API" "$TLS_OUTPUT"
    fi
fi

echo ""
echo "----------------------------------------"
echo "2. API Health Check"
echo "----------------------------------------"

# Test 2: Check /health endpoint returns 200 and valid JSON
HEALTH_RESPONSE=$(curl -sS --connect-timeout 10 "$API_URL/health" 2>&1) || HEALTH_RESPONSE=""
HEALTH_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 10 "$API_URL/health" 2>&1) || HEALTH_STATUS="000"

if [ "$HEALTH_STATUS" = "200" ]; then
    print_result "pass" "Health endpoint returns HTTP 200"
    
    # Check if response is valid JSON with expected structure
    if echo "$HEALTH_RESPONSE" | grep -q '"status"'; then
        print_result "pass" "Health response contains valid JSON structure"
        
        # Check health status value
        if echo "$HEALTH_RESPONSE" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
            print_result "pass" "API reports healthy status"
        else
            print_result "warn" "API health status is not 'healthy'" "Check component statuses in response"
        fi
    else
        print_result "fail" "Health response is not valid JSON" "$HEALTH_RESPONSE"
    fi
else
    print_result "fail" "Health endpoint returned HTTP $HEALTH_STATUS" "Expected 200"
fi

echo ""
echo "----------------------------------------"
echo "3. CORS Configuration Check"
echo "----------------------------------------"

# Test 3: Check CORS headers on OPTIONS request to /api/v1/auth/register
CORS_HEADERS=$(curl -sS -I -X OPTIONS \
    --connect-timeout 10 \
    -H "Origin: $FRONTEND_URL" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    "$API_URL/api/v1/auth/register" 2>&1) || CORS_HEADERS=""

# Check for Access-Control-Allow-Origin header
if echo "$CORS_HEADERS" | grep -qi "access-control-allow-origin"; then
    ORIGIN_VALUE=$(echo "$CORS_HEADERS" | grep -i "access-control-allow-origin" | head -1)
    
    if echo "$ORIGIN_VALUE" | grep -qiE "$FRONTEND_URL|^\*"; then
        print_result "pass" "CORS Access-Control-Allow-Origin header present"
        echo "  Found: $ORIGIN_VALUE"
    else
        print_result "fail" "CORS origin does not match frontend URL" "$ORIGIN_VALUE"
    fi
else
    print_result "fail" "CORS Access-Control-Allow-Origin header missing" "Backend CORS_ORIGINS may not include $FRONTEND_URL"
fi

# Check for Access-Control-Allow-Methods header
if echo "$CORS_HEADERS" | grep -qi "access-control-allow-methods"; then
    METHODS_VALUE=$(echo "$CORS_HEADERS" | grep -i "access-control-allow-methods" | head -1)
    if echo "$METHODS_VALUE" | grep -qi "POST"; then
        print_result "pass" "CORS allows POST method"
    else
        print_result "fail" "CORS does not allow POST method" "$METHODS_VALUE"
    fi
else
    print_result "warn" "CORS Access-Control-Allow-Methods header not found in preflight response"
fi

# Check for Access-Control-Allow-Credentials header
if echo "$CORS_HEADERS" | grep -qi "access-control-allow-credentials.*true"; then
    print_result "pass" "CORS allows credentials"
else
    print_result "warn" "CORS Access-Control-Allow-Credentials not set to true" "May cause issues with authenticated requests"
fi

echo ""
echo "----------------------------------------"
echo "4. Auth Endpoint Accessibility"
echo "----------------------------------------"

# Test 4: Check POST to /api/v1/auth/register is accessible (should return 422 for missing body, not 404/500)
REGISTER_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
    --connect-timeout 10 \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Origin: $FRONTEND_URL" \
    -d '{}' \
    "$API_URL/api/v1/auth/register" 2>&1) || REGISTER_STATUS="000"

if [ "$REGISTER_STATUS" = "422" ]; then
    print_result "pass" "Register endpoint accessible (returns 422 for invalid input as expected)"
elif [ "$REGISTER_STATUS" = "200" ] || [ "$REGISTER_STATUS" = "201" ]; then
    print_result "pass" "Register endpoint accessible (returns $REGISTER_STATUS)"
elif [ "$REGISTER_STATUS" = "429" ]; then
    print_result "pass" "Register endpoint accessible (rate limited - 429)"
else
    print_result "fail" "Register endpoint returned unexpected status $REGISTER_STATUS" "Expected 422 (validation error), got $REGISTER_STATUS"
fi

# Test 5: Check /api/v1/auth/token (login) endpoint
TOKEN_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
    --connect-timeout 10 \
    -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Origin: $FRONTEND_URL" \
    -d 'username=test@test.com&password=test' \
    "$API_URL/api/v1/auth/token" 2>&1) || TOKEN_STATUS="000"

if [ "$TOKEN_STATUS" = "401" ]; then
    print_result "pass" "Login endpoint accessible (returns 401 for invalid credentials as expected)"
elif [ "$TOKEN_STATUS" = "422" ]; then
    print_result "pass" "Login endpoint accessible (returns 422 for validation)"
elif [ "$TOKEN_STATUS" = "429" ]; then
    print_result "pass" "Login endpoint accessible (rate limited - 429)"
else
    print_result "fail" "Login endpoint returned unexpected status $TOKEN_STATUS" "Expected 401 or 422"
fi

echo ""
echo "----------------------------------------"
echo "5. Frontend Accessibility"
echo "----------------------------------------"

# Test 6: Check frontend is accessible
FRONTEND_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 10 "$FRONTEND_URL" 2>&1) || FRONTEND_STATUS="000"

if [ "$FRONTEND_STATUS" = "200" ]; then
    print_result "pass" "Frontend accessible (HTTP 200)"
elif [[ "$FRONTEND_STATUS" =~ ^30[0-9]$ ]]; then
    print_result "pass" "Frontend accessible (HTTP redirect $FRONTEND_STATUS)"
else
    print_result "fail" "Frontend returned HTTP $FRONTEND_STATUS" "Expected 200"
fi

echo ""
echo "========================================"
echo "SUMMARY"
echo "========================================"
echo -e "Tests passed: ${GREEN}$PASSED${NC}"
echo -e "Tests failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some checks failed. Please review the errors above.${NC}"
    echo "For troubleshooting, see: docs/PROXY_SSL_TROUBLESHOOTING.md"
    exit 1
else
    echo -e "${GREEN}All checks passed! Production deployment looks healthy.${NC}"
    exit 0
fi
