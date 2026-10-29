import hashlib
import hmac
import http.client
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from core import Agent, Config, Store, now
from agent import Server, Handler


class FixtureAgent(Agent):
    """Real Git, SQLite and state machine; deterministic external Docker boundary."""

    def __init__(self, config, old):
        self.running = old
        self.failure = None
        self.commands = []
        self.schema = "schema-1"
        super().__init__(config)

    def run(self, args, timeout=None, log=False):
        if args[0] == "git":
            return super().run(args, timeout, log)
        self.commands.append(args)
        if args[0] == "curl":
            return json.dumps({"status": "ready", "revision": self.running})
        if args[:3] == ["docker", "context", "inspect"]:
            return "unix:///var/run/docker.sock"
        if args[:2] == ["docker", "info"]:
            return str(self.c.state_dir) if "DockerRootDir" in args[-1] else "27.0"
        if args[:3] == ["docker", "image", "inspect"]:
            if self.failure == "missing-image":
                raise RuntimeError("Previous image unavailable")
            return args[-1]
        if args[:2] == ["docker", "inspect"]:
            return "sha256:" + "a" * 64
        if args[:3] == ["docker", "builder", "prune"]:
            if self.failure == "cache":
                raise RuntimeError("Cache cleanup failed")
            return "Total reclaimed space: fixture"
        if args[:2] == ["docker", "tag"]:
            return ""
        if args[:2] == ["docker", "exec"]:
            return self.running
        if args[:3] == ["docker", "compose", "version"]:
            return "2.35.0"
        if args[:2] == ["docker", "compose"]:
            if "config" in args:
                return json.dumps(
                    {
                        "services": {
                            s: {
                                "build": {
                                    "context": str(self.c.repository),
                                    **(
                                        {"target": "builder"}
                                        if s != self.c.app_service
                                        else {}
                                    ),
                                },
                                "environment": {
                                    "DATABASE_URL": "postgresql://fixture:private-password@db/test",
                                    "OPENAI_API_KEY": "secret-fixture-value",
                                },
                                "volumes": [
                                    {
                                        "type": "bind",
                                        "source": str(self.c.backup_dir),
                                        "target": "/app/backups",
                                    }
                                ],
                            }
                            for s in [
                                *self.c.services,
                                self.c.migration_service,
                                self.c.database_service,
                            ]
                        }
                    }
                )
            if "ps" in args:
                return "container-" + args[-1]
            if "exec" in args:
                return json.dumps({"status": "ready", "revision": self.running})
            if "build" in args:
                if self.failure == "build":
                    raise RuntimeError("Build failed secret-fixture-value")
                self.event("Building image")
                return ""
            if "stop" in args:
                return ""
            if "run" in args:
                if args[-1] == "scripts/backup.sh":
                    if self.failure == "backup":
                        raise RuntimeError("Backup failed")
                    id = self.local.job
                    target = self.c.backup_dir / ("deploy-" + id)
                    target.mkdir(parents=True)
                    for file in (
                        "axildb.dump",
                        "uploads.tar.gz",
                        "labels.tar.gz",
                        "manifest.txt",
                    ):
                        (target / file).write_bytes(b"fixture")
                elif "python3" in args:
                    compile(args[-1], "<container-probe>", "exec")
                    if "hashlib" in args[-1]:
                        return self.schema
                    if self.failure == "database":
                        raise RuntimeError("Database unavailable")
                elif self.c.migration_service in args:
                    if self.failure == "migration":
                        raise RuntimeError("Migration failed; outcome unknown")
                    self.schema = "schema-2"
                return ""
            if "up" in args:
                if self.failure == "deploy":
                    raise RuntimeError("Container recreation failed")
                # Final -f is always the agent-generated image overlay.
                path = Path([args[i + 1] for i, v in enumerate(args) if v == "-f"][-1])
                overlay = json.loads(path.read_text())
                image = overlay["services"][self.c.app_service]["image"]
                self.running = (
                    self.store.job(self.local.job)["previous"]
                    if image.startswith("sha256:")
                    else image.split(":")[-1]
                )
                return ""
        raise AssertionError("Unexpected argv: " + repr(args))

    def stabilize(self, revision):
        if self.failure == "health":
            raise RuntimeError("Readiness failed")
        self.ensure(self.running == revision, "Wrong image active")
        return self.health(revision)


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="axildb-deployment-")
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        (self.repo / ".gitignore").write_text(".env\nbackups/\n")
        (self.repo / "docker-compose.yml").write_text("services: {}\n")
        (self.repo / "deployment-protocol.json").write_text(
            '{"minimumAgentProtocol":1}'
        )
        (self.repo / "app.txt").write_text("old")
        self.git("add", ".")
        self.git("commit", "-m", "old")
        self.old = self.git("rev-parse", "HEAD")
        self.remote = self.root / "remote.git"
        subprocess.run(
            ["git", "clone", "--bare", str(self.repo), str(self.remote)],
            check=True,
            capture_output=True,
        )
        self.git("remote", "add", "origin", str(self.remote))
        (self.repo / "app.txt").write_text("new")
        self.git("add", ".")
        self.git("commit", "-m", "new")
        self.new = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "main")
        (self.repo / ".env").write_text("FIXTURE=yes")
        self.key = self.root / "agent.key"
        self.key.write_text("ab" * 32)
        self.key.chmod(0o600)
        self.raw = {
            "repository": str(self.repo),
            "trusted_remote": str(self.remote),
            "remote": "origin",
            "branch": "main",
            "project": "fixture",
            "compose_files": [str(self.repo / "docker-compose.yml")],
            "env_file": str(self.repo / ".env"),
            "state_dir": str(self.root / "state"),
            "socket": str(self.root / "agent.sock"),
            "secret_file": str(self.key),
            "backup_dir": str(self.repo / "backups"),
            "app_service": "app",
            "worker_services": ["backups", "events"],
            "migration_service": "migrate",
            "database_service": "db",
            "backup_service": "backups",
            "proxy_health_url": "http://127.0.0.1:8080/api/health/ready",
            "minimum_free_bytes": 1024**3,
            "stabilization_seconds": 1,
        }
        self.agent = FixtureAgent(Config(self.raw), self.old)

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.run(
            ["git", "-C", str(self.repo), *args],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

    def queue(self):
        self.agent.check_updates()
        return self.agent.queue(self.new, "admin", "d" * 32)["id"]

    def add_migration(self, sql="CREATE TABLE example(id integer);"):
        path = self.repo / "prisma/migrations/20261020_example"
        path.mkdir(parents=True, exist_ok=True)
        (path / "migration.sql").write_text(sql)
        self.git("add", ".")
        self.git("commit", "-m", "schema")
        self.git("push", "origin", "main")
        self.new = self.git("rev-parse", "HEAD")

    def test_cache_cleanup_confirmation_durable_scope_and_measurement(self):
        request = {"protocol": 1, "operation": "CLEAN_BUILD_CACHE", "actor": "admin", "requestId": "e" * 32, "confirmed": True}
        with self.assertRaises(RuntimeError):
            self.agent.dispatch({**request, "confirmed": False})
        with self.assertRaises(ValueError):
            self.agent.dispatch({**request, "filter": "anything"})
        job = self.agent.dispatch(request)
        self.assertEqual(job["id"], self.agent.dispatch(request)["id"])
        self.assertEqual(job["data"]["kind"], "BUILD_CACHE_CLEANUP")
        with self.assertRaises(ValueError):
            self.queue()
        deployed = self.agent.store.meta("deployed")
        with patch("core.shutil.disk_usage", side_effect=[SimpleNamespace(free=8 * 1024**3), SimpleNamespace(free=20 * 1024**3)]):
            self.agent.worker_once()
        done = self.agent.store.job(job["id"])
        self.assertEqual(done["status"], "CLEANED")
        self.assertEqual(done["data"]["cacheCleanup"]["availableDeltaBytes"], 12 * 1024**3)
        self.assertIn(["docker", "builder", "prune", "--filter", "until=48h", "--force"], self.agent.commands)
        self.assertFalse(any("image" in cmd and "prune" in cmd or "volume" in cmd and "prune" in cmd for cmd in self.agent.commands))
        self.assertEqual(self.agent.store.meta("deployed"), deployed)
        self.assertFalse(self.agent.store.notifications()["notifications"])
        self.assertIsNone(self.agent.store.active())

    def test_cache_cleanup_failure_hold_and_restart(self):
        id = self.agent.store.claim("0" * 40, "admin", "f" * 32, kind="BUILD_CACHE_CLEANUP")
        self.agent.failure = "cache"
        self.agent.worker_once()
        self.assertEqual(self.agent.store.job(id)["status"], "CLEANUP_FAILED")
        second = self.agent.store.claim("0" * 40, "admin", "a" * 32, kind="BUILD_CACHE_CLEANUP")
        hold = self.agent.c.backup_dir / ".migration/outbound-hold.json"
        hold.parent.mkdir(parents=True, exist_ok=True)
        hold.write_text("{}")
        before = len(self.agent.commands)
        self.agent.worker_once()
        self.assertEqual(self.agent.store.job(second)["status"], "CLEANUP_FAILED")
        self.assertEqual(len(self.agent.commands), before)
        hold.unlink()
        third = self.agent.store.claim("0" * 40, "admin", "b" * 32, kind="BUILD_CACHE_CLEANUP")
        self.agent.store.update(third, status="RUNNING")
        self.agent.store.interrupted()
        self.assertEqual(self.agent.store.job(third)["status"], "FAILED")
        self.assertFalse(self.agent.store.notifications()["notifications"])

    def test_update_detection_and_success(self):
        result = self.agent.check_updates()
        self.assertEqual(result["ahead"], 1)
        self.assertTrue(result["eligible"])
        self.assertTrue(self.agent.preflight(self.new)[0]["ready"])
        id = self.queue()
        self.agent.worker_once()
        job = self.agent.store.job(id)
        self.assertEqual(job["status"], "COMPLETED")
        self.assertEqual(self.agent.running, self.new)
        self.assertTrue(
            (self.repo / "backups" / job["data"]["backup"] / "axildb.dump").exists()
        )
        self.assertFalse(self.agent.check_updates()["eligible"])
        events = self.agent.store.events(id)
        self.assertEqual([e["id"] for e in events], sorted(e["id"] for e in events))
        self.assertTrue(
            all(
                e["id"] > events[0]["id"]
                for e in self.agent.store.events(id, events[0]["id"])
            )
        )
        for args in self.agent.commands:
            self.assertNotIn("down", args)
            self.assertNotIn("prune", args)
            self.assertNotIn("reset", args)
            if "up" in args:
                self.assertEqual(args[-3:], ["app", "backups", "events"])
                self.assertIn("--no-deps", args)
        self.assertEqual((self.repo / "app.txt").read_text(), "new")

    def test_dirty_wrong_remote_and_non_fast_forward(self):
        (self.repo / "local.txt").write_text("preserve")
        with self.assertRaisesRegex(RuntimeError, "modifications"):
            self.agent.check_updates()
        (self.repo / "local.txt").unlink()
        self.git("remote", "set-url", "origin", str(self.root / "missing"))
        with self.assertRaisesRegex(RuntimeError, "identity"):
            self.agent.check_updates()
        self.git("remote", "set-url", "origin", str(self.remote))
        self.git("checkout", "--orphan", "other")
        self.git("add", ".")
        self.git("commit", "-m", "unrelated")
        self.agent.running = self.git("rev-parse", "HEAD")
        with self.assertRaises(RuntimeError):
            self.agent.check_updates()

    def test_remote_unavailable_and_invalid_target(self):
        shutil.rmtree(self.remote)
        with self.assertRaises(RuntimeError):
            self.agent.check_updates()
        with self.assertRaises(ValueError):
            self.agent.preflight("main;rm -rf /")

    def test_duplicate_requests_and_cross_store_lock(self):
        id = self.queue()
        self.assertEqual(self.agent.queue(self.new, "admin", "d" * 32)["id"], id)
        other = Store(self.root / "state")
        with self.assertRaises(ValueError):
            other.claim(self.new, "other", "e" * 32)
        with self.assertRaises(ValueError):
            other.claim(self.old, "admin", "d" * 32)

    def test_build_backup_and_database_failures_preserve_running(self):
        for failure in ("build", "backup", "database"):
            self.agent.failure = None
            id = self.queue()
            self.agent.failure = failure
            self.agent.worker_once()
            self.assertEqual(self.agent.store.job(id)["status"], "FAILED")
            self.assertEqual(self.agent.running, self.old)
            self.assertNotIn(
                "secret-fixture-value", json.dumps(self.agent.store.events(id))
            )
            self.assertTrue((self.repo / "app.txt").exists())

    def test_preflight_failures(self):
        original = self.agent.run

        def fail(args, **kwargs):
            if args[:2] == ["docker", "info"]:
                raise RuntimeError("Docker unavailable")
            return original(args, **kwargs)

        self.agent.run = fail
        self.assertFalse(self.agent.preflight(self.new)[0]["ready"])
        self.agent.run = original
        with patch(
            "core.shutil.disk_usage", return_value=type("Disk", (), {"free": 0})()
        ):
            self.assertFalse(self.agent.preflight(self.new)[0]["ready"])
        (self.repo / ".env").unlink()
        self.assertFalse(self.agent.preflight(self.new)[0]["ready"])

    def test_migration_failure_cannot_roll_back(self):
        self.add_migration()
        id = self.queue()
        self.agent.failure = "migration"
        self.agent.worker_once()
        job = self.agent.store.job(id)
        self.assertEqual(job["status"], "RECOVERY_REQUIRED")
        self.assertEqual(job["data"]["migrationStatus"], "MAY_HAVE_PARTIALLY_COMMITTED")
        self.assertFalse(self.agent.recovery_options(id)["applicationRollback"])
        with self.assertRaises(RuntimeError):
            self.agent.rollback(id)
        with self.assertRaises(ValueError):
            self.agent.queue(self.new, "other", "e" * 32)

    def test_migrations_and_destructive_screening(self):
        self.add_migration("DROP TABLE important;")
        report, _ = self.agent.preflight(self.new)
        self.assertFalse(report["ready"])
        self.assertIn("destructive", json.dumps(report).lower())

    def test_exact_migration_review_approval(self):
        self.add_migration('ALTER TABLE example DROP CONSTRAINT old_rule;')
        self.agent.check_updates()
        report, _ = self.agent.preflight(self.new)
        self.assertFalse(report["ready"])
        self.assertTrue(report["reviewable"])
        review = report["migrationReview"]
        self.assertTrue(review["requiresApproval"])
        self.assertIn('DROP CONSTRAINT', review["files"][0]["sql"])
        for approval in (None, '0' * 64):
            with self.assertRaises(RuntimeError):
                self.agent.queue(self.new, 'admin', 'd' * 32, approval)
        self.assertIsNone(self.agent.store.active())
        id = self.agent.queue(self.new, 'admin', 'd' * 32, review["digest"])["id"]
        self.assertEqual(self.agent.queue(self.new, 'admin', 'd' * 32, review["digest"])["id"], id)
        self.assertEqual(self.agent.store.job(id)["data"]["migrationApproval"], review["digest"])
        self.agent.worker_once()
        job = self.agent.store.job(id)
        self.assertEqual(job["status"], 'COMPLETED')
        self.assertEqual(job["data"]["migrationStatus"], 'COMPLETED')
        self.assertFalse(self.agent.recovery_options(id)["applicationRollback"])

    def test_review_digest_changes_with_exact_content_and_previous_revision(self):
        self.add_migration('DROP TABLE example;')
        first = self.agent.migration_review(self.old, self.new)
        self.assertNotEqual(first["digest"], self.agent.migration_review(self.new, self.new)["digest"])
        self.add_migration('DROP TABLE another;')
        self.assertNotEqual(first["digest"], self.agent.migration_review(self.old, self.new)["digest"])
        self.agent.check_updates()
        with self.assertRaises(RuntimeError):
            self.agent.queue(self.new, 'admin', 'd' * 32, first["digest"])

    def test_review_does_not_bypass_backup_failure(self):
        self.add_migration('DROP TABLE example;')
        self.agent.check_updates()
        review = self.agent.migration_review(self.old, self.new)
        id = self.agent.queue(self.new, 'admin', 'd' * 32, review["digest"])["id"]
        self.agent.failure = 'backup'
        self.agent.worker_once()
        self.assertEqual(self.agent.store.job(id)["status"], 'FAILED')
        self.assertEqual(self.agent.running, self.old)

    def test_review_does_not_bypass_critical_preflight(self):
        self.add_migration('DROP TABLE example;')
        review = self.agent.migration_review(self.old, self.new)
        (self.repo / '.env').unlink()
        report, _ = self.agent.preflight(self.new, migration_approval=review["digest"])
        self.assertFalse(report["ready"])
        self.assertFalse(report["reviewable"])

    def test_review_migration_failure_requires_recovery(self):
        self.add_migration('DROP TABLE example;')
        self.agent.check_updates()
        review = self.agent.migration_review(self.old, self.new)
        id = self.agent.queue(self.new, 'admin', 'd' * 32, review["digest"])["id"]
        self.agent.failure = 'migration'
        self.agent.worker_once()
        job = self.agent.store.job(id)
        self.assertEqual(job["status"], 'RECOVERY_REQUIRED')
        self.assertEqual(job["data"]["migrationStatus"], 'MAY_HAVE_PARTIALLY_COMMITTED')
        self.assertFalse(self.agent.recovery_options(id)["applicationRollback"])

    def test_existing_migration_edits_cannot_be_approved(self):
        self.add_migration('CREATE TABLE example(id integer);')
        previous = self.new
        self.add_migration('DROP TABLE example;')
        with self.assertRaisesRegex(RuntimeError, 'existing migration'):
            self.agent.migration_review(previous, self.new)

    def test_deployment_failure_and_explicit_compatible_recovery(self):
        id = self.queue()
        self.agent.failure = "deploy"
        self.agent.worker_once()
        self.assertEqual(self.agent.store.job(id)["status"], "RECOVERY_REQUIRED")
        self.agent.failure = None
        self.assertTrue(self.agent.recovery_options(id)["applicationRollback"])
        self.agent.rollback(id)
        self.assertEqual(self.agent.store.job(id)["status"], "RECOVERED")
        self.assertEqual(self.agent.running, self.old)

    def test_health_failure_missing_image_and_schema_drift(self):
        id = self.queue()
        self.agent.failure = "health"
        self.agent.worker_once()
        self.assertEqual(self.agent.store.job(id)["status"], "RECOVERY_REQUIRED")
        self.agent.failure = "missing-image"
        self.assertFalse(self.agent.recovery_options(id)["applicationRollback"])
        self.agent.failure = None
        self.agent.schema = "unexpected-ddl"
        self.assertFalse(self.agent.recovery_options(id)["applicationRollback"])

    def test_restart_reconciliation_does_not_replay(self):
        id = self.queue()
        self.agent.store.update(
            id,
            status="RUNNING",
            stage="MIGRATING",
            data={
                "replacementStarted": True,
                "migrationStatus": "MAY_HAVE_PARTIALLY_COMMITTED",
            },
        )
        restarted = FixtureAgent(Config(self.raw), self.old)
        self.assertEqual(restarted.store.job(id)["status"], "RECOVERY_REQUIRED")
        restarted.worker_once()
        self.assertFalse(restarted.commands)

    def test_unstarted_job_survives_restart(self):
        id = self.queue()
        restarted = FixtureAgent(Config(self.raw), self.old)
        restarted.worker_once()
        self.assertEqual(restarted.store.job(id)["status"], "COMPLETED")

    def test_advance_after_approval_aborts(self):
        id = self.queue()
        (self.repo / "app.txt").write_text("later")
        self.git("add", ".")
        self.git("commit", "-m", "later")
        self.git("push", "origin", "main")
        self.agent.worker_once()
        self.assertEqual(self.agent.store.job(id)["status"], "FAILED")
        self.assertEqual(self.agent.running, self.old)

    def test_protocol_and_injection(self):
        for operation in ("SHELL", "CHECK_UPDATES;docker down", "/etc/passwd"):
            with self.assertRaises(ValueError):
                self.agent.dispatch(
                    {"protocol": 1, "operation": operation, "actor": "admin"}
                )
        for field in ("command", "repository", "path", "compose_args"):
            with self.assertRaises(ValueError):
                self.agent.dispatch(
                    {
                        "protocol": 1,
                        "operation": "CHECK_UPDATES",
                        "actor": "admin",
                        field: "evil",
                    }
                )
        with self.assertRaises(ValueError):
            Config({**self.raw, "project": "name; touch /tmp/bad"})
        with self.assertRaises(ValueError):
            Config({**self.raw, "state_dir": str(self.repo / "state")})

    def signed(self, body):
        timestamp = str(int(time.time()))
        nonce = os.urandom(16).hex()
        return {
            "X-AxilDB-Time": timestamp,
            "X-AxilDB-Nonce": nonce,
            "X-AxilDB-Signature": hmac.new(
                self.agent.secret.encode(),
                timestamp.encode() + b"\n" + nonce.encode() + b"\n" + body,
                hashlib.sha256,
            ).hexdigest(),
        }

    def test_authentication_replay_and_expiry(self):
        body = b'{"operation":"STATUS"}'
        headers = self.signed(body)
        self.agent.authenticate(body, headers)
        with self.assertRaises(PermissionError):
            self.agent.authenticate(body, headers)
        with self.assertRaises(PermissionError):
            self.agent.authenticate(body + b"x", self.signed(body))
        with self.assertRaises(PermissionError):
            self.agent.authenticate(body, {**headers, "X-AxilDB-Time": "1000000000"})

    def test_private_socket_protocol(self):
        server = Server(str(self.root / "transport.sock"), Handler)
        server.agent = self.agent
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:

            def request(body, headers):
                conn = http.client.HTTPConnection("local")
                conn.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                conn.sock.connect(str(self.root / "transport.sock"))
                conn.request("POST", "/v1/operations", body, headers)
                response = conn.getresponse()
                value = response.read()
                conn.close()
                return response.status, json.loads(value)

            body = json.dumps(
                {
                    "protocol": 1,
                    "operation": "EVENTS",
                    "actor": "admin",
                    "jobId": "f" * 32,
                }
            ).encode()
            self.assertEqual(request(body, {})[0], 403)
            id = self.queue()
            body = json.dumps(
                {"protocol": 1, "operation": "JOB", "actor": "admin", "jobId": id}
            ).encode()
            code, value = request(body, self.signed(body))
            self.assertEqual(code, 200)
            self.assertEqual(value["data"]["id"], id)
        finally:
            server.shutdown()
            server.server_close()

    def test_runtime_probe_scripts_and_redaction(self):
        self.agent.backup_probe()
        self.assertEqual(self.agent.database_fingerprint(), "schema-1")
        # Execute the generated fingerprint program with mocked tool responses to check
        # Python/SQL quoting and deterministic pg_dump noise filtering.
        script = self.agent.commands[-1][-1]

        class Result:
            def __init__(self, stdout):
                self.stdout = stdout

        calls = []

        def command(args, **kwargs):
            calls.append(args)
            return Result(
                b"[]"
                if args[0] == "psql"
                else b"-- version\n\\restrict random\nCREATE TABLE t(id integer);\n\\unrestrict random\n"
            )

        with patch.dict(
            os.environ,
            {"DATABASE_URL": "postgresql://user:secret@localhost/test?schema=public"},
        ), patch("subprocess.run", side_effect=command):
            exec(script, {})
        self.assertIn('"_prisma_migrations"', calls[0][-1])
        self.assertNotIn('\\"', calls[0][-1])
        self.agent.secrets.add("private-password")
        for value in (
            "postgresql://u:private-password@host/db",
            "Bearer abc123",
            "OPENAI_API_KEY=sk-abcdefghijklmno",
            "github_pat_abcd1234",
        ):
            self.assertNotIn("private-password", self.agent.redact(value))
            self.assertNotIn("abc123", self.agent.redact(value))

    def test_libpq_environment_and_no_credential_argv(self):
        import sys

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "migration"))
        from routine import LocalDatabase

        with patch.dict(os.environ, {}, clear=True):
            db = LocalDatabase(
                "postgresql://user:p%40ss@db.example:5438/plant%20db?schema=public&sslmode=verify-full&connect_timeout=3"
            )
            self.assertEqual(os.environ["PGHOST"], "db.example")
            self.assertEqual(os.environ["PGDATABASE"], "plant db")
            self.assertEqual(os.environ["PGPASSWORD"], "p@ss")
            self.assertEqual(os.environ["PGSSLMODE"], "verify-full")
            self.assertEqual(
                db.command("pg_dump", ["--format=custom"]),
                ["pg_dump", "--format=custom"],
            )
        with self.assertRaises(ValueError):
            LocalDatabase(
                "postgresql://user:secret@db/test?sslmode=verify-full&unsupported=value"
            )

    def test_permission_and_unhealthy_version_provenance(self):
        self.key.chmod(0o644)
        with self.assertRaises(ValueError):
            FixtureAgent(Config(self.raw), self.old)
        self.key.chmod(0o600)
        self.agent.running = self.new
        with patch.object(
            self.agent, "health", side_effect=RuntimeError("Readiness failed")
        ):
            status = self.agent.status()
            self.assertEqual(status["revision"], self.new)
            self.assertEqual(status["health"]["status"], "unavailable")

    def test_rate_limit_and_busy_preflight(self):
        for _ in range(12):
            self.agent.store.rate_limit("admin", "CHECK_UPDATES")
        with self.assertRaises(ValueError):
            self.agent.store.rate_limit("admin", "CHECK_UPDATES")
        id = self.queue()
        self.assertFalse(self.agent.preflight(self.new)[0]["ready"])


if __name__ == "__main__":
    unittest.main()
