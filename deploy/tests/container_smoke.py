"""Disposable CI only: build/start, migrate, back up, restore and check real data."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
import ops

if os.environ.get("GITHUB_ACTIONS") != "true" or not os.environ.get("RUNNER_TEMP"):
    raise SystemExit(
        "This destructive disposable-database test runs only on a GitHub runner"
    )

base = Path(tempfile.mkdtemp(prefix="zzp-smoke-", dir=os.environ["RUNNER_TEMP"]))
args = argparse.Namespace(
    config=base / "config",
    data=base / "data",
    app_domain="app.zzp.example",
    api_domain="api.zzp.example",
    acme_email="ops@example.com",
    postgres_major="15",
    import_json=None,
    fresh_install=True,
)
ops.initialize(args)
# Local image names exist only in this disposable harness. Production Stack rejects mutable tags.
stack = ops.Stack.__new__(ops.Stack)
stack.config = args.config
stack.data = args.data
stack.release = ROOT
stack.settings = ops.read_env(args.config / "server.env")
stack.env = dict(
    os.environ,
    **stack.settings,
    CONFIG_DIR=str(stack.config),
    BACKEND_IMAGE="zzp-backend:ci",
    FRONTEND_IMAGE="zzp-frontend:ci",
    WORKER_IMAGE="zzp-worker:ci"
)
stack.metadata = dict(commit="a" * 40)
try:
    stack.compose("config", "--quiet")
    stack.compose("up", "-d", "--wait", "db", "redis")
    stack.compose(
        "run",
        "--rm",
        "--no-deps",
        "--entrypoint",
        "alembic",
        "backend",
        "upgrade",
        "head",
    )
    stack.compose(
        "up", "-d", "--wait", "--wait-timeout", "240", "backend", "frontend", "worker"
    )
    stack.compose(
        "exec",
        "-T",
        "backend",
        "python",
        "-c",
        "import urllib.request,json; assert json.load(urllib.request.urlopen('http://localhost:8000/health'))['status']=='healthy'",
    )
    stack.compose(
        "run",
        "--rm",
        "--no-deps",
        "--entrypoint",
        "python",
        "backend",
        "-c",
        "from app.services.invoice_pdf_reportlab import generate_invoice_pdf_reportlab; from app.services.invoice_pdf import generate_invoice_pdf; print('PDF runtime imports OK')",
    )
    stack.compose(
        "run",
        "--rm",
        "--no-deps",
        "caddy",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
        "--adapter",
        "caddyfile",
    )
    stack.compose(
        "run",
        "--rm",
        "--no-deps",
        "caddy",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile.maintenance",
        "--adapter",
        "caddyfile",
    )
    stack.database(
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "CREATE TABLE deployment_probe(value text); INSERT INTO deployment_probe VALUES (\'retained\');"'
    )
    (stack.data / "uploads").mkdir(parents=True, exist_ok=True)
    (stack.data / "uploads/probe.txt").write_text("original uploaded bytes")
    (stack.data / "evidence").mkdir(parents=True, exist_ok=True)
    (stack.data / "evidence/probe.txt").write_text("original evidence bytes")
    stack.compose(
        "exec", "-T", "redis", "redis-cli", "SET", "deployment-probe", "retained"
    )
    stack.quiesce()
    # Copy only deploy runtime files into the snapshot; ROOT contains this running test file.
    clean_release = base / "release"
    shutil.copytree(
        ROOT,
        clean_release,
        ignore=shutil.ignore_patterns("tests", "config", "__pycache__"),
    )
    stack.release = clean_release
    saved = ops.backup(stack, offsite=False)
    for mode in ["aof", "rdb"]:
        if mode == "rdb":
            import io
            import tarfile

            with tarfile.open(saved / "redis.tar.gz") as archive:
                rdb = archive.extractfile("redis/dump.rdb").read()
            with tarfile.open(saved / "redis.tar.gz", "w:gz") as archive:
                entry = tarfile.TarInfo("redis/dump.rdb")
                entry.size = len(rdb)
                archive.addfile(entry, io.BytesIO(rdb))
            manifest = json.loads((saved / "manifest.json").read_text())
            manifest["files"]["redis.tar.gz"] = ops.checksum(saved / "redis.tar.gz")
            (saved / "manifest.json").write_text(json.dumps(manifest))
        # Explicitly disposable: erase this test database and fixture uploads to exercise EMPTY-target restore.
        stack.database(
            'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
        )
        (stack.data / "uploads/probe.txt").unlink()
        (stack.data / "evidence/probe.txt").unlink()
        stack.compose(
            "exec", "-T", "redis", "redis-cli", "SET", "deployment-probe", "changed"
        )
        ops.restore(stack, saved)
        assert (
            stack.database(
                'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT value FROM deployment_probe"',
                capture_output=True,
                text=True,
            ).stdout.strip()
            == "retained"
        )
        assert (
            stack.data / "uploads/probe.txt"
        ).read_text() == "original uploaded bytes"
        assert (
            stack.compose(
                "exec",
                "-T",
                "redis",
                "redis-cli",
                "GET",
                "deployment-probe",
                capture_output=True,
                text=True,
            ).stdout.strip()
            == "retained"
        )
    stack.resume()
    print(
        "Container smoke: migrations, API, frontend, worker, Caddy validation and DB/upload/Redis restore PASS"
    )
except Exception:
    stack.compose("logs", "--tail", "100")
    ids = stack.compose("ps", "-q", capture_output=True, text=True).stdout.split()
    for container in ids:
        ops.run(
            [
                "docker",
                "inspect",
                "--format",
                "{{.Name}} {{json .State.Health}}",
                container,
            ]
        )
    raise
finally:
    stack.compose("down")
