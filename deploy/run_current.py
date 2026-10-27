"""Stable systemd entrypoint: use the successfully deployed release's backup tool."""

import json
import os
from pathlib import Path
import sys

config = Path("/etc/zzpershub")
release = Path(json.loads((config / "current.json").read_text())["release"])
os.execv(
    sys.executable,
    [
        sys.executable,
        str(release / "ops.py"),
        "backup",
        "--config",
        str(config),
        "--release",
        str(release),
    ],
)
