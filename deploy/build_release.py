"""Assemble a release bundle from CI image digests; no runtime secrets are included."""

import argparse
import json
from pathlib import Path
import shutil
from ops import load_release

parser = argparse.ArgumentParser()
parser.add_argument("--commit", required=True)
parser.add_argument("--repository", required=True)
parser.add_argument("--api-url", required=True)
parser.add_argument("--digests", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
shutil.copytree(
    Path(__file__).parent,
    args.output,
    ignore=shutil.ignore_patterns("tests", "config", "__pycache__"),
)
images = {
    name: f'ghcr.io/{args.repository.lower()}/{name}@{(args.digests/f"{name}.digest").read_text().strip()}'
    for name in ["backend", "frontend", "worker"]
}
release = dict(
    commit=args.commit,
    images=images,
    schema_revision=(args.digests / "schema.revision").read_text().strip(),
    api_url=args.api_url,
)
(args.output / "release.json").write_text(json.dumps(release, indent=2) + "\n")
load_release(args.output)
