#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

python - <<'PY'
from app.main import app

routes = {route.path for route in app.routes}
required_routes = {"/health", "/openapi.json", "/docs"}
missing = sorted(required_routes - routes)

if missing:
    raise SystemExit(f"Missing required routes: {missing}")

print(f"✅ Backend app import smoke test passed ({len(routes)} routes registered)")
PY
