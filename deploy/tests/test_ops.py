"""Exercise secret preservation and deployment failure/recovery boundaries."""

import argparse
import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SPEC = importlib.util.spec_from_file_location(
    "ops", Path(__file__).parents[1] / "ops.py"
)
ops = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops)


class PublicReadinessTests(unittest.TestCase):
    def stack(self):
        stack = MagicMock()
        stack.settings = {"APP_DOMAIN": "zzp.example", "API_DOMAIN": "api.zzp.example"}
        return stack

    def test_certificate_not_ready_then_success(self):
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(ops, "urlopen", side_effect=[ops.URLError("TLS pending"), response, response]) as request, \
             patch.object(ops.time, "sleep") as sleep:
            ops.wait_for_public_health(self.stack())
        self.assertEqual(request.call_count, 3)
        sleep.assert_called_once()

    def test_unavailable_https_stops_at_deadline(self):
        with patch.object(ops, "urlopen", side_effect=ops.URLError("DNS unavailable")), \
             patch.object(ops.time, "monotonic", side_effect=[0, 0, 121]), \
             patch.object(ops.time, "sleep") as sleep:
            with self.assertRaisesRegex(ValueError, "Public HTTPS"):
                ops.wait_for_public_health(self.stack())
        sleep.assert_not_called()


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def args(self, imported=None):
        source = None
        if imported is not None:
            source = self.root / "runtime.json"
            source.write_text(json.dumps(imported))
        return argparse.Namespace(
            config=self.root / "config",
            data=self.root / "data",
            app_domain="zzpershub.nl",
            api_domain="api.zzpershub.nl",
            acme_email="info@zzpershub.nl",
            postgres_major="15",
            import_json=source,
            fresh_install=imported is None,
        )

    def release(self):
        target = self.root / "release"
        target.mkdir()
        data = dict(
            commit="a" * 40,
            schema_revision="064_zzp_bank_receipts",
            api_url="https://api.zzpershub.nl",
            images={
                name: f"ghcr.io/owner/app/{name}@sha256:" + ("b" * 64)
                for name in ops.SERVICES
            },
        )
        (target / "release.json").write_text(json.dumps(data))
        return target

    def test_migration_preserves_encryption_key_and_literal_credentials(self):
        secret = "existing-key-$with-'quotes-and-backslashes\\-" * 2
        args = self.args(
            dict(
                SECRET_KEY=secret,
                MOLLIE_API_KEY="live_$test",
                CUSTOM_CERT_PASSWORD="literal-$pass",
                EVIDENCE_STORAGE_PATH="/app/evidence",
                MOLLIE_WEBHOOK_SECRET="webhook",
                UPLOAD_DIR="/app/uploads",
                PATH="/untrusted/path",
            )
        )
        with patch("builtins.print") as output:
            ops.initialize(args)
        values = ops.read_env(args.config / "backend.env")
        self.assertEqual(values["SECRET_KEY"], secret)
        self.assertEqual(values["MOLLIE_API_KEY"], "live_$test")
        self.assertEqual(values["UPLOAD_DIR"], "/app/uploads")
        self.assertEqual(values["CUSTOM_CERT_PASSWORD"], "literal-$pass")
        self.assertEqual(values["EVIDENCE_STORAGE_PATH"], "/app/evidence")
        self.assertNotIn("PATH", values)
        self.assertNotIn(secret, str(output.call_args_list))
        self.assertEqual((args.config / "backend.env").stat().st_mode & 0o777, 0o600)
        ops.Stack(args.config, self.release())

    def test_missing_key_cannot_silently_replace_encrypted_data_key(self):
        args = self.args(dict(RESEND_API_KEY="old-key"))
        with self.assertRaisesRegex(ValueError, "existing SECRET_KEY"):
            ops.initialize(args)
        self.assertFalse(args.config.exists())

    def test_existing_config_is_never_overwritten(self):
        args = self.args()
        ops.initialize(args)
        original = (args.config / "backend.env").read_bytes()
        with self.assertRaises(ValueError):
            ops.initialize(args)
        self.assertEqual(original, (args.config / "backend.env").read_bytes())

    def test_new_install_generates_distinct_database_and_application_keys(self):
        args = self.args()
        ops.initialize(args)
        backend = ops.read_env(args.config / "backend.env")
        server = ops.read_env(args.config / "server.env")
        self.assertNotEqual(backend["SECRET_KEY"], server["POSTGRES_PASSWORD"])
        self.assertEqual(len(server["POSTGRES_PASSWORD"]), 64)
        self.assertEqual(
            ops.read_env(args.config / "backup.env")["BACKUP_MODE"], "local"
        )

    def set_backup_mode(self, stack, mode):
        (stack.config / "backup.env").write_text(ops.raw_env(dict(BACKUP_MODE=mode)))

    def test_local_backup_needs_no_restic_and_contains_recovery_files(self):
        stack = self.fake_stack()
        self.set_backup_mode(stack, "local")
        stack.compose = lambda *a, **kw: subprocess.CompletedProcess([], 0, "", "")

        def dump(*args, **kwargs):
            kwargs["stdout"].write(b"PGDMP-test-backup")

        stack.database = dump
        (stack.config / "backend.env").write_text("SECRET_KEY=preserved\n")
        for name in ("uploads", "evidence", "redis"):
            (stack.data / name).mkdir()
            (stack.data / name / "probe").write_text(f"{name} bytes")
        with patch.object(
            ops, "run", side_effect=AssertionError("External command")
        ), patch.object(
            ops.shutil, "which", side_effect=AssertionError("Restic lookup")
        ):
            ops.verify_backup_repository(stack)
            saved = ops.backup(stack)
        self.assertEqual(saved.stat().st_mode & 0o777, 0o700)
        self.assertEqual((saved / "database.dump").read_bytes(), b"PGDMP-test-backup")
        manifest = json.loads((saved / "manifest.json").read_text())
        self.assertEqual(manifest["revision"], "old_revision")
        for path, digest in manifest["files"].items():
            self.assertEqual(ops.checksum(saved / path), digest)
        self.assertIn("configuration/backend.env", manifest["files"])
        for name in ("uploads", "evidence", "redis"):
            with tarfile.open(saved / f"{name}.tar.gz") as archive:
                self.assertEqual(
                    archive.extractfile(f"{name}/probe").read(),
                    f"{name} bytes".encode(),
                )

    def test_local_destination_failure_prevents_maintenance(self):
        stack = self.fake_stack()
        self.set_backup_mode(stack, "local")
        with patch.object(
            ops.tempfile, "TemporaryFile", side_effect=OSError("Read only")
        ):
            with self.assertRaises(OSError):
                ops.deploy(stack)
        self.assertNotIn(("quiesce",), stack.events)

    def test_unknown_mode_cannot_silently_disable_offsite_backup(self):
        stack = self.fake_stack()
        self.set_backup_mode(stack, "offsit")
        with self.assertRaisesRegex(ValueError, "BACKUP_MODE"):
            ops.deploy(stack)
        self.assertNotIn(("quiesce",), stack.events)

    def test_old_environment_keeps_offsite_requirement(self):
        stack = self.fake_stack()
        (stack.config / "backup.env").write_text(
            "RESTIC_REPOSITORY=REPLACE_WITH_OFFSITE_REPOSITORY\n"
        )
        self.assertEqual(ops.backup_mode(stack), "offsite")
        with self.assertRaisesRegex(ValueError, "OFF-SERVER"):
            ops.deploy(stack)
        self.assertNotIn(("quiesce",), stack.events)

    def test_local_scheduled_backup_resumes_without_external_upload(self):
        stack = self.fake_stack()
        self.set_backup_mode(stack, "local")
        stack.resume = lambda: stack.events.append(("resume",))
        with patch.object(
            ops, "backup", return_value=self.root / "saved"
        ) as save, patch.object(
            ops, "upload_snapshot", side_effect=AssertionError("External upload")
        ):
            ops.scheduled_backup(stack)
        save.assert_called_once_with(stack, offsite=False)
        self.assertEqual(stack.events, [("quiesce",), ("resume",)])

    def test_failed_local_snapshot_resumes_scheduled_service_and_propagates(self):
        stack = self.fake_stack()
        self.set_backup_mode(stack, "local")
        stack.resume = lambda: stack.events.append(("resume",))
        with patch.object(ops, "backup", side_effect=OSError("Disk full")):
            with self.assertRaises(OSError):
                ops.scheduled_backup(stack)
        self.assertEqual(stack.events[-1], ("resume",))

    def test_failed_local_deploy_backup_prevents_schema_upgrade(self):
        stack = self.fake_stack()
        self.set_backup_mode(stack, "local")
        with patch.object(ops, "backup", side_effect=OSError("Disk full")):
            with self.assertRaises(OSError):
                ops.deploy(stack)
        self.assertIn(("quiesce",), stack.events)
        self.assertFalse(any("upgrade" in event for event in stack.events))

    def test_offsite_scheduled_backup_uploads_only_after_resume(self):
        stack = self.fake_stack()
        self.set_backup_mode(stack, "offsite")
        stack.resume = lambda: stack.events.append(("resume",))
        with patch.object(ops, "verify_backup_repository"), patch.object(
            ops, "backup", return_value=self.root
        ), patch.object(
            ops,
            "upload_snapshot",
            side_effect=lambda *a: stack.events.append(("upload",)),
        ):
            ops.scheduled_backup(stack)
        self.assertEqual(stack.events, [("quiesce",), ("resume",), ("upload",)])

    def test_backend_settings_allowlist_stays_complete(self):
        module = ast.parse(
            (Path(__file__).parents[2] / "backend/app/core/config.py").read_text()
        )
        settings = next(
            n
            for n in module.body
            if isinstance(n, ast.ClassDef) and n.name == "Settings"
        )
        names = {
            n.target.id
            for n in settings.body
            if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)
        }
        self.assertEqual(names, ops.KEYS)

    def test_frontend_baked_url_must_match_new_environment(self):
        args = self.args()
        ops.initialize(args)
        release = self.release()
        data = json.loads((release / "release.json").read_text())
        data["api_url"] = "https://other.example"
        (release / "release.json").write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "API URL"):
            ops.Stack(args.config, release)

    def test_mutable_image_tags_are_refused(self):
        target = self.release()
        data = json.loads((target / "release.json").read_text())
        data["images"]["backend"] = "ghcr.io/owner/backend:latest"
        (target / "release.json").write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "digest"):
            ops.load_release(target)

    def test_export_filters_os_environment_without_logging_secret(self):
        secret = "old-secret-should-never-appear-in-output"
        result = subprocess.CompletedProcess(
            [],
            0,
            json.dumps(
                [
                    dict(
                        Config=dict(
                            Env=[
                                f"SECRET_KEY={secret}",
                                "PATH=/bin",
                                "RESEND_API_KEY=provider",
                            ]
                        )
                    )
                ]
            ),
            "",
        )
        with patch.object(ops, "run", return_value=result), patch(
            "builtins.print"
        ) as output:
            ops.export_runtime("container", self.root / "export.json")
        self.assertEqual(
            json.loads((self.root / "export.json").read_text()),
            dict(SECRET_KEY=secret, RESEND_API_KEY="provider"),
        )
        self.assertNotIn(secret, str(output.call_args_list))

    def test_backup_refuses_running_writers(self):
        class Running:
            def compose(self, *args, **kw):
                return subprocess.CompletedProcess([], 0, "writer-id", "")

        with self.assertRaisesRegex(ValueError, "Writers"):
            ops.backup(Running(), offsite=False)

    def fake_stack(self, revision="old_revision"):
        parent = self

        class Fake:
            def __init__(self):
                self.events = []
                self.config = parent.root / "config"
                self.config.mkdir(exist_ok=True)
                self.data = parent.root / "data"
                self.data.mkdir(exist_ok=True)
                self.release = parent.root / "candidate"
                self.release.mkdir(exist_ok=True)
                self.metadata = dict(commit="a" * 40, schema_revision="new_revision")
                self.settings = dict(
                    APP_DOMAIN="zzpershub.nl", API_DOMAIN="api.zzpershub.nl"
                )

            def compose(self, *args, **kw):
                self.events.append(args)
                if args[:1] == ("ps",):
                    return subprocess.CompletedProcess([], 0, "caddy-id", "")
                if "upgrade" in args:
                    raise subprocess.CalledProcessError(1, [])
                return subprocess.CompletedProcess([], 0, "", "")

            def revision(self):
                return revision

            def quiesce(self):
                self.events.append(("quiesce",))

            def maintenance(self, enabled):
                self.events.append(("maintenance", enabled))

        return Fake()

    def test_failed_migration_stays_in_maintenance_without_code_switch(self):
        stack = self.fake_stack()

        def backup(candidate):
            candidate.events.append(("backup",))

        with patch.object(ops, "backup", side_effect=backup), patch.object(
            ops, "verify_backup_repository"
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                ops.deploy(stack)
        self.assertLess(
            stack.events.index(("quiesce",)), stack.events.index(("backup",))
        )
        self.assertFalse((stack.config / "current.json").exists())
        self.assertFalse(
            any(event[:2] == ("maintenance", False) for event in stack.events)
        )
        self.assertFalse(
            any("worker" in event and event[:1] == ("up",) for event in stack.events)
        )

    def test_code_rollback_rejects_schema_difference_before_stopping_writers(self):
        stack = self.fake_stack()
        with self.assertRaisesRegex(ValueError, "rollback refused"):
            ops.deploy(stack, rollback=True)
        self.assertNotIn(("quiesce",), stack.events)

    def test_restore_rejects_tampering_before_any_docker_operation(self):
        snapshot = self.root / "snapshot"
        snapshot.mkdir()
        (snapshot / "database.dump").write_bytes(b"tampered")
        (snapshot / "manifest.json").write_text(
            json.dumps(dict(files={"database.dump": "0" * 64}))
        )

        class NoDocker:
            def compose(self, *args, **kwargs):
                raise AssertionError(
                    "Restore touched Docker before checking the backup"
                )

        with self.assertRaisesRegex(ValueError, "checksum"):
            ops.restore(NoDocker(), snapshot)

    def test_restore_rejects_archive_path_escape_before_restoring_database(self):
        stack = self.fake_stack()
        stack.database = lambda *a, **kw: subprocess.CompletedProcess([], 0, "0", "")
        stack.compose = lambda *a, **kw: subprocess.CompletedProcess([], 0, "", "")
        snapshot = self.root / "snapshot"
        snapshot.mkdir()
        (snapshot / "database.dump").write_bytes(b"dump")
        for name in ["uploads", "evidence", "redis"]:
            with tarfile.open(snapshot / f"{name}.tar.gz", "w:gz") as archive:
                item = tarfile.TarInfo(
                    "uploads/../../escaped" if name == "uploads" else name
                )
                item.type = tarfile.DIRTYPE
                archive.addfile(item)
        files = {p.name: ops.checksum(p) for p in snapshot.iterdir()}
        (snapshot / "manifest.json").write_text(json.dumps(dict(files=files)))
        with self.assertRaises(tarfile.FilterError):
            ops.restore(stack, snapshot)
        self.assertFalse((self.root / "escaped").exists())

    def test_public_wrong_release_cannot_be_recorded_as_success(self):
        import io

        stack = self.fake_stack(revision="new_revision")

        def compose(*args, **kw):
            stack.events.append(args)
            return subprocess.CompletedProcess(
                [], 0, "id" if args[:1] == ("ps",) else "", ""
            )

        stack.compose = compose

        class Response(io.BytesIO):
            status = 200

        def public(url, timeout):
            body = (
                {"git_sha": "wrong-release"}
                if url.endswith("/version")
                else {"status": "healthy"}
            )
            return Response(json.dumps(body).encode())

        with patch.object(ops, "backup"), patch.object(
            ops, "verify_backup_repository"
        ), patch.object(ops, "urlopen", side_effect=public):
            with self.assertRaisesRegex(ValueError, "different release"):
                ops.deploy(stack)
        self.assertFalse((stack.config / "current.json").exists())
        self.assertEqual(stack.events[-1], ("maintenance", True))

    def test_missing_offsite_repository_fails_before_stopping_writers(self):
        stack = self.fake_stack()
        with patch.object(
            ops,
            "verify_backup_repository",
            side_effect=ValueError("Offsite unavailable"),
        ):
            with self.assertRaisesRegex(ValueError, "Offsite unavailable"):
                ops.deploy(stack)
        self.assertNotIn(("quiesce",), stack.events)


if __name__ == "__main__":
    unittest.main()
