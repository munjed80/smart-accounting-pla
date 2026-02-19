# Strict Audit — Super Admin overview load failure

Scope constrained to:
- why `super_admin` overview fails to load,
- why `Overzicht kon niet geladen worden` appears,
- backend route permissions and frontend admin API calls.

## Playbook note
Requested playbook `ai-playbooks/super-admin-audit.md` was not found in repository. Audit executed manually against current code.

## Architectural findings

### ✅ Root cause of overview load failure is addressed
The previous failure mode is consistent with enum value mismatch between API-side strings and DB enum values. Backend now maps request strings to `SubscriptionStatus` and uses enum values in overview filters:
- mapping added (`trial/active/past_due/canceled` -> enum),
- overview query now filters on `SubscriptionStatus.ACTIVE` / `TRIALING`.

Evidence:
- mapping helpers and maps.【F:backend/app/api/v1/admin.py†L101-L133】
- overview filter uses enum members, not lowercase raw strings.【F:backend/app/api/v1/admin.py†L176-L205】

### ✅ Why “Overzicht kon niet geladen worden” appears
The message is shown when `overviewQuery.isError` is true in Admin dashboard users section. This is an API failure state of `adminApi.getOverview()`.

Evidence:
- query source (`adminApi.getOverview`).【F:src/components/AdminDashboard.tsx†L24-L27】
- error card condition and title text `Overzicht kon niet geladen worden` with retry `refetch()`.【F:src/components/AdminDashboard.tsx†L103-L120】
- endpoint called by adminApi is `/admin/overview` (resolved under `/api/v1`).【F:src/lib/api.ts†L5231-L5235】【F:backend/app/main.py†L259-L260】

### ✅ Frontend admin API calls align with backend routes
Frontend calls:
- `/admin/overview`
- `/admin/administrations`
- `/admin/users`
- `/admin/logs`

All are implemented under admin router.

Evidence:
- frontend call definitions.【F:src/lib/api.ts†L5231-L5259】
- backend route definitions for overview/administrations/users/logs.【F:backend/app/api/v1/admin.py†L165-L169】【F:backend/app/api/v1/admin.py†L224-L231】【F:backend/app/api/v1/admin.py†L310-L316】【F:backend/app/api/v1/admin.py†L360-L365】

### ✅ Permission enforcement is correctly super-admin scoped
Admin routes use `SuperAdminUser`, which depends on `require_super_admin`; guard returns 403 when role != `super_admin`.

Evidence:
- guard definition.【F:backend/app/api/v1/deps.py†L398-L409】
- route dependency usage on admin endpoints.【F:backend/app/api/v1/admin.py†L165-L169】【F:backend/app/api/v1/admin.py†L310-L316】【F:backend/app/api/v1/admin.py†L360-L365】
- tests assert non-super-admin forbidden and super-admin allowed for admin list endpoint.【F:backend/tests/test_admin_system.py†L10-L12】【F:backend/tests/test_admin_system.py†L56-L66】

### ⚠️ Remaining architectural gap (error-path behavior)
For HTTP 401, interceptor hard-redirects to `/login` immediately after creating typed error. That means the admin page cannot present its own inline error card flow for expired sessions, because navigation occurs first.

This is an architecture-level control-flow decision (central auth redirect) and may conflict with page-level error visibility expectations.

Evidence:
- 401 typed mapping + unconditional redirect branch.【F:src/lib/api.ts†L465-L471】【F:src/lib/api.ts†L489-L499】

## Strict conclusion
- **Primary failure cause** of super_admin overview load (enum mismatch) is fixed.
- **Route alignment** between frontend and backend is correct.
- **RBAC enforcement** is correctly super-admin only.
- **One remaining architectural caveat**: 401 path bypasses page-level error rendering due to global redirect.
