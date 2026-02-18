# Mollie Phase 2 (Step 5): Cancel / Reactivate + Subscription Status UI Polish

## Overview

This document describes the implementation of subscription lifecycle management for ZZP users, including subscription cancellation, reactivation, and improved status UI.

## Environment Requirements

### Required Environment Variables

All variables from previous Mollie phases are still required:

```bash
# Mollie API key (test_xxx for testing, live_xxx for production)
MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxx

# Webhook secret for verification (generate with: openssl rand -hex 32)
MOLLIE_WEBHOOK_SECRET=your_secure_webhook_secret_here

# Public URL accessible from internet (for webhooks)
APP_PUBLIC_URL=https://yourdomain.com
```

### Development Setup

1. Ensure all environment variables are set in `.env`
2. Run database migrations (if any new ones exist)
3. Start the backend server: `cd backend && uvicorn app.main:app --reload`
4. Start the frontend: `npm run dev`

## Backend Implementation

### New Endpoints

#### 1. Cancel Subscription

**Endpoint**: `POST /api/v1/me/subscription/cancel`

**Authentication**: Requires authenticated ZZP user

**Behavior**:
- If no `provider_subscription_id`: Sets status to CANCELED locally
- Otherwise: Calls Mollie API to cancel subscription at period end
- Sets `cancel_at_period_end=True` 
- Status remains ACTIVE until webhook confirms cancellation
- Idempotent: Returns existing status if already canceled

**Request**: No body required

**Response**:
```json
{
  "subscription": {
    "status": "ACTIVE",
    "cancel_at_period_end": true,
    "current_period_end": "2024-04-30T23:59:59Z"
  },
  "message_nl": "Abonnement opgezegd. Het blijft actief tot het einde van de huidige periode."
}
```

**Audit Logs**:
- `SUBSCRIPTION_CANCEL_REQUESTED` - When user requests cancellation
- `SUBSCRIPTION_CANCELED` - When immediate cancellation (no provider)

#### 2. Reactivate Subscription

**Endpoint**: `POST /api/v1/me/subscription/reactivate`

**Authentication**: Requires authenticated ZZP user

**Behavior**:
- If status is ACTIVE: Returns idempotent response
- If within trial with scheduled subscription: Returns scheduled status
- If marked for cancellation: Clears `cancel_at_period_end` flag
- If CANCELED/EXPIRED/PAST_DUE: Creates new Mollie subscription
- Idempotent: Safe to call multiple times

**Request**: No body required

**Response**:
```json
{
  "subscription": {
    "status": "ACTIVE",
    "cancel_at_period_end": false,
    "scheduled": false,
    "provider_subscription_id": "sub_xxxxx"
  },
  "message_nl": "Annulering ingetrokken. Abonnement blijft actief."
}
```

**Audit Logs**:
- `SUBSCRIPTION_REACTIVATED` - When subscription is reactivated
- `SUBSCRIPTION_SCHEDULED` - When new subscription is scheduled

### Enhanced Webhook Processing

The webhook endpoint now:
- Records `current_period_end` when subscription is canceled
- Handles PAST_DUE → ACTIVE transitions when payment succeeds
- Properly updates status for all Mollie subscription states

### Updated DTO

The `/api/v1/me/subscription` response now includes:
- `next_payment_date`: Best-effort estimate of next payment (from `current_period_end` or `trial_end_at`)
- All existing fields maintained for backward compatibility

## Frontend Implementation

### Subscription Management Card

**Location**: Settings page (`/settings`)

**Visibility**: ZZP users only (hidden for accountants)

**Features**:
1. **Status Display**:
   - Color-coded badges for all subscription states
   - Clear Dutch explanations for each status
   - Shows days remaining for trial period
   - Displays period end date when marked for cancellation

2. **Action Buttons**:
   - **Active subscription**: "Opzeggen" button
   - **Canceled/Expired/Past Due**: "Heractiveren" button
   - **Marked for cancellation**: "Annulering intrekken" button
   - Loading states during API calls

3. **Status Messages**:
   - **TRIALING**: Shows days left in trial + scheduled info
   - **ACTIVE**: Shows plan details (€6,95/maand)
   - **CANCELED**: Shows cancellation message
   - **PAST_DUE**: Shows payment failure warning
   - **EXPIRED**: Shows trial expiration prompt

### Enhanced Subscription Banner

**Location**: Top of main content area (Dashboard, etc.)

**New Features**:
- **PAST_DUE status**: Red alert with "Betaling mislukt" message and reactivation button
- Improved messaging for all states
- Consistent styling across all status types

## Manual Test Plan

### Prerequisites
1. Backend server running with Mollie test API key
2. Frontend running and connected to backend
3. Test user account (ZZP role)
4. Access to Mollie dashboard (for webhook testing)

### Test Scenarios

#### Scenario 1: Cancel Active Subscription

**Steps**:
1. Log in as ZZP user with active subscription
2. Navigate to Settings page
3. Locate "Abonnement" card
4. Verify status shows "Actief" badge
5. Click "Opzeggen" button
6. Confirm cancellation in dialog
7. Verify status updates to show "Lopend tot periode-einde" badge
8. Verify "Annulering intrekken" button is now shown
9. Check backend audit logs for `SUBSCRIPTION_CANCEL_REQUESTED`

**Expected Result**:
- Subscription remains active but marked for cancellation
- Period end date is displayed
- Toast notification shows success message
- Button changes from "Opzeggen" to "Annulering intrekken"

#### Scenario 2: Reactivate Canceled Subscription (Reverse Cancellation)

**Steps**:
1. Continue from Scenario 1 (subscription marked for cancellation)
2. Click "Annulering intrekken" button
3. Verify status updates back to "Actief"
4. Verify "Opzeggen" button is shown again
5. Check backend audit logs for `SUBSCRIPTION_REACTIVATED`

**Expected Result**:
- `cancel_at_period_end` flag is cleared
- Status returns to normal active state
- Toast notification shows success message

#### Scenario 3: Idempotent Cancel

**Steps**:
1. Start with active subscription
2. Click "Opzeggen" and confirm
3. Wait for update
4. Click "Opzeggen" again (should not show button, so test via API)
5. Call `POST /api/v1/me/subscription/cancel` twice via Postman/curl
6. Check that Mollie API is only called once

**Expected Result**:
- Second call returns same result without calling Mollie
- No errors or duplicate operations

#### Scenario 4: Reactivate Expired Subscription

**Steps**:
1. Use test account with EXPIRED subscription status
2. Navigate to Settings page
3. Verify status shows "Verlopen" badge
4. Click "Heractiveren" button
5. Verify new subscription is created in Mollie
6. Check that new `provider_subscription_id` is recorded
7. Check backend audit logs for `SUBSCRIPTION_SCHEDULED`

**Expected Result**:
- New Mollie subscription is created
- Toast shows success message
- Status may remain EXPIRED until first payment webhook

#### Scenario 5: PAST_DUE Status Display

**Steps**:
1. Manually set subscription status to PAST_DUE in database
2. Refresh application
3. Check banner at top of page shows red alert
4. Navigate to Settings page
5. Verify "Betaling mislukt" badge is shown
6. Click "Heractiveren" button
7. Verify reactivation flow

**Expected Result**:
- Red alert banner with "Betaling mislukt" message
- Clear call-to-action in both banner and settings
- Reactivation creates new subscription

#### Scenario 6: Webhook Cancellation Flow

**Steps**:
1. Start with active subscription
2. Cancel via Settings UI
3. Use Mollie dashboard to manually trigger "subscription.canceled" webhook
4. Verify webhook is processed successfully
5. Verify subscription status changes to CANCELED
6. Verify `current_period_end` is recorded

**Expected Result**:
- Subscription status updates to CANCELED
- Period end timestamp is saved
- Audit log shows `SUBSCRIPTION_CANCELED` (system)

#### Scenario 7: Webhook Payment Recovery (PAST_DUE → ACTIVE)

**Steps**:
1. Manually set subscription to PAST_DUE
2. Use Mollie dashboard to send "payment.paid" webhook
3. Verify subscription reactivates to ACTIVE
4. Check audit log for `SUBSCRIPTION_ACTIVATED`

**Expected Result**:
- Status changes from PAST_DUE to ACTIVE
- User regains access to pro features
- Banner updates to show active status

### Negative Test Cases

#### Test N1: Cancel Without Provider Subscription

**Steps**:
1. Create subscription without `provider_subscription_id`
2. Attempt to cancel
3. Verify immediate cancellation (no Mollie call)

**Expected Result**:
- Status immediately set to CANCELED
- No error thrown

#### Test N2: Reactivate Already Active

**Steps**:
1. Call reactivate on active subscription
2. Verify idempotent response

**Expected Result**:
- Returns success with "al actief" message
- No duplicate subscriptions created

## UI States Reference

### Subscription Status Badges

| Status | Badge Color | Dutch Label | Description |
|--------|------------|-------------|-------------|
| TRIALING | Blue | Proefperiode | In trial period |
| ACTIVE | Green | Actief | Subscription active and paid |
| PAST_DUE | Red | Betaling mislukt | Payment failed |
| CANCELED | Gray | Geannuleerd | Subscription canceled |
| EXPIRED | Gray | Verlopen | Trial expired |
| ACTIVE + cancel_at_period_end | Orange | Lopend tot periode-einde | Marked for cancellation |

### Action Button Logic

| Current State | Button Text | Action |
|--------------|-------------|--------|
| ACTIVE (not canceling) | Opzeggen | Cancel subscription |
| ACTIVE + cancel_at_period_end | Annulering intrekken | Reactivate |
| CANCELED | Heractiveren | Reactivate |
| EXPIRED | Heractiveren | Reactivate |
| PAST_DUE | Opnieuw activeren | Reactivate |
| TRIALING (scheduled) | _(no button)_ | N/A |

## Error Handling

### Backend Errors

All endpoints handle errors gracefully:
- `ValueError` → 400 Bad Request
- `MollieError` → 500 Internal Server Error
- Database errors → Logged and 500 returned

### Frontend Error Handling

- Network errors: Toast with error message
- API errors: Parse and display detailed message
- Loading states prevent double-clicks
- Confirmation dialogs for destructive actions (cancel)

## Security Considerations

1. **Authentication**: All endpoints require authenticated ZZP user
2. **Authorization**: Only user's own subscription can be modified
3. **Idempotency**: Repeated calls are safe and don't duplicate operations
4. **Audit Trail**: All subscription changes are logged with user context
5. **Webhook Security**: Secret verification prevents unauthorized webhooks

## Deployment Checklist

- [ ] Environment variables set in production
- [ ] Database migrations applied
- [ ] Backend tests passing
- [ ] Frontend builds successfully
- [ ] Webhook URL accessible via HTTPS
- [ ] Mollie API key is live key (not test)
- [ ] Webhook secret is strong random value
- [ ] Manual test scenarios verified
- [ ] Audit logs configured
- [ ] Error monitoring enabled

## Troubleshooting

### Webhook Not Processing

1. Check `MOLLIE_WEBHOOK_SECRET` is set correctly
2. Verify `APP_PUBLIC_URL` is accessible from internet
3. Check backend logs for 401 errors
4. Test webhook manually via Mollie dashboard

### Cancel Button Not Showing

1. Verify user has ZZP role
2. Check subscription status is ACTIVE
3. Verify `cancel_at_period_end` is false
4. Check accountant bypass is not enabled

### Reactivation Fails

1. Check Mollie API key is valid
2. Verify customer exists in Mollie
3. Check backend logs for MollieError details
4. Ensure sufficient permissions in Mollie account

## Future Enhancements

1. **Email Notifications**: Send email when subscription is canceled/reactivated
2. **Grace Period**: Allow X days after PAST_DUE before limiting access
3. **Payment Method Update**: Allow users to update payment method
4. **Invoice History**: Show past invoices from Mollie
5. **Upgrade/Downgrade**: Support plan changes (future plans)
6. **Prorated Billing**: Handle mid-period changes

## Conclusion

This implementation provides a complete subscription lifecycle management system with:
- Robust cancel/reactivate functionality
- Clear UI for all subscription states
- Comprehensive webhook handling
- Idempotent operations
- Full audit trail
- Production-ready error handling

All operations follow Dutch UX conventions and provide clear, actionable messaging to users.
