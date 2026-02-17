# Fix for VatSubmissionListResponse Type Annotation Error

## Problem
The application was failing with:
```
NameError: name 'VatSubmissionListResponse' is not defined
PydanticUndefinedAnnotation error
```

## Root Cause
In `/backend/app/api/v1/vat.py`, three FastAPI endpoint decorators were using **string literals** for the `response_model` parameter instead of the actual class references:

```python
# INCORRECT - Using string literals
@router.get("/...", response_model='VatSubmissionListResponse')
@router.post("/...", response_model='VatSubmissionResponse')
```

This caused Pydantic to fail when trying to resolve the type annotations at runtime, even though the classes were properly imported at the top of the file.

## Solution
Changed all string literals to actual class references:

```python
# CORRECT - Using actual class references
@router.get("/...", response_model=VatSubmissionListResponse)
@router.post("/...", response_model=VatSubmissionResponse)
```

## Changes Made

### File: `backend/app/api/v1/vat.py`

1. **Line 811** - `list_vat_submissions` endpoint:
   - Changed: `response_model='VatSubmissionListResponse'`
   - To: `response_model=VatSubmissionListResponse`

2. **Line 879** - `create_vat_submission` endpoint:
   - Changed: `response_model='VatSubmissionResponse'`
   - To: `response_model=VatSubmissionResponse`

3. **Line 950** - `mark_submission_submitted` endpoint:
   - Changed: `response_model='VatSubmissionResponse'`
   - To: `response_model=VatSubmissionResponse`

4. **Line 895** - `create_vat_submission` function parameter:
   - Changed: `request: 'CreateVatSubmissionRequest'`
   - To: `request: CreateVatSubmissionRequest`

5. **Line 967** - `mark_submission_submitted` function parameter:
   - Changed: `request: 'MarkSubmittedRequest'`
   - To: `request: MarkSubmittedRequest`

6. **Removed redundant imports**: Cleaned up local imports of schema classes that were already imported at module level.

## Why This Happened

The original implementation used string literals (forward references) to work around circular import issues, but since all the required schemas were already imported at the top of the file, the string literals were unnecessary and caused Pydantic to fail type resolution.

## Verification

✅ Python syntax check passed
✅ All type annotations properly reference imported classes
✅ No more NameError or PydanticUndefinedAnnotation

## Testing

The fix ensures that:
1. FastAPI can properly resolve response models at runtime
2. Pydantic can validate and serialize responses correctly
3. OpenAPI documentation is generated correctly with proper schema references
