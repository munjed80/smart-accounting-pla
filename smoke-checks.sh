#!/bin/bash
# Minimal smoke checks to ensure critical UI issues are caught

set -e

echo "🔍 Running smoke checks..."
echo ""

# Check 1: SmartDashboard loading branch should not have opacity-0
echo "✓ Checking SmartDashboard loading state opacity..."
if grep -n "opacity-0" src/components/SmartDashboard.tsx; then
    echo "❌ FAIL: SmartDashboard has 'opacity-0' in loading state which causes blank screen"
    exit 1
fi
echo "✅ PASS: SmartDashboard loading state does not have opacity-0"
echo ""

# Check 2: SettingsPage should not reference variables before declaration
echo "✓ Checking SettingsPage variable declaration order..."

# Extract the component function and check that businessProfile is declared before useDelayedLoading
SETTINGS_COMPONENT=$(sed -n '/export const SettingsPage/,/^}/p' src/components/SettingsPage.tsx)

# Find line numbers
BUSINESS_PROFILE_LINE=$(echo "$SETTINGS_COMPONENT" | grep -n "const \[businessProfile" | head -1 | cut -d: -f1)
USE_DELAYED_LINE=$(echo "$SETTINGS_COMPONENT" | grep -n "useDelayedLoading.*businessProfile" | head -1 | cut -d: -f1)

if [ -z "$BUSINESS_PROFILE_LINE" ]; then
    echo "❌ FAIL: Could not find businessProfile declaration"
    exit 1
fi

if [ -z "$USE_DELAYED_LINE" ]; then
    echo "❌ FAIL: Could not find useDelayedLoading call with businessProfile"
    exit 1
fi

if [ "$BUSINESS_PROFILE_LINE" -gt "$USE_DELAYED_LINE" ]; then
    echo "❌ FAIL: businessProfile is used on line $USE_DELAYED_LINE before declaration on line $BUSINESS_PROFILE_LINE"
    exit 1
fi

echo "✅ PASS: businessProfile is declared before use (line $BUSINESS_PROFILE_LINE before line $USE_DELAYED_LINE)"
echo ""

echo "🎉 All smoke checks passed!"
