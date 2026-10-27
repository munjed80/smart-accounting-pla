"""Start only target infrastructure before an explicit EMPTY-target restore."""

import argparse
from pathlib import Path
from ops import Stack

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--config", type=Path, required=True)
parser.add_argument("--release", type=Path, required=True)
args = parser.parse_args()
stack = Stack(args.config, args.release)
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
    raise SystemExit("Application writers are running; refusing restore preparation")
stack.compose("up", "-d", "--wait", "db", "redis")
print("Infrastructure ready. Application writers remain stopped.")
