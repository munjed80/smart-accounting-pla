"""Package OFFLINE Coolify exports for the same verified restore path."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
from ops import checksum

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--database", type=Path, required=True)
parser.add_argument("--uploads", type=Path, required=True)
parser.add_argument("--evidence", type=Path, required=True)
parser.add_argument("--redis", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--source-writers-stopped", action="store_true", required=True)
args = parser.parse_args()
if args.output.exists():
    raise SystemExit("Output already exists")
with args.database.open("rb") as handle:
    if handle.read(5) != b"PGDMP":
        raise SystemExit("Use a custom-format pg_dump (-Fc)")
args.output.mkdir(parents=True, mode=0o700)
for source, name in [
    (args.database, "database.dump"),
    (args.uploads, "uploads.tar.gz"),
    (args.evidence, "evidence.tar.gz"),
    (args.redis, "redis.tar.gz"),
]:
    shutil.copyfile(source, args.output / name)
    (args.output / name).chmod(0o600)
files = {p.name: checksum(p) for p in args.output.iterdir()}
(args.output / "manifest.json").write_text(
    json.dumps(
        dict(
            version=1,
            source="offline-coolify-export",
            created_at=datetime.now(timezone.utc).isoformat(),
            files=files,
        ),
        indent=2,
    )
)
print(
    "Import snapshot packaged. Checksums prove integrity, not source consistency; keep source writers stopped until cutover."
)
