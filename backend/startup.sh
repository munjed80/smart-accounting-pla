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
echo "Starting uvicorn server..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
