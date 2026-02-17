# Bank Matching Engine - Verification Steps

This document outlines the verification steps for the production-grade bank reconciliation matching engine.

## Prerequisites

- Backend server running with migration 040 applied
- Frontend running and accessible
- Test client/administration with active Machtiging (consent)
- Test user with ACCOUNTANT role

## Test Data Setup

### Step 1: Create Test Bank Account and Transactions

1. **Import 20 Bank Transactions**
   - Navigate to Bank & Kas page as accountant
   - Click "Importeren" button
   - Upload a CSV file with 20 test transactions including:
     - 5 with invoice numbers in description
     - 5 with matching amounts to open invoices
     - 5 recurring payments
     - 5 miscellaneous transactions
   
   **Expected Result:**
   - Success toast showing "X transacties geïmporteerd"
   - Transactions appear in "Nieuw" tab
   - All transactions have status "NEW"

### Step 2: Generate Matching Proposals

2. **Click "Genereer voorstellen" Button**
   - In the KPI strip at top, click "Genereer voorstellen"
   
   **Expected Result:**
   - Button shows loading state "Genereren..."
   - Success toast: "X voorstellen gegenereerd voor Y transacties"
   - KPI strip updates with new statistics
   - Transactions with proposals show confidence badges and reason text

3. **Verify Proposal Display**
   - Check that transactions show:
     - Confidence badge (0-100) with appropriate color:
       - Green badge (80%+)
       - Amber badge (60-79%)
       - Gray badge (<60%)
     - Dutch reason text (e.g., "Bedrag komt overeen met factuur INV-2024-001")
     - "Match" and "Andere voorstellen" buttons

### Step 3: Accept a Match

4. **Accept Top Proposal**
   - For a transaction with a high-confidence proposal (80%+), click "Match" button
   
   **Expected Result:**
   - Success toast: "Match toegepast"
   - Transaction moves to "Gematcht" tab
   - Status changes to "MATCHED"
   - Transaction shows matched entity info
   - "Undo match" button appears
   - KPI strip updates (matched count increases)

5. **Verify Audit Trail**
   - Check database `reconciliation_actions` table:
     ```sql
     SELECT * FROM reconciliation_actions 
     WHERE bank_transaction_id = '{transaction_id}' 
     ORDER BY created_at DESC;
     ```
   
   **Expected Result:**
   - New row with action_type = "APPLY_MATCH"
   - payload contains proposal_id, entity_type, entity_id, confidence_score, reason
   - accountant_user_id matches current user
   
   - Check database `audit_log` table:
     ```sql
     SELECT * FROM audit_log 
     WHERE entity_type = 'bank_transaction' 
     AND entity_id = '{transaction_id}'
     AND action = 'match'
     ORDER BY created_at DESC;
     ```
   
   **Expected Result:**
   - New audit log entry with action = "match"
   - new_value contains matched_entity_type, matched_entity_id, confidence_score

### Step 4: View All Proposals

6. **Open Proposals Drawer**
   - For a transaction with multiple proposals, click "Andere voorstellen"
   
   **Expected Result:**
   - Drawer opens from right side
   - Shows all proposals sorted by confidence (highest first)
   - Each proposal displays:
     - Confidence badge with color
     - Entity type and details
     - Reason text
     - Accept/Reject buttons (if not already accepted/rejected)
   - Can accept or reject individual proposals

7. **Reject a Proposal**
   - In the drawer, click "Afwijzen" (Reject) on a proposal
   
   **Expected Result:**
   - Proposal status changes to "rejected"
   - Reject button disabled
   - Transaction remains unmatched (status still "NEW")
   - Audit log entry created for rejection

### Step 5: Unmatch Transaction

8. **Undo a Match**
   - Go to "Gematcht" tab
   - For a matched transaction, click "Undo match" button
   
   **Expected Result:**
   - Confirmation dialog appears
   - After confirming:
     - Success toast: "Match ongedaan gemaakt"
     - Transaction moves back to "Nieuw" tab
     - Status changes to "NEW"
     - matched_entity_type and matched_entity_id cleared
     - KPI strip updates (matched count decreases)

9. **Verify Undo Audit Trail**
   - Check `reconciliation_actions` table:
   
   **Expected Result:**
   - New row with action_type = "UNMATCH"
   - payload contains previous_entity_type and previous_entity_id
   
   - Check `audit_log` table:
   
   **Expected Result:**
   - New entry with action = "unmatch"
   - old_value contains previous status and entity info
   - new_value contains status = "NEW"

### Step 6: Split Transaction

10. **Split a Transaction**
    - Use API or future UI to split a transaction:
      ```bash
      curl -X POST /api/accountant/clients/{client_id}/bank/transactions/{tx_id}/split \
        -H "Authorization: Bearer {token}" \
        -d '{
          "splits": [
            {"amount": "50.00", "description": "Part 1"},
            {"amount": "30.00", "description": "Part 2"}
          ]
        }'
      ```
   
   **Expected Result:**
   - Response: `{"status": "success", "splits_count": 2}`
   - Database `bank_transaction_splits` table has 2 rows
   - Sum of splits equals original transaction amount
   - Audit log entry created

11. **Verify Split Validation**
    - Try to split with incorrect sum:
      ```bash
      curl -X POST /api/accountant/clients/{client_id}/bank/transactions/{tx_id}/split \
        -H "Authorization: Bearer {token}" \
        -d '{
          "splits": [
            {"amount": "50.00", "description": "Part 1"},
            {"amount": "40.00", "description": "Part 2"}
          ]
        }'
      ```
   
   **Expected Result:**
   - Error response: "Sum of splits does not equal transaction amount"
   - No splits created
   - Transaction unchanged

### Step 7: Test Permissions

12. **Test Without Machtiging (Consent)**
    - Use an accountant account WITHOUT active Machtiging for the test client
    - Try to access: GET `/api/accountant/clients/{client_id}/bank/transactions`
   
   **Expected Result:**
   - 403 Forbidden error
   - Error message in Dutch about missing consent
   - No data leaked

13. **Test with Different Client**
    - As accountant with access to Client A, try to access:
      - Client B's transactions
      - Client B's proposals
   
   **Expected Result:**
   - 403 Forbidden or 404 Not Found
   - No cross-client data leakage

### Step 8: Test Idempotency

14. **Accept Same Match Twice**
    - Accept a proposal for a transaction
    - Call accept endpoint again with same proposal_id
   
   **Expected Result:**
   - Response: `{"status": "already_matched", "message": "Transaction already matched to this target"}`
   - Only one audit log entry (first acceptance)
   - No duplicate links or errors

### Step 9: KPI Verification

15. **Check KPI Calculations**
    - Verify KPI strip shows:
      - Correct matched percentage
      - Correct counts for each status
      - Correct total inflow (sum of positive amounts)
      - Correct total outflow (sum of absolute negative amounts)
   
   **Expected Result:**
   - All calculations match manual verification
   - Percentages rounded to 1 decimal place
   - Color coding correct (Green ≥80%, Amber 50-79%, Red <50%)

## Rules Engine Tests (Optional - Future Enhancement)

16. **Create a Matching Rule**
    ```bash
    curl -X POST /api/accountant/clients/{client_id}/bank/rules \
      -H "Authorization: Bearer {token}" \
      -d '{
        "name": "ADYEN payments",
        "enabled": true,
        "priority": 200,
        "conditions": {
          "contains": "ADYEN",
          "min_amount": 10,
          "max_amount": 500
        },
        "action": {
          "auto_accept": false,
          "target_type": "expense"
        }
      }'
    ```

17. **List Rules**
    - GET `/api/accountant/clients/{client_id}/bank/rules`
    
    **Expected Result:**
    - Rules sorted by priority (descending)
    - All rule fields present

## Performance Tests

18. **Load Test**
    - Import 100+ transactions
    - Generate proposals for all
    
    **Expected Result:**
    - Generation completes within reasonable time (<30 seconds)
    - No timeout errors
    - All proposals generated

19. **Concurrent Access**
    - Two accountants generate proposals simultaneously
    
    **Expected Result:**
    - Both succeed without conflicts
    - No duplicate proposals
    - Proper locking/transaction handling

## Build and Lint

20. **Backend Lint**
    ```bash
    cd backend
    flake8 app/services/bank_matching_engine.py
    mypy app/services/bank_matching_engine.py
    ```
    
    **Expected Result:**
    - No linting errors
    - No type checking errors

21. **Frontend Build**
    ```bash
    npm run lint
    npm run build
    ```
    
    **Expected Result:**
    - No linting errors
    - Build succeeds without errors
    - No console warnings

## Sign-off Checklist

- [ ] All 20 test transactions imported successfully
- [ ] Proposals generated with confidence scores and Dutch reasons
- [ ] Match acceptance works and creates audit trail
- [ ] Match rejection works and creates audit trail
- [ ] Unmatch functionality works and creates audit trail
- [ ] Split transaction validation works
- [ ] Permission checks prevent unauthorized access
- [ ] Idempotency verified (no duplicate matches)
- [ ] KPI calculations accurate
- [ ] No data leakage between clients
- [ ] Build and lint pass
- [ ] No security vulnerabilities (CodeQL scan)
- [ ] Mobile-friendly UI tested
- [ ] Dutch translations correct

## Known Limitations

1. **Split UI** - Split transaction UI not implemented in this phase (API only)
2. **Rule Testing** - Full rule automation not implemented (foundation only)
3. **Bulk Operations** - Bulk match/unmatch operations not included
4. **Advanced Filters** - Additional filtering on proposals not included

## Future Enhancements

- Split transaction UI in proposals drawer
- Bulk match acceptance for high-confidence proposals
- Auto-accept rules with confidence thresholds
- ML-based confidence score improvements
- Transaction matching history and patterns
- Export/import matching rules
