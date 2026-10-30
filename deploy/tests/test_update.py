"""Verify release selection and update safety without a VPS or GitHub credentials."""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("updater", Path(__file__).parents[1] / "update.py")
updater = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updater)

COMMIT = "a" * 40


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / "config"
        self.config.mkdir()
        for name in ("server.env", "backend.env", "worker.env", "backup.env"):
            (self.config / name).write_text("EXISTING_SECRET=preserve-me\n")
        self.releases = self.root / "releases"
        self.commands = []

    def github(self, *args):
        if args[0] == "api":
            return {"sha": COMMIT}
        self.assertIn("--workflow", args)
        self.assertIn("release-images.yml", args)
        return [{"databaseId": 123, "headSha": COMMIT, "headBranch": "main", "event": "workflow_run"}]

    def bundle(self, path, commit=COMMIT):
        path.mkdir(parents=True)
        for name in ("ops.py", "update.py", "compose.yml", "app-env-keys.json", "run_current.py",
                     "systemd/zzpershub-backup.service", "systemd/zzpershub-backup.timer"):
            target = path / name
            target.parent.mkdir(exist_ok=True)
            target.write_text("runtime\n")
        (path / "release.json").write_text(json.dumps({
            "commit": commit,
            "images": {name: f"ghcr.io/{updater.REPOSITORY}/{name}@sha256:" + "b" * 64
                       for name in ("backend", "frontend", "worker")},
        }))

    def command(self, args, **kwargs):
        self.commands.append(args)
        if args[:3] == ["gh", "run", "download"]:
            self.bundle(Path(args[args.index("--dir") + 1]))
        return subprocess.CompletedProcess(args, 0)

    def test_success_downloads_exact_artifact_and_deploys_without_fresh_install(self):
        before = {p.name: p.read_bytes() for p in self.config.iterdir()}
        with patch.object(updater, "github", side_effect=self.github), \
             patch.object(updater, "run", side_effect=self.command), \
             patch.object(updater, "install_helpers"):
            updater.update(self.config, self.releases)
        download, deploy = self.commands
        self.assertIn("zzpershub-" + COMMIT, download)
        self.assertIn("deploy", deploy)
        self.assertNotIn("--fresh-install", deploy)
        self.assertNotIn("init", deploy)
        self.assertEqual({p.name: p.read_bytes() for p in self.config.iterdir()}, before)
        self.assertTrue(Path(deploy[-1], "release.json").is_file())

    def test_pending_latest_main_never_falls_back_to_an_older_release(self):
        with patch.object(updater, "github", side_effect=[{"sha": COMMIT}, []]), \
             patch.object(updater, "run") as run:
            with self.assertRaisesRegex(ValueError, "not ready"):
                updater.update(self.config, self.releases)
        run.assert_not_called()
        self.assertFalse(self.releases.exists())

    def test_already_current_does_not_download_or_restart(self):
        (self.config / "current.json").write_text(json.dumps({"commit": COMMIT}))
        with patch.object(updater, "github", return_value={"sha": COMMIT}), \
             patch.object(updater, "run") as run:
            updater.update(self.config, self.releases)
        run.assert_not_called()

    def test_mismatched_download_is_removed_before_any_deployment(self):
        def wrong_bundle(args, **kwargs):
            self.bundle(Path(args[-1]), commit="c" * 40)
        with patch.object(updater, "github", side_effect=self.github), \
             patch.object(updater, "run", side_effect=wrong_bundle) as run:
            with self.assertRaisesRegex(ValueError, "commit mismatch"):
                updater.update(self.config, self.releases)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(list(self.releases.iterdir()), [])

    def test_failed_deploy_keeps_candidate_and_previous_accepted_release(self):
        current = self.config / "current.json"
        current.write_text(json.dumps({"commit": "d" * 40, "release": "/previous"}))
        original = current.read_bytes()
        def failure(args, **kwargs):
            self.command(args)
            if "deploy" in args:
                raise subprocess.CalledProcessError(1, args)
        with patch.object(updater, "github", side_effect=self.github), \
             patch.object(updater, "run", side_effect=failure), \
             patch.object(updater, "install_helpers") as copy:
            with self.assertRaises(subprocess.CalledProcessError):
                updater.update(self.config, self.releases)
        self.assertEqual(current.read_bytes(), original)
        self.assertEqual(len(list(self.releases.glob("*/release.json"))), 1)
        copy.assert_not_called()

    def test_mutable_or_foreign_image_is_rejected(self):
        path = self.root / "bundle"
        self.bundle(path)
        metadata = json.loads((path / "release.json").read_text())
        metadata["images"]["backend"] = "ghcr.io/other/backend:latest"
        (path / "release.json").write_text(json.dumps(metadata))
        with self.assertRaisesRegex(ValueError, "immutable"):
            updater.validate_release(path, COMMIT)

    def test_missing_config_fails_before_contacting_github(self):
        (self.config / "backend.env").unlink()
        with patch.object(updater, "github") as github:
            with self.assertRaisesRegex(ValueError, "Existing configuration"):
                updater.update(self.config, self.releases)
        github.assert_not_called()


if __name__ == "__main__":
    unittest.main()
