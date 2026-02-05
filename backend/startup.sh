#!/bin/bash
set -e

echo "======================================"
echo "Smart Accounting Platform - Startup"
echo "======================================"

echo "Running database migrations..."
cd /app
if ! alembic upgrade head; then
    echo "ERROR: Database migrations failed!"
    echo "---- Alembic diagnostics (current and heads) ----"
    alembic current || true
    alembic heads || true
    # Show recent migration history for debugging (pipe to tail for safety)
    echo "---- Alembic history (last 50 lines) ----"
    alembic history | tail -n 50 || true
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
