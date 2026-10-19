"""AxilDB deployment protocol v1. Agent-only, stdlib, no shell command interface."""

from __future__ import annotations
import contextlib
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import sqlite3
import subprocess
import threading
import time
from urllib.parse import urlsplit
import uuid

PROTOCOL = 1
STAGES = (
    "QUEUED",
    "PREFLIGHT",
    "BACKUP",
    "FETCHING",
    "PREPARING",
    "BUILDING",
    "MIGRATING",
    "DEPLOYING",
    "VERIFYING",
    "COMPLETED",
)
SHA = re.compile(r"^[0-9a-f]{40}$")
IDENT = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write_json(path, value):
    path = Path(path)
    tmp = path.with_suffix(".tmp-" + uuid.uuid4().hex)
    with tmp.open("x") as f:
        os.chmod(tmp, 0o600)
        json.dump(value, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class Config:
    def __init__(self, raw):
        self.raw = dict(raw)
        for key in (
            "repository",
            "env_file",
            "state_dir",
            "socket",
            "secret_file",
            "backup_dir",
        ):
            value = raw.get(key)
            if (
                not isinstance(value, str)
                or not value.startswith("/")
                or "REPLACE" in value
            ):
                raise ValueError("Configure an absolute host path for " + key)
            setattr(self, key, Path(value).resolve())
        for key in (
            "remote",
            "branch",
            "project",
            "app_service",
            "migration_service",
            "database_service",
            "backup_service",
        ):
            value = raw.get(key)
            if (
                not isinstance(value, str)
                or not IDENT.fullmatch(value)
                or "REPLACE" in value
            ):
                raise ValueError("Invalid configured identifier: " + key)
            setattr(self, key, value)
        if self.state_dir.is_relative_to(
            self.repository
        ) or self.secret_file.is_relative_to(self.repository):
            raise ValueError(
                "Agent state and credentials must live outside the application checkout"
            )
        self.trusted_remote = raw.get("trusted_remote", "")
        if not self.trusted_remote or any(
            x in self.trusted_remote for x in ("\n", "\r", " ")
        ):
            raise ValueError("Configure a trusted remote")
        self.compose_files = [
            Path(p).resolve()
            for p in raw.get("compose_files", [])
            if isinstance(p, str) and p.startswith("/")
        ]
        if (
            len(self.compose_files) != len(raw.get("compose_files", []))
            or not self.compose_files
        ):
            raise ValueError("Configure absolute Compose file paths")
        self.worker_services = raw.get("worker_services", [])
        if (
            not isinstance(self.worker_services, list)
            or not self.worker_services
            or any(
                not isinstance(s, str) or not IDENT.fullmatch(s)
                for s in self.worker_services
            )
        ):
            raise ValueError("Configure worker services")
        self.services = [self.app_service, *self.worker_services]
        if len(set(self.services)) != len(self.services) or any(
            s
            in (
                "db",
                "caddy",
                "cloudflared",
                "docs",
                self.database_service,
                self.migration_service,
            )
            for s in self.services
        ):
            raise ValueError("Only application services may be recreated")
        if self.backup_service not in self.worker_services:
            raise ValueError("Backup service must be an application worker")
        self.health_path = raw.get("health_path", "/api/health/ready")
        if not re.fullmatch(r"/[a-zA-Z0-9/_-]+", self.health_path):
            raise ValueError("Invalid health path")
        self.proxy_health_url = raw.get("proxy_health_url", "")
        parsed = urlsplit(self.proxy_health_url)
        self.proxy_resolve_address = raw.get("proxy_resolve_address")
        local_hosts = ("127.0.0.1", "localhost", "::1")
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or (
                parsed.hostname not in local_hosts
                and self.proxy_resolve_address not in ("127.0.0.1", "::1")
            )
        ):
            raise ValueError(
                "Configure a loopback proxy probe or pin its TLS hostname to a loopback resolve address"
            )
        if (
            self.proxy_resolve_address is not None
            and self.proxy_resolve_address not in ("127.0.0.1", "::1")
        ):
            raise ValueError("Proxy resolve address must be loopback")
        for key, default, minimum, maximum in [
            ("minimum_free_bytes", 10 * 1024**3, 1024**3, 1024**5),
            ("command_timeout_seconds", 1800, 10, 7200),
            ("health_timeout_seconds", 180, 5, 1800),
            ("stabilization_seconds", 30, 1, 600),
            ("log_retention_days", 90, 1, 3650),
            ("history_retention_days", 365, 7, 3650),
            ("known_good_image_retention", 3, 1, 100),
        ]:
            value = raw.get(key, default)
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or not minimum <= value <= maximum
            ):
                raise ValueError("Invalid " + key)
            setattr(self, key, value)
        if self.stabilization_seconds >= self.health_timeout_seconds:
            raise ValueError("Health timeout must exceed the stabilization interval")


class Store:
    def __init__(self, directory):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(directory, 0o700)
        self.path = directory / "jobs.sqlite3"
        with self.connect() as db:
            db.executescript(
                """PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, request_id TEXT UNIQUE, actor TEXT NOT NULL, revision TEXT NOT NULL, previous TEXT, status TEXT NOT NULL, stage TEXT NOT NULL, created TEXT NOT NULL, started TEXT, finished TEXT, data TEXT NOT NULL DEFAULT '{}');
CREATE UNIQUE INDEX IF NOT EXISTS one_active ON jobs((1)) WHERE status IN ('QUEUED','RUNNING','RECOVERY_REQUIRED');
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL, timestamp TEXT NOT NULL,stage TEXT NOT NULL,level TEXT NOT NULL,message TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_job ON events(job_id,id);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY,expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS limits(actor TEXT, operation TEXT, timestamp REAL);
"""
            )
        os.chmod(self.path, 0o600)

    @contextlib.contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def meta(self, key, value=None):
        with self.connect() as db:
            if value is not None:
                db.execute(
                    "INSERT OR REPLACE INTO metadata VALUES(?,?)",
                    (key, json.dumps(value)),
                )
            row = db.execute(
                "SELECT value FROM metadata WHERE key=?", (key,)
            ).fetchone()
            return json.loads(row[0]) if row else None

    def job(self, id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM jobs WHERE id=?", (id,)).fetchone()
        if not row:
            raise ValueError("Deployment job not found")
        return {**dict(row), "data": json.loads(row["data"])}

    def history(self):
        with self.connect() as db:
            ids = [
                r[0]
                for r in db.execute(
                    "SELECT id FROM jobs ORDER BY created DESC LIMIT 100"
                )
            ]
        return [self.job(id) for id in ids]

    def active(self):
        with self.connect() as db:
            row = db.execute(
                "SELECT id FROM jobs WHERE status IN ('QUEUED','RUNNING','RECOVERY_REQUIRED')"
            ).fetchone()
        return self.job(row[0]) if row else None

    def update(self, id, **fields):
        allowed = {"status", "stage", "previous", "started", "finished", "data"}
        if not fields or set(fields) - allowed:
            raise ValueError("Invalid internal update")
        if "data" in fields:
            fields["data"] = json.dumps(fields["data"])
        with self.connect() as db:
            db.execute(
                "UPDATE jobs SET " + ",".join(k + "=?" for k in fields) + " WHERE id=?",
                (*fields.values(), id),
            )

    def event(self, id, stage, message, level="INFO"):
        with self.connect() as db:
            count = db.execute(
                "SELECT count(*) FROM events WHERE job_id=?", (id,)
            ).fetchone()[0]
            if count >= 20000:
                return
            db.execute(
                "INSERT INTO events(job_id,timestamp,stage,level,message) VALUES(?,?,?,?,?)",
                (id, now(), stage, level, message[:4000]),
            )

    def events(self, id, after=0):
        self.job(id)
        with self.connect() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT * FROM events WHERE job_id=? AND id>? ORDER BY id LIMIT 500",
                    (id, after),
                )
            ]

    def claim(self, revision, actor, request_id, migration_approval=None):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT id,revision,actor,data FROM jobs WHERE request_id=?", (request_id,)
            ).fetchone()
            if row:
                if row["revision"] != revision or row["actor"] != actor or json.loads(row["data"]).get("migrationApproval") != migration_approval:
                    raise ValueError("Request identifier already used")
                return row["id"]
            row = db.execute(
                "SELECT id FROM jobs WHERE status IN ('QUEUED','RUNNING','RECOVERY_REQUIRED')"
            ).fetchone()
            if row:
                raise ValueError("Another deployment is active or requires recovery")
            id = uuid.uuid4().hex
            db.execute(
                "INSERT INTO jobs(id,request_id,actor,revision,status,stage,created,data) VALUES(?,?,?,?,?,?,?,?)",
                (id, request_id, actor, revision, "QUEUED", "QUEUED", now(), json.dumps({"migrationApproval": migration_approval})),
            )
            return id

    def interrupted(self):
        active = self.active()
        if active and active["status"] == "RUNNING":
            data = active["data"]
            data["error"] = (
                "Agent restarted during an operation. Inspect actual services; no migration or container operation was replayed."
            )
            self.update(
                active["id"],
                status=(
                    "RECOVERY_REQUIRED" if data.get("replacementStarted") else "FAILED"
                ),
                finished=now(),
                data=data,
            )
            self.event(active["id"], active["stage"], data["error"], "ERROR")

    def nonce(self, nonce, timestamp):
        with self.connect() as db:
            db.execute("DELETE FROM nonces WHERE expires<?", (time.time(),))
            try:
                db.execute("INSERT INTO nonces VALUES(?,?)", (nonce, timestamp + 120))
            except sqlite3.IntegrityError:
                raise PermissionError("Replayed operation credential")

    def rate_limit(self, actor, operation, limit=12):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM limits WHERE timestamp<?", (time.time() - 60,))
            if (
                db.execute(
                    "SELECT count(*) FROM limits WHERE actor=? AND operation=?",
                    (actor, operation),
                ).fetchone()[0]
                >= limit
            ):
                raise ValueError("Operation rate limit reached. Try again shortly.")
            db.execute(
                "INSERT INTO limits VALUES(?,?,?)", (actor, operation, time.time())
            )


class Agent:
    def __init__(self, config):
        self.c = config
        self.store = Store(config.state_dir)
        if config.secret_file.stat().st_mode & 0o027:
            raise ValueError("Agent key must not be world-accessible or group-writable")
        self.secret = config.secret_file.read_text().strip()
        if not re.fullmatch(r"[0-9a-f]{64,128}", self.secret):
            raise ValueError("Agent key must be 32 or more random bytes encoded as hex")
        self.secrets = {self.secret}
        self.operation_lock = threading.RLock()
        self.local = threading.local()
        self.store.interrupted()
        self.retain()

    def retain(self):
        # Only historical rows/logs expire. Images and release/configuration artifacts are
        # deliberately retained for operator-controlled cleanup, never globally pruned.
        if self.store.active():
            return
        with self.store.connect() as db:
            cutoff = (
                dt.datetime.now(dt.timezone.utc)
                - dt.timedelta(days=self.c.log_retention_days)
            ).isoformat()
            db.execute(
                "DELETE FROM events WHERE timestamp<? AND job_id IN (SELECT id FROM jobs WHERE status IN ('COMPLETED','FAILED','RECOVERED'))",
                (cutoff,),
            )
            cutoff = (
                dt.datetime.now(dt.timezone.utc)
                - dt.timedelta(days=self.c.history_retention_days)
            ).isoformat()
            keep = [
                j["id"]
                for j in self.store.history()
                if j["status"] in ("COMPLETED", "RECOVERED")
            ][: self.c.known_good_image_retention]
            for row in db.execute(
                "SELECT id FROM jobs WHERE finished<? AND status IN ('COMPLETED','FAILED','RECOVERED')",
                (cutoff,),
            ).fetchall():
                if row[0] not in keep:
                    db.execute("DELETE FROM events WHERE job_id=?", (row[0],))
                    db.execute("DELETE FROM jobs WHERE id=?", (row[0],))

    def redact(self, value):
        value = str(value)
        for secret in sorted(self.secrets, key=len, reverse=True):
            if secret:
                value = value.replace(secret, "[redacted]")
        value = re.sub(
            r"(?i)(https?://|postgres(?:ql)?://|ssh://)[^\s/@]+:[^\s/@]+@",
            r"\1[redacted]@",
            value,
        )
        value = re.sub(
            r"(?i)\b(?:Bearer\s+|(?:password|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+",
            "[redacted]",
            value,
        )
        value = re.sub(
            r"\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,})\b",
            "[redacted]",
            value,
        )
        value = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", value)
        return value

    def event(self, message, level="INFO"):
        job = getattr(self.local, "job", None)
        if job:
            stage = self.store.job(job)["stage"]
            self.store.event(job, stage, self.redact(message), level)

    def run(self, args, timeout=None, log=False):
        # Every caller constructs argv from fixed operations; no shell interpolation.
        env = {
            **os.environ,
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_SSH_COMMAND": "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes",
            "DOCKER_BUILDKIT": "1",
            "COMPOSE_INTERACTIVE_NO_CLI": "1",
        }
        deadline = min(
            time.monotonic() + (timeout or self.c.command_timeout_seconds),
            getattr(self.local, "deadline", float("inf")),
        )
        with subprocess.Popen(
            args,
            cwd=self.c.repository,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        ) as proc:
            selector = selectors.DefaultSelector()
            selector.register(proc.stdout, selectors.EVENT_READ)
            chunks = []
            pending = b""
            total = 0
            try:
                while selector.get_map():
                    if time.monotonic() > deadline:
                        raise TimeoutError("Deployment operation timed out")
                    for key, _ in selector.select(0.2):
                        chunk = os.read(key.fileobj.fileno(), 8192)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            break
                        total += len(chunk)
                        if total <= 8 * 1024**2:
                            chunks.append(chunk)
                        if log:
                            pending += chunk
                            while b"\n" in pending or len(pending) > 4000:
                                line, sep, pending = (
                                    pending.partition(b"\n")
                                    if b"\n" in pending
                                    else (pending[:4000], b"", pending[4000:])
                                )
                                self.event(line.decode("utf8", "replace"))
                if log and pending:
                    self.event(pending.decode("utf8", "replace"))
                proc.wait(timeout=max(0.1, deadline - time.monotonic()))
                output = b"".join(chunks).decode("utf8", "replace").strip()
                if proc.returncode:
                    raise RuntimeError(
                        "Command failed ("
                        + Path(args[0]).name
                        + "): "
                        + self.redact(output[-2000:])
                    )
                if total > 8 * 1024**2 and not log:
                    raise RuntimeError("Command output exceeded safe limit")
                return output
            except BaseException:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
                raise
            finally:
                selector.close()

    def git(self, *args):
        return self.run(["git", "-C", str(self.c.repository), *args], timeout=90)

    def compose(self, *args, overlay=None, files=None):
        command = [
            "docker",
            "compose",
            "--project-name",
            self.c.project,
            "--project-directory",
            str(self.c.repository),
            "--env-file",
            str(self.c.env_file),
        ]
        for file in files or self.c.compose_files:
            command += ["-f", str(file)]
        if overlay:
            command += ["-f", str(overlay)]
        return [*command, *args]

    def compose_config(self, overlay=None):
        data = json.loads(
            self.run(self.compose("config", "--format", "json", overlay=overlay))
        )
        for service in data["services"].values():
            for key, value in service.get("environment", {}).items():
                if value and (
                    re.search(r"PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL|SMTP", key, re.I)
                ):
                    self.secrets.add(str(value))
                    if key == "DATABASE_URL":
                        parsed = urlsplit(str(value))
                        if parsed.password:
                            self.secrets.add(parsed.password)
        return data

    def installation(self):
        config = self.compose_config()
        ids = self.run(self.compose("ps", "-q", self.c.app_service)).split()
        if len(ids) != 1:
            raise RuntimeError("Expected exactly one running application container")
        # Revision comes from the running image, never the host branch pointer.
        sha = self.run(
            [
                "docker",
                "exec",
                ids[0],
                "node",
                "-e",
                "process.stdout.write(require('fs').readFileSync('/app/REVISION','utf8').trim())",
            ],
            timeout=20,
        )
        if not SHA.fullmatch(sha):
            raise RuntimeError(
                "Running image has no exact REVISION; perform one manual revision-stamped deployment first"
            )
        self.git("cat-file", "-e", sha + "^{commit}")
        return sha, config

    def verify_repo(self):
        if self.git("remote", "get-url", self.c.remote) != self.c.trusted_remote:
            raise RuntimeError("Configured Git remote identity does not match")
        if self.git("status", "--porcelain", "--untracked-files=normal"):
            raise RuntimeError(
                "Production working tree has modifications; preserve and review them before deploying"
            )
        self.git(
            "fetch",
            "--no-tags",
            self.c.remote,
            "+refs/heads/"
            + self.c.branch
            + ":refs/remotes/"
            + self.c.remote
            + "/"
            + self.c.branch,
        )
        target = self.git(
            "rev-parse", "refs/remotes/" + self.c.remote + "/" + self.c.branch
        )
        if not SHA.fullmatch(target):
            raise RuntimeError("Invalid approved branch revision")
        return target

    @contextlib.contextmanager
    def exclusive(self):
        if not self.operation_lock.acquire(blocking=False):
            raise ValueError(
                "Deployment agent is busy; the current job continues independently"
            )
        try:
            yield
        finally:
            self.operation_lock.release()

    def check_updates(self):
        with self.exclusive():
            if self.store.active():
                raise ValueError(
                    "Finish or reconcile the active deployment before checking another update"
                )
            target = self.verify_repo()
            current, _ = self.installation()
            self.git("merge-base", "--is-ancestor", current, target)
            commits = self.git(
                "log", "--format=%H%x09%s", "--max-count=30", current + ".." + target
            )
            count = int(self.git("rev-list", "--count", current + ".." + target))
            result = {
                "current": current,
                "revision": target,
                "branch": self.c.branch,
                "ahead": count,
                "fastForward": True,
                "clean": True,
                "eligible": target != current,
                "commits": [
                    {
                        "revision": line.split("\t", 1)[0],
                        "subject": self.redact(line.split("\t", 1)[-1]),
                    }
                    for line in commits.splitlines()
                ],
            }
            self.store.meta("checked", result)
            return result

    def migration_review(self, current, target):
        def tree(sha):
            output = self.git("ls-tree", "-r", sha, "--", "prisma/migrations")
            return {
                line.split("\t", 1)[1]: line.split()[2]
                for line in output.splitlines()
                if "\t" in line
            }

        old, new = tree(current), tree(target)
        if any(new.get(path) != blob for path, blob in old.items()):
            raise RuntimeError(
                "An existing migration was removed or changed; manual deployment review is required"
            )
        added = sorted(set(new) - set(old))
        files = []
        requires_approval = False
        total = 0
        for file in added:
            if not file.endswith("/migration.sql"):
                raise RuntimeError("Unexpected migration artifact; manual review required")
            sql = self.git("show", target + ":" + file)
            total += len(sql.encode())
            self.ensure(total <= 262144, "Migration SQL exceeds web review limit; manual host review required")
            sensitive = bool(re.search(r"\b(DROP|TRUNCATE|DELETE)\b|\bALTER\b[^;]*\b(TYPE|RENAME)\b", sql, re.I))
            requires_approval = requires_approval or sensitive
            files.append({"path": file, "blob": new[file], "sql": self.redact(sql), "requiresApproval": sensitive})
        digest = hashlib.sha256(json.dumps([current, target, [(f["path"], f["blob"]) for f in files]], separators=(",", ":")).encode()).hexdigest()
        return {"digest": digest, "requiresApproval": requires_approval, "files": files}

    def migrations(self, current, target, approval=None):
        review = self.migration_review(current, target)
        self.ensure(not review["requiresApproval"] or approval == review["digest"], "Potentially destructive SQL requires explicit approval of the exact migration review")
        return [file["path"] for file in review["files"]]

    def health(self, expected=None):
        script = (
            "fetch('http://127.0.0.1:'+ (process.env.PORT||'3000') + "
            + json.dumps(self.c.health_path)
            + ",{signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)process.exit(1); console.log(JSON.stringify(await r.json()))}).catch(()=>process.exit(1))"
        )
        payload = json.loads(
            self.run(
                self.compose("exec", "-T", self.c.app_service, "node", "-e", script),
                timeout=15,
            )
        )
        if payload.get("status") != "ready" or (
            expected and payload.get("revision") != expected
        ):
            raise RuntimeError("Application readiness or revision check failed")
        # Separate host-local reverse proxy check, not the Cloudflare endpoint.
        args = [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--noproxy",
            "*",
            "--max-time",
            "5",
            "--max-filesize",
            "8192",
        ]
        if self.c.proxy_resolve_address:
            parsed = urlsplit(self.c.proxy_health_url)
            address = (
                "[" + self.c.proxy_resolve_address + "]"
                if ":" in self.c.proxy_resolve_address
                else self.c.proxy_resolve_address
            )
            args += [
                "--resolve",
                parsed.hostname
                + ":"
                + str(parsed.port or (443 if parsed.scheme == "https" else 80))
                + ":"
                + address,
            ]
        raw = self.run([*args, self.c.proxy_health_url], timeout=10)
        proxy = json.loads(raw)
        if proxy.get("status") != "ready" or proxy.get("revision") != payload.get(
            "revision"
        ):
            raise RuntimeError("Local reverse proxy readiness or revision check failed")
        return {
            "status": "ready",
            "revision": payload["revision"],
            "database": "reachable",
            "proxy": "ready",
            "checkedAt": now(),
        }

    def preflight(self, target, job_id=None, migration_approval=None):
        if not isinstance(target, str) or not SHA.fullmatch(target):
            raise ValueError("Use an exact 40-character approved revision")
        checks = []
        context = {}

        def check(label, work):
            try:
                value = work()
                checks.append({"name": label, "ok": True})
                return value
            except Exception as error:
                checks.append(
                    {"name": label, "ok": False, "message": self.redact(str(error))}
                )
                return None

        active = self.store.active()
        check(
            "Exclusive deployment slot",
            lambda: self.ensure(
                not active or active["id"] == job_id,
                "Another deployment is active or requires recovery",
            ),
        )
        approved = check(
            "Trusted Git remote, clean checkout and approved revision", self.verify_repo
        )
        check(
            "Approved immutable target",
            lambda: self.ensure(
                approved == target,
                "The approved branch advanced; check and review updates again",
            ),
        )
        check(
            "Docker daemon",
            lambda: self.run(
                ["docker", "info", "--format", "{{.ServerVersion}}"], timeout=15
            ),
        )
        check(
            "Docker Compose",
            lambda: self.run(["docker", "compose", "version", "--short"], timeout=15),
        )
        check("Local Docker storage reserve", self.docker_storage)
        check(
            "Deployment files and secrets",
            lambda: self.ensure(
                all(
                    p.is_file()
                    for p in [
                        *self.c.compose_files,
                        self.c.env_file,
                        self.c.secret_file,
                    ]
                ),
                "Required deployment configuration is missing",
            ),
        )
        check(
            "Agent storage and available disk",
            lambda: self.ensure(
                os.access(self.c.state_dir, os.W_OK)
                and shutil.disk_usage(self.c.state_dir).free
                >= self.c.minimum_free_bytes,
                "Agent release storage is not writable or lacks build/rollback reserve",
            ),
        )
        install = check(
            "Current running image provenance and Compose configuration",
            self.installation,
        )
        if install:
            current, config = install
            context = {"previous": current, "config": config}
            check(
                "Fast-forward update",
                lambda: self.git("merge-base", "--is-ancestor", current, target),
            )
            check(
                "A newer revision is available",
                lambda: self.ensure(current != target, "AxilDB is up to date"),
            )
            review = check("Migration history and SQL review", lambda: self.migration_review(current, target))
            if review:
                context["migrationReview"] = review
                context["migrations"] = [file["path"] for file in review["files"]]
                check("Explicit approval for potentially destructive SQL", lambda: self.ensure(
                    not review["requiresApproval"] or migration_approval == review["digest"],
                    "Review the exact SQL and explicitly approve its database risks before starting the upgrade"))
            check(
                "Host Compose topology unchanged",
                lambda: self.verify_topology(current, target),
            )
            check(
                "Configured application, worker and migration services",
                lambda: self.validate_services(config),
            )
            check(
                "Existing images available for backup and recovery",
                lambda: self.images(config),
            )
            check("Database and backup tooling", lambda: self.backup_probe())
            check(
                "Current application and reverse proxy readiness",
                lambda: self.health(current),
            )
            check("Agent protocol compatibility", lambda: self.protocol_for(target))
        return {
            "ready": all(c["ok"] for c in checks),
            "reviewable": all(c["ok"] for c in checks if c["name"] != "Explicit approval for potentially destructive SQL"),
            "migrationReview": context.get("migrationReview"),
            "revision": target,
            "checks": checks,
            "migrations": context.get("migrations") or [],
            "previous": context.get("previous"),
        }, context

    @staticmethod
    def ensure(ok, message):
        if not ok:
            raise RuntimeError(message)

    def protocol_for(self, target):
        raw = self.git("show", target + ":deployment-protocol.json")
        data = json.loads(raw)
        self.ensure(
            data.get("minimumAgentProtocol") == PROTOCOL,
            "Target needs a different deployment agent protocol; upgrade the host agent separately",
        )

    def verify_topology(self, current, target):
        changed = self.git(
            "diff",
            "--name-only",
            current,
            target,
            "--",
            "docker-compose.yml",
            *[
                str(p.relative_to(self.c.repository))
                for p in self.c.compose_files
                if p.is_relative_to(self.c.repository)
            ],
        )
        self.ensure(
            not changed,
            "Compose topology changed; review and deploy host configuration manually before remote upgrades",
        )

    def validate_services(self, config):
        services = config.get("services", {})
        self.ensure(
            all(
                s in services
                for s in [
                    *self.c.services,
                    self.c.database_service,
                    self.c.migration_service,
                ]
            ),
            "Configured services are missing",
        )
        self.ensure(
            services[self.c.migration_service].get("build", {}).get("target")
            == "builder",
            "Migration service must use the existing builder image",
        )
        for s in self.c.services:
            self.ensure(
                bool(services[s].get("build")),
                "Only application services built from this repository can be upgraded",
            )
        for mount in services[self.c.app_service].get("volumes", []):
            source = Path(mount.get("source", "/nonexistent"))
            self.ensure(
                not str(source).endswith("docker.sock"),
                "The public app must not mount the Docker socket",
            )
            if mount.get("type") == "bind":
                self.ensure(
                    not self.c.state_dir.is_relative_to(source),
                    "Agent private state must not be mounted into the public app",
                )
        mounts = services[self.c.backup_service].get("volumes", [])
        self.ensure(
            any(
                m.get("type") == "bind"
                and m.get("target") == "/app/backups"
                and Path(m.get("source", "")).resolve() == self.c.backup_dir
                for m in mounts
            ),
            "Backup bind mount does not match configured host checkpoint directory",
        )
        for s in [*self.c.services, self.c.migration_service]:
            self.ensure(
                bool(services[s].get("environment", {}).get("DATABASE_URL")),
                "Required database configuration is missing",
            )
        self.ensure(
            not (self.c.backup_dir / ".migration/outbound-hold.json").exists(),
            "An instance migration hold is active",
        )

    def images(self, config):
        images = {}
        for service in self.c.services:
            ids = self.run(self.compose("ps", "-q", service)).split()
            self.ensure(
                len(ids) == 1,
                "Each application worker must already be running: " + service,
            )
            images[service] = self.run(
                ["docker", "inspect", "--format", "{{.Image}}", ids[0]], timeout=15
            )
            self.run(
                ["docker", "image", "inspect", "--format", "{{.Id}}", images[service]],
                timeout=15,
            )
        return images

    def docker_storage(self):
        context = self.run(
            ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
            timeout=15,
        )
        self.ensure(
            context.startswith("unix://"),
            "Only a host-local Docker daemon is supported",
        )
        directory = self.run(
            ["docker", "info", "--format", "{{.DockerRootDir}}"], timeout=15
        )
        self.ensure(
            Path(directory).is_absolute()
            and shutil.disk_usage(directory).free >= self.c.minimum_free_bytes,
            "Docker storage lacks the configured build/rollback reserve or cannot be inspected",
        )

    def backup_probe(self):
        script = "import os,shutil,subprocess; import sys; sys.path.insert(0,'scripts/migration'); from routine import LocalDatabase; LocalDatabase(os.environ['DATABASE_URL']); assert all(shutil.which(x) for x in ['pg_dump','pg_restore','psql']); assert os.path.isfile('scripts/backup.sh'); subprocess.run(['psql','-tAc','SELECT 1'],check=True,stdout=subprocess.DEVNULL)"
        return self.run(
            self.compose(
                "run",
                "--rm",
                "--no-deps",
                "--pull",
                "never",
                self.c.backup_service,
                "python3",
                "-c",
                script,
            ),
            timeout=60,
        )

    def database_fingerprint(self):
        script = r'''import os, subprocess, hashlib
import sys
sys.path.insert(0,'scripts/migration')
from routine import LocalDatabase
LocalDatabase(os.environ['DATABASE_URL'])
sql = """SELECT coalesce(json_agg(t),'[]'::json)::text FROM (SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name) t"""
r = subprocess.run(['psql','-tAc',sql],check=True,capture_output=True)
schema = subprocess.run(['pg_dump','--schema-only','--no-owner','--no-privileges'],check=True,capture_output=True).stdout
schema = b'\n'.join(line for line in schema.splitlines() if line and not line.startswith((b'--',b'\\restrict',b'\\unrestrict')))
print(hashlib.sha256(r.stdout+schema).hexdigest())
'''
        return self.run(
            self.compose(
                "run",
                "--rm",
                "--no-deps",
                "--pull",
                "never",
                self.c.backup_service,
                "python3",
                "-c",
                script,
            ),
            timeout=60,
        ).splitlines()[-1]

    def checkpoint(self, id, images):
        # Reuse the currently deployed backup implementation, not unreviewed target code.
        overlay = self.c.state_dir / id / "backup.compose.json"
        write_json(
            overlay,
            {
                "services": {
                    self.c.backup_service: {"image": images[self.c.backup_service]}
                }
            },
        )
        self.run(
            self.compose(
                "run",
                "--rm",
                "--no-deps",
                "--pull",
                "never",
                "-e",
                "AXILDB_BACKUP_DIR=/app/backups/deploy-" + id,
                self.c.backup_service,
                "sh",
                "scripts/backup.sh",
                overlay=overlay,
            ),
            log=True,
        )
        # Verify inside the existing backup container: root-owned mode-0700 checkpoint
        # directories need not be readable by the unprivileged host service identity.
        # Full pg_restore parsing plus gzip/tar streaming validates archives without extracting or printing contents.
        script = (
            "import subprocess,tarfile,gzip; from pathlib import Path; p=Path('/app/backups/deploy-"
            + id
            + "'); assert all((p/name).is_file() and (p/name).stat().st_size>0 for name in ('axildb.dump','uploads.tar.gz','labels.tar.gz','manifest.txt')), 'Backup checkpoint is incomplete'; subprocess.run(['pg_restore','--file','/dev/null',str(p/'axildb.dump')],check=True,stdout=subprocess.DEVNULL); "
            + "\nfor name in ('uploads.tar.gz','labels.tar.gz'):\n with gzip.open(p/name,'rb') as stream:\n  while stream.read(1024*1024): pass\n with tarfile.open(p/name,'r:gz') as archive:\n  for member in archive: pass\n"
        )
        self.run(
            self.compose(
                "run",
                "--rm",
                "--no-deps",
                "--pull",
                "never",
                self.c.backup_service,
                "python3",
                "-c",
                script,
                overlay=overlay,
            ),
            log=True,
        )
        return "deploy-" + id

    def prepare(self, id, target, config):
        directory = self.c.state_dir / id
        release = self.c.state_dir / "releases" / target
        release.parent.mkdir(exist_ok=True, mode=0o700)
        if release.exists():
            self.ensure(
                self.run(["git", "-C", str(release), "rev-parse", "HEAD"]) == target
                and not self.run(["git", "-C", str(release), "status", "--porcelain"]),
                "Existing release checkout has modifications",
            )
        else:
            self.git("worktree", "add", "--detach", str(release), target)
        # No env files are copied into the isolated build context.
        image_app = self.c.project + "-deployment-app:" + target
        image_worker = self.c.project + "-deployment-worker:" + target
        services = {}
        for service in [*self.c.services, self.c.migration_service]:
            services[service] = {
                "image": image_app if service == self.c.app_service else image_worker,
                "build": {"context": str(release), "args": {"GIT_COMMIT": target}},
                "labels": {"org.opencontainers.image.revision": target},
            }
        services[self.c.app_service]["environment"] = {
            "GIT_COMMIT": target,
            "SOURCE_COMMIT": target,
        }
        overlay = directory / "target.compose.json"
        write_json(overlay, {"services": services})
        self.compose_config(overlay)
        return overlay

    def queue(self, target, actor, request_id, migration_approval=None):
        self.ensure(
            isinstance(target, str) and SHA.fullmatch(target), "Invalid target revision"
        )
        checked = self.store.meta("checked")
        self.ensure(
            checked and checked.get("revision") == target and checked.get("eligible"),
            "Check and review the approved update first",
        )
        self.migrations(checked["current"], target, migration_approval)
        id = self.store.claim(target, actor, request_id, migration_approval)
        return self.public_job(self.store.job(id))

    def stage(self, id, name, **data):
        job = self.store.job(id)
        self.store.update(id, stage=name, data={**job["data"], **data})
        self.event(name.title())

    def deploy(self, id):
        job = self.store.job(id)
        if job["status"] != "QUEUED":
            return
        self.local.job = id
        # Whole-job bound in addition to bounded subprocesses; persists after browser exits.
        self.local.deadline = time.monotonic() + self.c.command_timeout_seconds * 4
        directory = self.c.state_dir / id
        directory.mkdir(mode=0o700, exist_ok=True)
        self.store.update(id, status="RUNNING", stage="PREFLIGHT", started=now())
        try:
            report, context = self.preflight(job["revision"], id, job["data"].get("migrationApproval"))
            self.stage(id, "PREFLIGHT", preflight=report)
            self.ensure(
                report["ready"],
                "Preflight failed: "
                + "; ".join(
                    c["name"] + ": " + c.get("message", "failed")
                    for c in report["checks"]
                    if not c["ok"]
                ),
            )
            self.store.update(id, previous=context["previous"])
            images = self.images(context["config"])
            write_json(directory / "previous.compose.json", context["config"])
            # Preserve image identities under explicit per-job tags. No image pruning occurs.
            for service, image in images.items():
                self.run(
                    [
                        "docker",
                        "tag",
                        image,
                        self.c.project + "-known-good:" + id + "-" + service,
                    ]
                )
            fingerprint = self.database_fingerprint()
            self.stage(
                id,
                "BACKUP",
                previousImages=images,
                schemaBefore=fingerprint,
                hasMigrations=bool(report["migrations"]),
            )
            checkpoint = self.checkpoint(id, images)
            self.stage(id, "FETCHING", backup=checkpoint)
            # The approved SHA must remain on the configured channel. A branch advancing
            # after confirmation aborts rather than silently changing the target.
            self.ensure(
                self.verify_repo() == job["revision"],
                "Approved channel changed after confirmation; review the new revision",
            )
            self.stage(id, "PREPARING")
            overlay = self.prepare(id, job["revision"], context["config"])
            self.stage(id, "BUILDING")
            self.run(
                self.compose(
                    "build",
                    self.c.app_service,
                    self.c.migration_service,
                    overlay=overlay,
                ),
                log=True,
            )
            self.stage(id, "MIGRATING", migrationStatus="NOT_STARTED")
            if report["migrations"]:
                # Stop old code before unproven schema transitions. Infrastructure remains up.
                self.stage(
                    id,
                    "MIGRATING",
                    replacementStarted=True,
                    migrationStatus="MAY_HAVE_PARTIALLY_COMMITTED",
                )
                self.run(self.compose("stop", *self.c.services), log=True)
                self.run(
                    self.compose(
                        "run",
                        "--rm",
                        "--no-deps",
                        "--pull",
                        "never",
                        self.c.migration_service,
                        overlay=overlay,
                    ),
                    log=True,
                )
            self.stage(
                id,
                "DEPLOYING",
                migrationStatus="COMPLETED" if report["migrations"] else "NOT_REQUIRED",
                replacementStarted=True,
            )
            self.run(
                self.compose(
                    "up",
                    "-d",
                    "--no-deps",
                    "--no-build",
                    "--pull",
                    "never",
                    *self.c.services,
                    overlay=overlay,
                ),
                log=True,
            )
            self.stage(id, "VERIFYING")
            health = self.stabilize(job["revision"])
            self.stage(
                id,
                "COMPLETED",
                health=health,
                result="Verified exact revision, database and local proxy readiness",
            )
            self.store.update(id, status="COMPLETED", finished=now())
            self.store.meta(
                "deployed",
                {"revision": job["revision"], "deployedAt": now(), "jobId": id},
            )
        except Exception as error:
            job = self.store.job(id)
            data = job["data"]
            data["error"] = self.redact(str(error))
            data["failedStage"] = job["stage"]
            status = "RECOVERY_REQUIRED" if data.get("replacementStarted") else "FAILED"
            self.store.update(id, status=status, finished=now(), data=data)
            self.event(data["error"], "ERROR")
        finally:
            self.local.job = None
            self.local.deadline = float("inf")

    def stabilize(self, revision):
        deadline = min(
            time.monotonic() + self.c.health_timeout_seconds,
            getattr(self.local, "deadline", float("inf")),
        )
        healthy_since = None
        last_error = "Waiting for application startup"
        while time.monotonic() < deadline:
            try:
                health = self.health(revision)
                for service in self.c.services:
                    ids = self.run(
                        self.compose("ps", "--status", "running", "-q", service)
                    ).split()
                    self.ensure(
                        len(ids) == 1, "Application worker is not running: " + service
                    )
                if healthy_since is None:
                    healthy_since = time.monotonic()
                if time.monotonic() - healthy_since >= self.c.stabilization_seconds:
                    return health
            except Exception as error:
                healthy_since = None
                last_error = self.redact(str(error))
            time.sleep(2)
        raise RuntimeError("Health stabilization failed: " + last_error)

    def recovery_options(self, id):
        job = self.store.job(id)
        data = job["data"]
        reasons = []
        if job["status"] != "RECOVERY_REQUIRED":
            reasons.append("This job does not require recovery")
        if (
            data.get("hasMigrations")
            or data.get("migrationStatus") == "MAY_HAVE_PARTIALLY_COMMITTED"
        ):
            reasons.append(
                "Schema compatibility is unproven after migration work; use manual recovery"
            )
        if not (self.c.state_dir / id / "previous.compose.json").is_file():
            reasons.append("Previous deployment configuration is unavailable")
        images = data.get("previousImages", {})
        if not images:
            reasons.append("Previous image identities were not captured")
        for image in images.values():
            try:
                self.run(
                    ["docker", "image", "inspect", "--format", "{{.Id}}", image],
                    timeout=15,
                )
            except Exception:
                reasons.append("A previous application image is unavailable")
                break
        if not reasons:
            try:
                self.ensure(
                    self.database_fingerprint() == data.get("schemaBefore"),
                    "Migration history changed; schema compatibility cannot be established",
                )
            except Exception as error:
                reasons.append(self.redact(str(error)))
        return {
            "applicationRollback": not reasons,
            "reasons": reasons,
            "manualRecovery": "Use the recorded checkpoint and migration diagnostics with the existing host restore workflow. Database restore requires separate explicit authorization. No database restore or migration retry is performed here.",
        }

    def rollback(self, id):
        # Explicit administrator operation, never automatic database recovery.
        with self.operation_lock:
            options = self.recovery_options(id)
            self.ensure(
                options["applicationRollback"],
                "Application rollback is unavailable: " + "; ".join(options["reasons"]),
            )
            job = self.store.job(id)
            directory = self.c.state_dir / id
            write_json(
                directory / "rollback.compose.json",
                {
                    "services": {
                        s: {"image": image}
                        for s, image in job["data"]["previousImages"].items()
                    }
                },
            )
            self.local.job = id
            self.local.deadline = time.monotonic() + self.c.command_timeout_seconds
            try:
                self.event("Explicit application-only recovery requested", "WARNING")
                self.run(
                    self.compose(
                        "up",
                        "-d",
                        "--no-deps",
                        "--no-build",
                        "--pull",
                        "never",
                        *self.c.services,
                        files=[
                            directory / "previous.compose.json",
                            directory / "rollback.compose.json",
                        ],
                    ),
                    log=True,
                )
                health = self.stabilize(job["previous"])
                self.store.update(
                    id,
                    status="RECOVERED",
                    finished=now(),
                    data={
                        **job["data"],
                        "recoveryHealth": health,
                        "recoveryResult": "Previous application images restored without database operations",
                    },
                )
                self.event("Previous application revision is healthy")
                self.store.meta(
                    "deployed",
                    {"revision": job["previous"], "deployedAt": now(), "jobId": id},
                )
            except Exception as error:
                self.event(str(error), "ERROR")
                raise
            finally:
                self.local.job = None
                self.local.deadline = float("inf")

    def public_job(self, job):
        data = job["data"]
        return {k: v for k, v in job.items() if k != "data"} | {
            "data": {
                k: v
                for k, v in data.items()
                if k
                in (
                    "preflight",
                    "migrationApproval",
                    "backup",
                    "hasMigrations",
                    "migrationStatus",
                    "health",
                    "result",
                    "error",
                    "failedStage",
                    "replacementStarted",
                    "recoveryHealth",
                    "recoveryResult",
                )
            }
        }

    def status(self):
        deployed = self.store.meta("deployed")
        try:
            current, _ = self.installation()
        except Exception as error:
            current = deployed.get("revision") if deployed else None
            health = {"status": "unavailable", "message": self.redact(str(error))}
        else:
            try:
                health = self.health(current)
            except Exception as error:
                health = {"status": "unavailable", "message": self.redact(str(error))}
        active = self.store.active()
        history = self.store.history()
        return {
            "protocol": PROTOCOL,
            "application": "AxilDB",
            "capabilities": ["migration-sql-review-v1"],
            "revision": current,
            "branch": self.c.branch,
            "deployedAt": deployed.get("deployedAt") if deployed else None,
            "health": health,
            "checked": self.store.meta("checked"),
            "activeJob": self.public_job(active) if active else None,
            "history": [self.public_job(j) for j in history],
            "lastSuccessfulUpgrade": next(
                (self.public_job(j) for j in history if j["status"] == "COMPLETED"),
                None,
            ),
        }

    def authenticate(self, body, headers):
        timestamp = headers.get("X-AxilDB-Time", "")
        nonce = headers.get("X-AxilDB-Nonce", "")
        signature = headers.get("X-AxilDB-Signature", "")
        if (
            not re.fullmatch(r"\d{10}", timestamp)
            or abs(time.time() - int(timestamp)) > 60
            or not re.fullmatch(r"[a-f0-9]{32}", nonce)
        ):
            raise PermissionError("Expired or invalid operation credential")
        expected = hmac.new(
            self.secret.encode(),
            timestamp.encode() + b"\n" + nonce.encode() + b"\n" + body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise PermissionError("Invalid operation signature")
        self.store.nonce(nonce, int(timestamp))

    def dispatch(self, request):
        if not isinstance(request, dict) or request.get("protocol") != PROTOCOL:
            raise ValueError("Unsupported deployment protocol")
        operation = request.get("operation")
        actor = request.get("actor")
        fields = {
            "STATUS": set(),
            "CHECK_UPDATES": set(),
            "PREFLIGHT": {"revision"},
            "START_UPGRADE": {"revision", "requestId", "migrationApproval"},
            "JOB": {"jobId"},
            "EVENTS": {"jobId", "after"},
            "RECOVERY_OPTIONS": {"jobId"},
            "ROLLBACK": {"jobId", "confirmed"},
            "RECONCILE": {"jobId", "confirmed"},
        }
        if (
            operation not in fields
            or set(request) - {"protocol", "operation", "actor"} - fields[operation]
        ):
            raise ValueError("Invalid fixed operation payload")
        if not isinstance(actor, str) or not re.fullmatch(
            r"[A-Za-z0-9_-]{1,100}", actor
        ):
            raise ValueError("Authenticated administrator identity required")
        if (
            operation in ("JOB", "EVENTS", "RECOVERY_OPTIONS", "ROLLBACK", "RECONCILE")
            and "jobId" not in request
        ):
            raise ValueError("Deployment job identifier required")
        if "jobId" in request and (
            not isinstance(request["jobId"], str)
            or not re.fullmatch(r"[a-f0-9]{32}", request["jobId"])
        ):
            raise ValueError("Invalid job identifier")
        if operation not in ("STATUS", "JOB", "EVENTS"):
            self.store.rate_limit(actor, operation)
        if operation == "STATUS":
            return self.status()
        if operation == "JOB":
            return self.public_job(self.store.job(request.get("jobId")))
        if operation == "EVENTS":
            after = request.get("after", 0)
            if not isinstance(after, int) or isinstance(after, bool) or after < 0:
                raise ValueError("Invalid event cursor")
            return {"events": self.store.events(request.get("jobId"), after)}
        if operation == "RECOVERY_OPTIONS":
            return self.recovery_options(request.get("jobId"))
        if operation == "CHECK_UPDATES":
            return self.check_updates()
        if operation == "PREFLIGHT":
            with self.exclusive():
                return self.preflight(request.get("revision"))[0]
        if operation == "START_UPGRADE":
            if not isinstance(request.get("requestId"), str) or not re.fullmatch(
                r"[a-f0-9-]{32,36}", request["requestId"]
            ):
                raise ValueError("Invalid idempotency identifier")
            approval = request.get("migrationApproval")
            if approval is not None and (not isinstance(approval, str) or not re.fullmatch(r"[a-f0-9]{64}", approval)):
                raise ValueError("Invalid migration approval digest")
            return self.queue(request.get("revision"), actor, request["requestId"], approval)
        if operation in ("ROLLBACK", "RECONCILE"):
            self.ensure(
                request.get("confirmed") is True,
                "Explicit administrator confirmation required",
            )
            # Only enqueue recovery here; the independent worker executes it.
            job = self.store.job(request.get("jobId"))
            self.ensure(job["status"] == "RECOVERY_REQUIRED", "No recovery is pending")
            self.store.update(
                job["id"],
                data={
                    **job["data"],
                    "requestedRecovery": operation,
                    "recoveryActor": actor,
                },
            )
            self.store.event(
                job["id"],
                job["stage"],
                "Administrator requested " + operation,
                "WARNING",
            )
            return self.public_job(self.store.job(job["id"]))
        raise ValueError("Unknown operation")

    def worker_once(self):
        with self.operation_lock:
            job = self.store.active()
            if not job:
                self.retain()
                return
            if job["status"] == "QUEUED":
                self.deploy(job["id"])
            elif job["status"] == "RECOVERY_REQUIRED" and job["data"].get(
                "requestedRecovery"
            ):
                decision = job["data"]["requestedRecovery"]
                data = job["data"]
                data.pop("requestedRecovery")
                self.store.update(job["id"], data=data)
                try:
                    if decision == "ROLLBACK":
                        self.rollback(job["id"])
                    else:
                        # Reconciliation only verifies observed health. It does not replay builds,
                        # migrations or deployment, and cannot clear an unknown migration outcome.
                        self.ensure(
                            data.get("migrationStatus")
                            != "MAY_HAVE_PARTIALLY_COMMITTED",
                            "Migration outcome requires manual host investigation",
                        )
                        health = self.stabilize(job["revision"])
                        self.store.update(
                            job["id"],
                            status="COMPLETED",
                            stage="COMPLETED",
                            finished=now(),
                            data={
                                **data,
                                "health": health,
                                "result": "Administrator-requested health reconciliation",
                            },
                        )
                        self.store.meta(
                            "deployed",
                            {
                                "revision": job["revision"],
                                "deployedAt": now(),
                                "jobId": job["id"],
                            },
                        )
                except Exception as error:
                    self.store.event(
                        job["id"], job["stage"], self.redact(str(error)), "ERROR"
                    )
