# Frontend Backend Integration Summary

## Overview
The React frontend has been refactored to consume the real FastAPI backend endpoints instead of mock data. All authentication, data fetching, and file upload operations now communicate with the backend API.

## ✅ Completed Integration Tasks

### 1. API Client (`src/lib/api.ts`)
**Status:** ✅ Complete

The API client is fully configured with:
- **Base URL:** Uses `import.meta.env.VITE_API_URL` or defaults to `http://localhost:8000`
- **Axios Instance:** Configured with 30-second timeout and JSON headers
- **Request Interceptor:** Automatically attaches JWT `access_token` from localStorage to the `Authorization: Bearer <token>` header on every request
- **Response Interceptor:** Handles 401 Unauthorized errors by:
  - Clearing localStorage (`access_token` and `user`)
  - Redirecting to `/login` (handled by React routing)
  - Preventing infinite retry loops with `_retry` flag

### 2. Authentication Flow (`src/lib/AuthContext.tsx` + `src/components/LoginPage.tsx`)
**Status:** ✅ Complete

**Login Process:**
1. User submits credentials via `LoginPage.tsx`
2. `AuthContext.login()` calls `authApi.login(credentials)`
3. Backend endpoint: `POST /token` (OAuth2 form-urlencoded)
4. Receives `{ access_token, token_type }` response
5. Token saved to `localStorage.setItem('access_token', token)`
6. Calls `authApi.me()` → `GET /api/v1/auth/me` to fetch user profile
7. User state updated with `{ id, email, full_name, role, is_active }`
8. Toast notification: "Welcome back, {name}!"

**Registration Process:**
1. User submits registration form
2. `AuthContext.register()` calls `authApi.register(data)`
3. Backend endpoint: `POST /api/v1/auth/register`
4. Success toast shown, user can now log in

**Session Management:**
- On app load, `checkSession()` validates existing token via `GET /api/v1/auth/me`
- If token is invalid (401), automatically logs user out
- User role determined from `/me` response (ZZP, Accountant, or Admin)

### 3. Document Upload (`src/components/IntelligentUploadPortal.tsx`)
**Status:** ✅ Complete

**Upload Process:**
1. User drags/drops or selects files (PNG, JPG, PDF only)
2. File validation ensures only images and PDFs are accepted
3. Click "Upload" or "Upload All" to start upload
4. `documentApi.upload(file)` called for each file
5. Backend endpoint: `POST /api/v1/documents/upload` (multipart/form-data)
6. FormData contains:
   - `file`: The actual file binary
   - `administration_id`: (optional) Company/tenant ID
7. Backend saves file to `./uploads` directory
8. Backend inserts record in `documents` table with status `Pending`
9. Spark worker picks up the file for AI processing
10. Frontend displays document ID from response

**UI Features:**
- Real-time progress indicators (10% → 30% → 50% → 90% → 100%)
- Status badges (Pending, Uploading, Uploaded, Error)
- File size display
- Document ID shown after successful upload
- Error messages displayed in red alert boxes
- Statistics cards showing counts (Pending, Uploading, Uploaded, Errors)

## 🔑 Key Backend Endpoints Used

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/token` | POST | User login (OAuth2 form) | ❌ No |
| `/api/v1/auth/register` | POST | Create new user account | ❌ No |
| `/api/v1/auth/me` | GET | Get current user profile | ✅ Yes |
| `/api/v1/documents/upload` | POST | Upload invoice/receipt | ✅ Yes |
| `/api/v1/transactions/stats` | GET | Dashboard statistics | ✅ Yes |
| `/api/v1/transactions` | GET | List transactions | ✅ Yes |

## 🔒 Security Implementation

1. **JWT Token Storage:** Stored in `localStorage` (key: `access_token`)
2. **Automatic Token Injection:** All API requests automatically include `Authorization: Bearer <token>`
3. **401 Handling:** Automatic logout and redirect on unauthorized requests
4. **CORS:** Backend must have CORS enabled for `http://localhost:5173` (Vite dev server)

## 🧪 Testing the Integration

### Prerequisites
1. Backend running at `http://localhost:8000`
2. PostgreSQL database initialized with ledger accounts
3. Redis running for Spark worker queue
4. Spark worker monitoring `./uploads` folder

### Test Scenario
1. **Create a user in the database:**
   ```sql
   INSERT INTO users (email, hashed_password, full_name, role, is_active)
   VALUES ('test@example.com', '<bcrypt_hash>', 'Test User', 'zzp', true);
   ```

2. **Start the frontend:**
   ```bash
   npm run dev
   # Opens at http://localhost:5173
   ```

3. **Login:**
   - Email: `test@example.com`
   - Password: `<your_password>`
   - Should show success toast and redirect to dashboard

4. **Upload a file:**
   - Navigate to "AI Upload" tab
   - Drop an invoice image
   - Click "Upload"
   - Check backend `./uploads` folder for the file
   - Check database `documents` table for new record
   - Document ID should appear in UI

## 🐛 Error Handling

### Network Errors
- Message: "Cannot connect to server. Please ensure the backend is running at http://localhost:8000"
- Cause: Backend not running or wrong URL

### 401 Unauthorized
- Automatically clears session and redirects to login
- Prevents infinite retry loops

### File Upload Errors
- Invalid file type → Toast error with specific file name
- Upload failure → Red alert box with backend error message
- File read error → "Failed to read file" message

## 🎯 Environment Variables

Create `.env` file in the frontend root:
```env
VITE_API_URL=http://localhost:8000
```

Or set in production environment.

## 🚀 What Happens After Upload

1. **Frontend uploads file** → Backend saves to `./uploads/`
2. **Backend creates database record** → `documents` table with `status='Pending'`
3. **Spark worker detects new file** (via Redis or folder watch)
4. **Spark performs OCR** → Extracts text using Tesseract
5. **Spark classifies** → Predicts ledger account (e.g., "Shell" → 4000 Reiskosten)
6. **Spark creates draft transaction** → Inserts into `transaction_lines` table
7. **Accountant reviews** → Approves or edits the draft transaction

## 📝 Next Steps

1. ✅ Backend API fully integrated
2. ✅ Authentication working with real JWT
3. ✅ File uploads reaching backend
4. ⏳ Wait for Spark worker to process documents
5. ⏳ View draft transactions in the Smart Transactions tab
6. ⏳ Approve/reject draft bookings

## 🔗 Related Files

- `src/lib/api.ts` - API client and endpoint definitions
- `src/lib/AuthContext.tsx` - Authentication state management
- `src/components/LoginPage.tsx` - Login/Register UI
- `src/components/IntelligentUploadPortal.tsx` - File upload UI
- `src/components/SmartTransactionList.tsx` - View draft transactions
- `src/App.tsx` - Main app with routing and navigation
