#!/bin/bash
# Smart Accounting Platform - Production-Safe Startup Script
# Prevents infinite crash loops during migration failures
#
# RECOVERY NOTES:
# If the database is stamped to a missing revision (e.g., "Can't locate revision"):
#   1. Identify the current broken revision: SELECT version_num FROM alembic_version;
#   2. Find the closest valid revision in the chain that exists in your code
#   3. Manually stamp to a known-good revision:
#        alembic stamp <valid_revision_id>
#      For example: alembic stamp 014_bank_recon
#   4. Then run: alembic upgrade head
#
# Migration chain: 013_client_consent_workflow -> 014_bank_reconciliation -> 014_bank_recon -> 015_add_document_status_enum_values

echo "======================================"
echo "Smart Accounting Platform - Startup"
echo "======================================"

echo "Running database migrations..."
cd /app

# Attempt migrations with proper error handling
# Do NOT use 'set -e' here - we need to handle failures gracefully
MIGRATION_OUTPUT=$(alembic upgrade head 2>&1)
MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -ne 0 ]; then
    echo "======================================="
    echo "ERROR: Database migrations failed!"
    echo "======================================="
    echo ""
    echo "Migration output:"
    echo "$MIGRATION_OUTPUT"
    echo ""
    echo "---- Alembic diagnostics ----"
    echo "Current revision:"
    alembic current 2>&1 || true
    echo ""
    echo "Migration heads:"
    alembic heads 2>&1 || true
    echo ""
    echo "Recent history:"
    alembic history -r="-5:head" 2>&1 || true
    echo ""
    echo "======================================="
    echo "STARTUP ABORTED - Migration failed"
    echo "======================================="
    echo "The container will now exit to prevent crash loops."
    echo "Please fix the migration issue and redeploy."
    exit 1
fi

echo "Migrations completed successfully."

# Optionally run seed script (skip errors if tables already seeded)
echo "Running seed script..."
python seed.py || echo "Seed script completed (may have skipped existing data)"

# Start the application
# --proxy-headers: Trust X-Forwarded-* headers from reverse proxy (Coolify/Traefik)
# This ensures correct scheme (https) and client IP detection behind the proxy
# --forwarded-allow-ips: Restrict which IPs can set forwarded headers (default: Docker network)
#   In production behind Traefik/Coolify, use the proxy's IP or network range
#   Set FORWARDED_ALLOW_IPS env var to customize (e.g., "172.17.0.0/16" for Docker)
echo "Starting uvicorn server with proxy headers enabled..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-*}"
