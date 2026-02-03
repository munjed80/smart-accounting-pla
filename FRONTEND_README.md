# Smart Accounting Platform - Frontend Integration

## Overview

This is the React + TypeScript frontend for the Smart Accounting Platform, designed to consume the FastAPI backend at `http://localhost:8000`.

## Features

### ✅ Authentication System
- **JWT Token Management**: Automatic token storage and injection via Axios interceptors
- **Session Persistence**: Tokens stored in localStorage with automatic validation
- **Protected Routes**: Auth context provider manages user sessions
- **Role-Based Access**: Support for ZZP, Accountant, and Admin roles

### ✅ API Integration
- **Axios Client**: Pre-configured with base URL and timeout settings
- **Request Interceptors**: Automatically attach JWT tokens to all requests
- **Response Interceptors**: Handle 401 errors and redirect to login
- **Error Handling**: User-friendly error messages with network failure detection

### ✅ Dashboard
- **Real-time Stats**: Fetches transaction statistics from `GET /api/v1/transactions/stats`
- **Live Data Display**: 
  - Total transactions count
  - Draft bookings count
  - Posted bookings count
  - Debit/Credit balance
- **Recent Transactions**: Shows latest bookings with status badges
- **Manual Refresh**: Update data on demand with timestamp

### ✅ Upload Portal
- **Multi-file Upload**: Drag & drop or click to upload invoices
- **Real API Integration**: Posts to `POST /api/v1/documents` with multipart/form-data
- **Progress Tracking**: Visual progress bars for each file
- **Status Management**: Pending, Uploading, Success, Error states
- **Error Recovery**: Retry failed uploads
- **File Type Support**: Images (JPEG, PNG) and PDF documents

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** + **shadcn/ui** components
- **Axios** for HTTP requests
- **date-fns** for date formatting
- **Sonner** for toast notifications
- **Phosphor Icons** for UI icons

## Getting Started

### Prerequisites

1. **Backend Running**: Ensure the FastAPI backend is running at `http://localhost:8000`
2. **Node.js**: v20 or higher

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Environment Configuration

Create a `.env` file in the root:

```env
VITE_API_URL=http://localhost:8000
```

**⚠️ Important: Build-Time Configuration**

`VITE_API_URL` is a **build-time** environment variable. This means:
- The value is embedded into the JavaScript bundle during `npm run build`
- Changing the `.env` file requires a **full rebuild** for changes to take effect
- In Coolify/Docker deployments, update the build environment variable and trigger a redeploy

**Correct configuration:**
```env
# ✅ Correct: Domain only, no path
VITE_API_URL=https://api.zzpershub.nl

# ❌ Incorrect: Don't include API paths
VITE_API_URL=https://api.zzpershub.nl/api/v1
VITE_API_URL=https://api.zzpershub.nl/api
```

The API client automatically appends `/api/v1` to the base URL. If your `VITE_API_URL` accidentally includes an API path like `/api`, `/api/v1`, `/api/v2`, etc., it will be automatically stripped to prevent double-path issues like `/api/v1/api/v1`.

**Patterns that are automatically stripped:**
- `/api/v1`, `/api/v1/`
- `/api/v2`, `/api/v2/` (or any version number)
- `/api`, `/api/`

**Diagnostics:** Visit the Settings page to see the effective API configuration including:
- `API Basis`: The final URL used for API calls
- `Build VITE_API_URL`: The raw build-time value
- `Browser Oorsprong`: The current browser origin

## API Client Architecture

### File: `src/lib/api.ts`

```typescript
// Axios instance with interceptors
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Request interceptor - inject JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor - handle 401 errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

### API Modules

#### Authentication API
- `authApi.login(credentials)` - Login with email/password
- `authApi.register(data)` - Create new user account
- `authApi.me()` - Get current user info

#### Transaction API
- `transactionApi.getStats()` - Fetch dashboard statistics

#### Document API
- `documentApi.upload(file, administrationId?)` - Upload invoice document

## Auth Context

### File: `src/lib/AuthContext.tsx`

Provides global authentication state:

```typescript
const { 
  user,              // Current user object
  isAuthenticated,   // Boolean: logged in status
  isLoading,         // Boolean: loading state
  login,             // Function: authenticate user
  register,          // Function: create new account
  logout,            // Function: clear session
  hasPermission,     // Function: check role permissions
  checkSession       // Function: validate current token
} = useAuth()
```

### Role Hierarchy
- `admin` (level 3) - Full access
- `accountant` (level 2) - Professional features
- `zzp` (level 1) - Self-employed features

## Components

### LoginPage (`src/components/LoginPage.tsx`)
- Tabbed interface: Login / Register
- Form validation
- Email + Password authentication
- Role selection for registration

### Dashboard (`src/components/Dashboard.tsx`)
- KPI cards with real-time data
- Recent transactions list
- Status badges (Draft, Posted, Reconciled, Void)
- Currency formatting (EUR)
- Manual refresh button
- Error handling with retry

### UploadPortal (`src/components/UploadPortal.tsx`)
- Drag & drop file upload
- Multiple file queue management
- Individual file upload with progress
- Batch upload functionality
- Success/Error state management
- Document ID tracking after upload

## API Endpoints Used

### Authentication
```
POST /api/v1/auth/login
  Body: username (email), password (form-urlencoded)
  Returns: { access_token, token_type }

POST /api/v1/auth/register
  Body: { email, password, full_name, role }
  Returns: User object

GET /api/v1/auth/me
  Headers: Authorization: Bearer {token}
  Returns: User object
```

### Transactions
```
GET /api/v1/transactions/stats
  Headers: Authorization: Bearer {token}
  Returns: {
    total_transactions: number
    draft_count: number
    posted_count: number
    total_debit: number
    total_credit: number
    recent_transactions: Transaction[]
  }
```

### Documents
```
POST /api/v1/documents
  Headers: 
    Authorization: Bearer {token}
    Content-Type: multipart/form-data
  Body: FormData with 'file' field
  Returns: { message, document_id }
```

## Error Handling

### Network Errors
```typescript
if (error.message === 'Network Error') {
  return 'Cannot connect to server. Please ensure the backend is running at http://localhost:8000'
}
```

### API Errors
```typescript
if (error.response?.data?.detail) {
  return error.response.data.detail
}
```

### User Feedback
- **Success**: Green toast notifications with Sonner
- **Errors**: Red toast notifications with detailed messages
- **Loading**: Skeleton loaders and disabled buttons
- **Network Down**: Alert banner with retry button

## User Flow

### First Time User
1. Visit app → Redirected to Login page
2. Click "Register" tab
3. Fill form: Name, Email, Password, Role
4. Submit → Account created
5. Switch to "Login" tab
6. Enter credentials → JWT token received
7. Redirected to Dashboard

### Existing User
1. Visit app → Session check
2. If valid token → Dashboard
3. If invalid → Login page
4. Login → Token stored → Dashboard

### Uploading Invoices
1. Click "Upload Invoices" tab
2. Drag files or click to browse
3. Files appear in queue (Pending status)
4. Click "Upload All" or individual "Upload"
5. Progress bar shows upload status
6. Success → Document ID received
7. Spark OCR processor detects file
8. Draft transaction created in backend
9. Appears in Dashboard → Recent Transactions

## Development Tips

### Testing Without Backend

Mock the API responses:
```typescript
// In src/lib/api.ts
export const transactionApi = {
  getStats: async () => ({
    total_transactions: 42,
    draft_count: 5,
    posted_count: 37,
    total_debit: 15000,
    total_credit: 15000,
    recent_transactions: []
  })
}
```

### CORS Issues

Ensure FastAPI has CORS configured:
```python
# backend/app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Token Expiration

Tokens expire after 7 days (backend default). On 401 error:
- User is logged out automatically
- Redirected to login page
- Must re-authenticate

## Next Steps

### Planned Features
- [ ] Transaction detail view
- [ ] Edit draft transactions
- [ ] Approve/Post transactions
- [ ] Administration (company) selector
- [ ] Fiscal year management
- [ ] General ledger browser
- [ ] Balance sheet report
- [ ] Profit & Loss report
- [ ] VAT declaration export
- [ ] Multi-language support (Dutch/English)
- [ ] Dark mode toggle

### Backend Requirements
These features require additional backend endpoints:
- `GET /api/v1/transactions` - List all transactions
- `GET /api/v1/transactions/{id}` - Get transaction details
- `PUT /api/v1/transactions/{id}` - Update transaction
- `POST /api/v1/transactions/{id}/post` - Post transaction
- `GET /api/v1/administrations` - List user's companies
- `GET /api/v1/reports/balance-sheet` - Balance sheet
- `GET /api/v1/reports/profit-loss` - P&L statement

## Troubleshooting

### "Cannot connect to server"
**Cause**: Backend not running or wrong URL  
**Fix**: 
1. Start FastAPI: `uvicorn app.main:app --reload`
2. Check `.env` file has correct `VITE_API_URL`

### "401 Unauthorized" on every request
**Cause**: Token expired or invalid  
**Fix**: Logout and login again

### Upload fails silently
**Cause**: Backend document endpoint not implemented  
**Fix**: Check browser console for error details

### Dashboard shows no data
**Cause**: No transactions in database  
**Fix**: Upload invoices or create test data in backend

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                       │
│                  (http://localhost:5173)                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  LoginPage   │  │  Dashboard   │  │UploadPortal  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                  │         │
│         └─────────┬───────┴──────────────────┘         │
│                   │                                     │
│           ┌───────▼────────┐                           │
│           │  AuthContext   │                           │
│           │  (JWT Session) │                           │
│           └───────┬────────┘                           │
│                   │                                     │
│           ┌───────▼────────┐                           │
│           │  Axios Client  │                           │
│           │  (Interceptors)│                           │
│           └───────┬────────┘                           │
└───────────────────┼─────────────────────────────────────┘
                    │ HTTP Requests
                    │ Bearer Token
┌───────────────────▼─────────────────────────────────────┐
│                  FastAPI Backend                        │
│               (http://localhost:8000)                   │
├─────────────────────────────────────────────────────────┤
│  /api/v1/auth/login                                     │
│  /api/v1/auth/register                                  │
│  /api/v1/auth/me                                        │
│  /api/v1/transactions/stats                             │
│  /api/v1/documents                                      │
└─────────────────────────────────────────────────────────┘
```

## License

Part of the Smart Accounting Platform project.
