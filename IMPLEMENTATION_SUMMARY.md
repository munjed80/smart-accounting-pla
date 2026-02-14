# Implementation Summary - System Admin Layer

## DB changes
- Added Alembic migration `030_super_admin_subscriptions` with:
  - `plans` table
  - `subscriptions` table
  - `admin_audit_log` table
- Added ORM models:
  - `Plan`
  - `Subscription`
  - `AdminAuditLog`
- Added `super_admin` role support in role constants.

## New endpoints (`/api/v1/admin/*`)
- `GET /admin/overview`
- `GET /admin/administrations`
- `GET /admin/users`
- `PATCH /admin/users/{user_id}/status`
- `PATCH /admin/administrations/{admin_id}/subscription`
- `POST /admin/impersonate/{user_id}`

All admin endpoints now require super-admin role and return `403` for non-super-admin users.

## Frontend routes/components
- Added new route/tab: `/admin`
- Added sidebar entry **Systeembeheer** visible only for `super_admin`
- Added `AdminDashboard` with tabs:
  - Overzicht
  - Bedrijven
  - Gebruikers
  - Abonnementen
- Added admin API client methods in `src/lib/api.ts`.

## How to create the first `super_admin`
Use seed env vars:
- `SEED_SUPER_ADMIN_EMAIL`
- `SEED_SUPER_ADMIN_PASSWORD`
- optional: `SEED_SUPER_ADMIN_NAME`

Then run:
```bash
python backend/seed.py
```

Also add the email to `ADMIN_WHITELIST` so privileged login is allowed.
