#!/usr/bin/env python3
"""Standalone VPS operations. Python 3.12+, Docker Compose 2.30+, restic."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
KEYS = set(json.loads((ROOT / "app-env-keys.json").read_text()))
SERVICES = ("backend", "frontend", "worker")


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def private_write(path, text):
    with path.open("x", encoding="utf-8") as handle:
        os.chmod(path, 0o600)
        handle.write(text)


def raw_env(values):
    for key, value in values.items():
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or any(
            c in str(value) for c in "\r\n\x00"
        ):
            raise ValueError("Environment keys and values must be single-line strings")
    return "".join(f"{key}={value}\n" for key, value in sorted(values.items()))


def read_env(path):
    result = {}
    for line in path.read_text().splitlines():
        if line and not line.startswith("#"):
            key, value = line.split("=", 1)
            result[key] = value
    return result


def export_runtime(container, output):
    # Capture rather than printing docker inspect: it contains live credentials.
    result = run(["docker", "inspect", container], capture_output=True, text=True)
    data = json.loads(result.stdout)[0]["Config"]["Env"]
    env = dict(item.split("=", 1) for item in data)
    private_write(
        output, json.dumps({k: v for k, v in env.items() if k in KEYS}, indent=2) + "\n"
    )


def initialize(args):
    if args.config.exists():
        raise ValueError(
            "Configuration directory already exists; refusing to overwrite secrets"
        )
    for domain in (args.app_domain, args.api_domain):
        if (
            not re.fullmatch(r"(?=.{3,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", domain)
            or "." not in domain
        ):
            raise ValueError("Use DNS hostnames without schemes or paths")
    if args.app_domain == args.api_domain:
        raise ValueError("Frontend and API need separate hostnames")
    imported = json.loads(args.import_json.read_text()) if args.import_json else {}
    if not isinstance(imported, dict) or any(
        not isinstance(v, str) for v in imported.values()
    ):
        raise ValueError("Runtime export must be a JSON object of strings")
    secret = imported.get("SECRET_KEY", "")
    if args.fresh_install:
        secret = secrets.token_hex(32)
    elif len(secret) < 32:
        raise ValueError(
            "Migration requires the existing SECRET_KEY. Use export first; do not replace encrypted-data keys"
        )
    password = secrets.token_hex(32)
    db = f'postgresql://zzpershub:{quote(password,safe="")}@db:5432/zzpershub'
    backend = {k: v for k, v in imported.items() if k in KEYS}
    backend.update(
        ENV="production",
        DEBUG="false",
        PORT="8000",
        SECRET_KEY=secret,
        DATABASE_URL=db.replace("postgresql://", "postgresql+asyncpg://", 1),
        DATABASE_URL_SYNC=db,
        REDIS_URL="redis://redis:6379/0",
        UPLOAD_DIR=imported.get("UPLOAD_DIR", "/data/uploads"),
        APP_URL=f"https://{args.api_domain}",
        APP_PUBLIC_URL=f"https://{args.api_domain}",
        FRONTEND_URL=f"https://{args.app_domain}",
        CORS_ORIGINS=f"https://{args.app_domain}",
    )
    # Validate values before creating anything; raw env files preserve $, quotes and backslashes.
    backend_text = raw_env(backend)
    server = dict(
        APP_DOMAIN=args.app_domain,
        API_DOMAIN=args.api_domain,
        ACME_EMAIL=args.acme_email,
        POSTGRES_USER="zzpershub",
        POSTGRES_DB="zzpershub",
        POSTGRES_PASSWORD=password,
        POSTGRES_IMAGE=f"postgres:{args.postgres_major}-alpine",
        DATA_DIR=str(args.data.resolve()),
        UPLOAD_DIR=backend["UPLOAD_DIR"],
    )
    if any(c.isspace() or c in "$\"'" for c in server["DATA_DIR"]):
        raise ValueError("Data path must not contain whitespace, quotes or dollars")
    if not re.fullmatch(r"[A-Za-z0-9_.+@-]+", args.acme_email):
        raise ValueError("Invalid ACME email")
    if not server["UPLOAD_DIR"].startswith("/") or any(
        c.isspace() or c in "$\"'" for c in server["UPLOAD_DIR"]
    ):
        raise ValueError(
            "Upload mount path must be absolute without interpolation characters"
        )
    args.config.mkdir(parents=True, mode=0o700)
    private_write(args.config / "server.env", raw_env(server))
    private_write(args.config / "backend.env", backend_text)
    private_write(
        args.config / "worker.env",
        raw_env(dict(DATABASE_URL=db, REDIS_URL="redis://redis:6379/0")),
    )
    private_write(
        args.config / "backup.env",
        raw_env(
            dict(
                RESTIC_REPOSITORY="REPLACE_WITH_OFFSITE_REPOSITORY",
                RESTIC_PASSWORD=secrets.token_hex(32),
                AWS_ACCESS_KEY_ID="",
                AWS_SECRET_ACCESS_KEY="",
            )
        ),
    )
    print(
        "Configuration created. Secret values were not printed. Configure backup.env before production deployment."
    )


def load_release(path):
    release = json.loads((path / "release.json").read_text())
    if not re.fullmatch(r"[0-9a-f]{40}", release["commit"]):
        raise ValueError("Release commit must be a complete SHA")
    if not re.fullmatch(r"[A-Za-z0-9_]{1,128}", release["schema_revision"]):
        raise ValueError("Invalid schema revision")
    for name in SERVICES:
        if not re.fullmatch(
            r"ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}", release["images"][name]
        ):
            raise ValueError("Application images must be GHCR digest references")
    return release


class Stack:
    def __init__(self, config, release):
        self.config, self.release = config.resolve(), release.resolve()
        self.metadata = load_release(self.release)
        self.settings = read_env(self.config / "server.env")
        if (
            self.metadata["api_url"].rstrip("/")
            != f"https://{self.settings['API_DOMAIN']}"
        ):
            raise ValueError(
                "Release frontend API URL does not match server configuration; rebuild the frontend"
            )
        self.data = Path(self.settings["DATA_DIR"])
        if not self.data.is_absolute() or self.data == Path("/"):
            raise ValueError("DATA_DIR must be an absolute dedicated directory")
        for file in ["server.env", "backend.env", "worker.env", "backup.env"]:
            if (self.config / file).stat().st_mode & 0o077:
                raise ValueError(f"{file} must have permission 0600")
        self.env = dict(os.environ, **self.settings, CONFIG_DIR=str(self.config))
        self.env.update(
            {
                f"{name.upper()}_IMAGE": self.metadata["images"][name]
                for name in SERVICES
            }
        )

    def compose(self, *args, **kwargs):
        return run(
            [
                "docker",
                "compose",
                "--project-name",
                "zzpershub",
                "--env-file",
                str(self.config / "server.env"),
                "-f",
                str(self.release / "compose.yml"),
                *args,
            ],
            env=self.env,
            **kwargs,
        )

    def database(self, command, **kwargs):
        return self.compose("exec", "-T", "db", "sh", "-ceu", command, **kwargs)

    def revision(self):
        command = """if [ "$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT to_regclass('public.alembic_version') IS NOT NULL")" = t ]; then
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc 'SELECT version_num FROM alembic_version ORDER BY version_num';
        else printf unversioned; fi"""
        return self.database(command, capture_output=True, text=True).stdout.strip()

    def maintenance(self, enabled):
        if self.compose(
            "ps", "--status", "running", "-q", "caddy", capture_output=True, text=True
        ).stdout.strip():
            name = "Caddyfile.maintenance" if enabled else "Caddyfile"
            self.compose(
                "exec",
                "-T",
                "caddy",
                "caddy",
                "reload",
                "--config",
                f"/etc/caddy/{name}",
                "--adapter",
                "caddyfile",
            )

    def quiesce(self):
        self.maintenance(True)
        self.compose("stop", "-t", "120", "backend", "worker")

    def resume(self):
        self.compose(
            "up",
            "-d",
            "--wait",
            "--wait-timeout",
            "240",
            "backend",
            "frontend",
            "worker",
        )
        self.maintenance(False)


def checksum(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def backup(stack, offsite=True):
    if stack.compose(
        "ps",
        "--status",
        "running",
        "-q",
        "backend",
        "worker",
        capture_output=True,
        text=True,
    ).stdout.strip():
        raise ValueError("Writers must be stopped before a consistent backup")
    if offsite:
        backup_environment(stack)
    target = (
        stack.data.parent
        / "backups"
        / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    )
    target.mkdir(parents=True, mode=0o700)
    with (target / "database.dump").open("wb") as handle:
        stack.database(
            'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl -Fc',
            stdout=handle,
        )
    stack.compose("exec", "-T", "redis", "redis-cli", "SAVE")
    stack.compose("stop", "redis")
    try:
        for name in ["uploads", "redis"]:
            (stack.data / name).mkdir(parents=True, exist_ok=True)
            with tarfile.open(target / f"{name}.tar.gz", "w:gz") as archive:
                archive.add(stack.data / name, arcname=name)
    finally:
        stack.compose("up", "-d", "--wait", "redis")
    shutil.copytree(stack.config, target / "configuration")
    shutil.copytree(stack.release, target / "release")
    files = {
        str(p.relative_to(target)): checksum(p)
        for p in target.rglob("*")
        if p.is_file()
    }
    (target / "manifest.json").write_text(
        json.dumps(dict(version=1, revision=stack.revision(), files=files), indent=2)
    )
    if offsite:
        upload_snapshot(stack, target)
    print(f"Backup completed: {target}")
    return target


def backup_environment(stack):
    env = dict(os.environ, **read_env(stack.config / "backup.env"))
    if not env["RESTIC_REPOSITORY"].startswith(
        ("s3:https://", "sftp:", "rest:https://", "azure:", "gs:", "b2:")
    ):
        raise ValueError("Configure an initialized OFF-SERVER restic repository")
    if not shutil.which("restic"):
        raise ValueError("Install restic before deploying")
    return env


def upload_snapshot(stack, target):
    run(
        ["restic", "backup", str(target), "--tag", "zzpershub"],
        env=backup_environment(stack),
    )


def restore(stack, snapshot):
    manifest = json.loads((snapshot / "manifest.json").read_text())
    for name, digest in manifest["files"].items():
        candidate = snapshot / name
        path = candidate.resolve()
        if (
            candidate.is_symlink()
            or not path.is_relative_to(snapshot.resolve())
            or checksum(path) != digest
        ):
            raise ValueError("Backup checksum/path validation failed")
    for required in ["database.dump", "uploads.tar.gz", "redis.tar.gz"]:
        if required not in manifest["files"]:
            raise ValueError("Backup is incomplete")
    if stack.compose(
        "ps",
        "--status",
        "running",
        "-q",
        "backend",
        "worker",
        capture_output=True,
        text=True,
    ).stdout.strip():
        raise ValueError("Restore requires stopped writers")
    count = stack.database(
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname=\'public\'"',
        capture_output=True,
        text=True,
    ).stdout.strip()
    if count != "0" or any((stack.data / "uploads").glob("*")):
        raise ValueError(
            "Restore requires an EMPTY database and upload directory; existing data is never deleted"
        )
    # Validate archives before touching the database; reject links and special files.
    with tempfile.TemporaryDirectory(dir=stack.data.parent) as temporary:
        destination = Path(temporary)
        for name in ["uploads", "redis"]:
            with tarfile.open(snapshot / f"{name}.tar.gz") as archive:
                for item in archive.getmembers():
                    if (
                        not (item.isfile() or item.isdir())
                        or Path(item.name).parts[0] != name
                    ):
                        raise ValueError("Unsafe backup archive member")
                archive.extractall(destination, filter="data")
        with (snapshot / "database.dump").open("rb") as handle:
            stack.database(
                'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error',
                stdin=handle,
            )
        stack.compose("stop", "redis")
        for name in ["uploads", "redis"]:
            current = stack.data / name
            if current.exists():
                current.rename(
                    stack.data / f"{name}.before-restore-{secrets.token_hex(4)}"
                )
            shutil.move(str(destination / name), current)
        # Older Coolify installations may have only an RDB snapshot. Load it
        # first with AOF off, then let Redis generate a valid AOF from live data.
        rdb_only = (
            (stack.data / "redis/dump.rdb").exists()
            and not (stack.data / "redis/appendonlydir").exists()
            and not (stack.data / "redis/appendonly.aof").exists()
        )
        if rdb_only:
            stack.env["REDIS_APPENDONLY"] = "no"
            stack.compose("up", "-d", "--wait", "redis")
            key_count = stack.compose(
                "exec",
                "-T",
                "redis",
                "redis-cli",
                "DBSIZE",
                capture_output=True,
                text=True,
            ).stdout.strip()
            stack.compose(
                "exec", "-T", "redis", "redis-cli", "CONFIG", "SET", "appendonly", "yes"
            )
            for attempt in range(120):
                info = stack.compose(
                    "exec",
                    "-T",
                    "redis",
                    "redis-cli",
                    "INFO",
                    "persistence",
                    capture_output=True,
                    text=True,
                ).stdout
                if (
                    "aof_rewrite_in_progress:0" in info
                    and "aof_rewrite_scheduled:0" in info
                    and "aof_last_bgrewrite_status:ok" in info
                ):
                    break
                time.sleep(1)
            else:
                raise ValueError(
                    "Redis AOF conversion has not completed; writers remain stopped"
                )
            del stack.env["REDIS_APPENDONLY"]
        stack.compose("up", "-d", "--wait", "redis")
        if (
            rdb_only
            and stack.compose(
                "exec",
                "-T",
                "redis",
                "redis-cli",
                "DBSIZE",
                capture_output=True,
                text=True,
            ).stdout.strip()
            != key_count
        ):
            raise ValueError(
                "Redis key count changed during AOF conversion; writers remain stopped"
            )
    print(
        "Restore completed with services stopped. Verify records/files before deployment."
    )


def deploy(stack, fresh=False, rollback=False):
    stack.compose("config", "--quiet")
    if not stack.compose(
        "ps", "--status", "running", "-q", "caddy", capture_output=True, text=True
    ).stdout.strip():
        import socket

        for port, kind in [
            (80, socket.SOCK_STREAM),
            (443, socket.SOCK_STREAM),
            (443, socket.SOCK_DGRAM),
        ]:
            with socket.socket(socket.AF_INET, kind) as listener:
                listener.bind(("0.0.0.0", port))
    stack.compose("pull", *SERVICES)
    stack.compose(
        "run",
        "--rm",
        "--no-deps",
        "--entrypoint",
        "python",
        "backend",
        "-c",
        "from app.core.config import settings; settings.validate_production_environment()",
    )
    stack.compose("up", "-d", "--wait", "db", "redis")
    before = stack.revision()
    if before == "unversioned" and not fresh:
        raise ValueError(
            "Database is unversioned: restore the existing database first, or explicitly choose --fresh-install"
        )
    if rollback and before != stack.metadata["schema_revision"]:
        raise ValueError(
            "Code rollback refused: database revision differs from target release. No automatic downgrade is allowed"
        )
    if before == "unversioned":
        count = stack.database(
            'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname=\'public\'"',
            capture_output=True,
            text=True,
        ).stdout.strip()
        if count != "0":
            raise ValueError("Fresh installation requires an empty database")
    stack.quiesce()
    backup(stack)
    # Any failure after quiescing leaves maintenance enabled for operator recovery.
    if not rollback:
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
    if stack.revision() != stack.metadata["schema_revision"]:
        raise ValueError(
            "Database revision does not match the release; maintenance remains enabled"
        )
    stack.compose(
        "up", "-d", "--wait", "--wait-timeout", "240", "backend", "frontend", "worker"
    )
    stack.compose("up", "-d", "caddy")
    stack.maintenance(False)
    try:
        for url in [
            f"https://{stack.settings['APP_DOMAIN']}/healthz",
            f"https://{stack.settings['API_DOMAIN']}/health",
        ]:
            with urlopen(url, timeout=20) as response:
                if response.status != 200:
                    raise ValueError("Public health check failed")
        current = stack.config / "current.json"
        if current.exists():
            shutil.copyfile(current, stack.config / "previous.json")
        temporary = stack.config / "current.json.tmp"
        temporary.write_text(
            json.dumps(
                dict(release=str(stack.release), commit=stack.metadata["commit"])
            )
        )
        temporary.replace(current)
    except Exception:
        stack.maintenance(True)
        raise
    print("Deployment healthy. Database upgrades were not automatically reversed.")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export-runtime")
    export.add_argument("--container", required=True)
    export.add_argument("--output", type=Path, required=True)
    init = sub.add_parser("init")
    init.add_argument("--config", type=Path, required=True)
    init.add_argument("--data", type=Path, default=Path("/srv/zzpershub/data"))
    init.add_argument("--app-domain", default="zzpershub.nl")
    init.add_argument("--api-domain", default="api.zzpershub.nl")
    init.add_argument("--acme-email", default="info@zzpershub.nl")
    init.add_argument("--postgres-major", required=True, choices=["15", "16", "17"])
    choice = init.add_mutually_exclusive_group(required=True)
    choice.add_argument("--import-json", type=Path)
    choice.add_argument("--fresh-install", action="store_true")
    for name in ["deploy", "rollback", "backup", "restore", "status"]:
        action = sub.add_parser(name)
        action.add_argument("--config", type=Path, required=True)
        action.add_argument(
            "--release", type=Path, required=name not in ("backup", "status")
        )
        if name == "deploy":
            action.add_argument("--fresh-install", action="store_true")
        if name == "restore":
            action.add_argument("--snapshot", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "export-runtime":
        return export_runtime(args.container, args.output)
    if args.command == "init":
        return initialize(args)
    if os.environ.get("DOCKER_HOST", "").startswith(("tcp:", "ssh:")):
        raise ValueError(
            "Run operations directly on the VPS with its local Docker socket"
        )
    if args.command in ("backup", "status") and not args.release:
        args.release = Path(
            json.loads((args.config / "current.json").read_text())["release"]
        )
    stack = Stack(args.config, args.release)
    version = (
        run(["docker", "compose", "version", "--short"], capture_output=True, text=True)
        .stdout.strip()
        .lstrip("v")
    )
    if tuple(int(n) for n in version.split(".")[:2]) < (2, 30):
        raise ValueError(
            "Docker Compose 2.30+ is required for literal environment files"
        )
    with (stack.config / "operation.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command in ("deploy", "rollback"):
            return deploy(
                stack, getattr(args, "fresh_install", False), args.command == "rollback"
            )
        if args.command == "restore":
            return restore(stack, args.snapshot)
        if args.command == "status":
            return stack.compose("ps")
        backup_environment(stack)
        stack.quiesce()
        try:
            snapshot = backup(stack, offsite=False)
        finally:
            stack.resume()
        upload_snapshot(stack, snapshot)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        # Do not echo exception payloads that might contain credentials.
        detail = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(
            f"Operation failed: {detail}. Services may remain in maintenance; inspect the failed phase before resuming.",
            file=sys.stderr,
        )
        raise SystemExit(1)
