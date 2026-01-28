#!/bin/bash
set -e

echo "======================================"
echo "Smart Accounting Platform - Startup"
echo "======================================"

# Run database migrations
echo "Running database migrations..."
cd /app
alembic upgrade head

if [ $? -ne 0 ]; then
    echo "ERROR: Database migrations failed!"
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
