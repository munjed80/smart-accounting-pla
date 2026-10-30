#!/usr/bin/env python3
"""Update an existing VPS from a successful main release; never regenerate secrets."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

REPOSITORY = "munjed80/smart-accounting-pla"
WORKFLOW = "release-images.yml"


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def github(*args):
    return json.loads(run(["gh", *args], capture_output=True, text=True).stdout)


def validate_release(directory, commit):
    for name in ("ops.py", "update.py", "compose.yml", "app-env-keys.json", "run_current.py",
                 "systemd/zzpershub-backup.service", "systemd/zzpershub-backup.timer"):
        if not (directory / name).is_file():
            raise ValueError(f"Incomplete release: missing {name}")
    metadata = json.loads((directory / "release.json").read_text())
    if metadata.get("commit") != commit:
        raise ValueError("Release commit mismatch; nothing was deployed")
    for name in ("backend", "frontend", "worker"):
        reference = metadata.get("images", {}).get(name, "")
        if not re.fullmatch(
            rf"ghcr.io/{re.escape(REPOSITORY)}/{name}@sha256:[a-f0-9]{{64}}", reference
        ):
            raise ValueError(f"Invalid immutable image reference: {name}")
    return metadata


def install_helpers(release):
    for source, target, mode in (
        ("run_current.py", Path("/opt/zzpershub/run_current.py"), 0o644),
        ("update.py", Path("/usr/local/sbin/zzp-update"), 0o700),
    ):
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".zzp-", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write((release / source).read_bytes())
                handle.flush()
                os.fsync(handle.fileno())
            temporary.chmod(mode)
            temporary.replace(target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def update(config, releases, redeploy=False):
    for name in ("server.env", "backend.env", "worker.env", "backup.env"):
        if not (config / name).is_file():
            raise ValueError(f"Existing configuration required: {name}. Do not run init again")
    commit = github("api", f"repos/{REPOSITORY}/commits/main")["sha"]
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Invalid main commit")
    current = config / "current.json"
    if current.exists() and not redeploy:
        previous = json.loads(current.read_text())
        if previous.get("commit") == commit:
            print(f"Already up to date: {commit[:12]}")
            return
    runs = github(
        "run", "list", "--repo", REPOSITORY, "--workflow", WORKFLOW,
        "--branch", "main", "--commit", commit, "--status", "success",
        "--limit", "10", "--json", "databaseId,headSha,headBranch,event"
    )
    release = next((item for item in runs if item["headSha"] == commit
                    and item["headBranch"] == "main" and item["event"] == "workflow_run"), None)
    if release is None:
        raise ValueError("Latest main release is not ready. Wait for CI and Release images to succeed, then retry")
    if not isinstance(release.get("databaseId"), int):
        raise ValueError("Invalid release run ID")
    releases.mkdir(parents=True, exist_ok=True, mode=0o700)
    print(f"Downloading verified release {commit[:12]}...", flush=True)
    # Download to a fresh directory: never overwrite an accepted or failed release.
    with tempfile.TemporaryDirectory(prefix=".download-", dir=releases) as temporary:
        staged = Path(temporary) / "bundle"
        run(["gh", "run", "download", str(release["databaseId"]), "--repo", REPOSITORY,
             "--name", f"zzpershub-{commit}", "--dir", str(staged)])
        validate_release(staged, commit)
        destination = releases / f"{commit}-{Path(temporary).name.removeprefix('.download-')}"
        staged.rename(destination)
    # ops owns the backup, schema checks, migration, health checks and current.json.
    # Keep the candidate on failure so it remains available for diagnosis/recovery.
    print(f"Deploying {destination}. Existing configuration will be preserved.", flush=True)
    run([sys.executable, str(destination / "ops.py"), "deploy", "--config", str(config),
         "--release", str(destination)])
    # Refresh the stable backup launcher only after ops accepts this release.
    install_helpers(destination)
    print("Update complete. Backup scheduling is unchanged.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("/etc/zzpershub"))
    parser.add_argument("--releases", type=Path, default=Path("/opt/zzpershub/releases"))
    parser.add_argument("--redeploy", action="store_true", help="Retry even if current main is already accepted")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError("Run sudo zzp-update on the VPS")
    for command in ("gh", "docker"):
        if shutil.which(command) is None:
            raise ValueError(f"Required command not installed: {command}")
    if not args.config.is_dir():
        raise ValueError("Existing configuration directory is missing")
    os.umask(0o077)
    with (args.config / "update.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Another update is already running") from None
        update(args.config.resolve(), args.releases.resolve(), args.redeploy)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(f"Update stopped: command exited with code {error.returncode}. "
              "Do not delete data or regenerate configuration. Check the output above.", file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, OSError) as error:
        print(f"Update stopped: {error}", file=sys.stderr)
        sys.exit(1)
