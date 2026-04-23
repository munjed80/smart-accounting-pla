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

cd /app

# Pre-flight: validate environment configuration before touching the database.
# This surfaces missing/insecure SECRET_KEY, DATABASE_URL placeholders, missing
# public URLs, missing Mollie webhook secret, etc., with a single readable error.
# In non-production, problems are logged as warnings and startup continues.
echo "Validating environment configuration..."
python -c "from app.core.config import settings; settings.validate_production_environment()"
PREFLIGHT_EXIT_CODE=$?
if [ $PREFLIGHT_EXIT_CODE -ne 0 ]; then
    echo "======================================="
    echo "ERROR: Environment configuration is invalid!"
    echo "======================================="
    echo "Fix the reported issues (typically via Coolify environment variables)"
    echo "and redeploy. Startup aborted to prevent running with unsafe defaults."
    exit 1
fi
echo "Environment configuration OK."

echo "Running database migrations..."

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
    alembic history 2>&1 | tail -n 20 || true
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
#   Set FORWARDED_ALLOW_IPS env var to customize (default: "172.16.0.0/12" for Docker networks)
echo "Starting uvicorn server with proxy headers enabled..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-172.16.0.0/12}"
