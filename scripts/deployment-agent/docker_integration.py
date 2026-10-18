"""Opt-in isolated Docker exercise. Never addresses an existing Compose project.
Uses a tiny readiness app to verify the real agent's Git/build/backup/migrate/up/
health lifecycle over real PostgreSQL and persistent files, without external AI.
"""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from core import Agent, Config

ROOT = Path(__file__).resolve().parents[2]


class DesktopFixtureAgent(Agent):
    def docker_storage(self):
        # Docker Desktop stores /var/lib/docker in a VM, inaccessible to host statvfs.
        # Production Ubuntu uses the unmodified native-host disk preflight.
        self.ensure(
            shutil.disk_usage(self.c.state_dir).free >= self.c.minimum_free_bytes,
            "Fixture disk reserve",
        )


def main():
    with tempfile.TemporaryDirectory(
        prefix="axildb-upgrade-docker-", dir="/tmp"
    ) as temporary:
        root = Path(temporary)
        repo = root / "repo"
        repo.mkdir()
        project = "axildb-upgrade-test-" + uuid.uuid4().hex[:8]

        def command(args, **kw):
            result = subprocess.run(
                args, check=True, text=True, capture_output=True, **kw
            )
            return result.stdout.strip()

        def git(*args):
            return command(["git", "-C", str(repo), *args])

        compose = [
            "docker",
            "compose",
            "--project-name",
            project,
            "--project-directory",
            str(repo),
            "-f",
            str(repo / "docker-compose.yml"),
            "--env-file",
            str(repo / ".env"),
        ]
        try:
            (repo / ".env").write_text("FIXTURE=yes\n")
            (repo / ".gitignore").write_text(
                ".env\nbackups/\npublic/uploads/\npublic/labels/\n"
            )
            (repo / ".dockerignore").write_text(
                ".env\n.git\nbackups\npublic/uploads\npublic/labels\n"
            )
            (repo / "Dockerfile").write_text(
                """FROM axildb-migrate:latest AS builder
WORKDIR /app
RUN apk add --no-cache python3 postgresql-client openssl
COPY . /app/
ARG GIT_COMMIT
RUN printf '%s\\n' "$GIT_COMMIT" > /app/REVISION
FROM builder AS runner
CMD ["node", "fixture-server.cjs"]
"""
            )
            (repo / "fixture-server.cjs").write_text(
                """const http=require('http'),fs=require('fs'),cp=require('child_process');http.createServer((req,res)=>{try{if(fs.existsSync('/app/health-failure.flag'))throw Error('deliberate fixture health failure');const u=new URL(process.env.DATABASE_URL);u.search='';cp.execFileSync('psql',['-tAc','SELECT 1'],{env:{...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1))},stdio:'pipe',timeout:2000});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({status:'ready',revision:fs.readFileSync('/app/REVISION','utf8').trim()}))}catch(error){console.error(error.message);res.writeHead(503);res.end('{}')}}).listen(3000,'0.0.0.0');"""
            )
            shutil.copytree(
                ROOT / "prisma",
                repo / "prisma",
                ignore=shutil.ignore_patterns("*.db", "*.db-*"),
            )
            (repo / "scripts/migration").mkdir(parents=True)
            for file in ("backup.sh", "deploy-migrations.sh"):
                shutil.copyfile(ROOT / "scripts" / file, repo / "scripts" / file)
            for file in ("routine.py", "engine.py"):
                shutil.copyfile(
                    ROOT / "scripts/migration" / file, repo / "scripts/migration" / file
                )
            shutil.copyfile(
                ROOT / "deployment-protocol.json", repo / "deployment-protocol.json"
            )
            for directory in ("backups", "public/uploads", "public/labels"):
                (repo / directory).mkdir(parents=True, exist_ok=True)
            (repo / "public/uploads/preserve.jpg").write_bytes(
                b"fixture photograph bytes"
            )
            (repo / "public/labels/preserve.txt").write_bytes(b"fixture label bytes")
            shared = {
                "environment": {
                    "PORT": "3000",
                    "DATABASE_URL": "postgresql://fixture:fixture_password@db:5432/axildb?schema=public",
                },
                "volumes": [
                    str(repo / "backups") + ":/app/backups",
                    str(repo / "public/uploads") + ":/app/public/uploads",
                    str(repo / "public/labels") + ":/app/public/labels",
                ],
            }
            services = {
                "db": {
                    "image": "postgres:16-alpine",
                    "environment": {
                        "POSTGRES_USER": "fixture",
                        "POSTGRES_PASSWORD": "fixture_password",
                        "POSTGRES_DB": "axildb",
                    },
                    "ports": ["127.0.0.1:0:5432"],
                    "volumes": ["pgdata:/var/lib/postgresql/data"],
                    "healthcheck": {
                        "test": ["CMD", "pg_isready", "-U", "fixture", "-d", "axildb"],
                        "interval": "1s",
                        "timeout": "3s",
                        "retries": 30,
                    },
                },
                "app": {
                    **shared,
                    "build": {"context": str(repo), "target": "runner"},
                    "depends_on": {"db": {"condition": "service_healthy"}},
                },
                "migrate": {
                    **shared,
                    "build": {"context": str(repo), "target": "builder"},
                    "command": ["sh", "scripts/deploy-migrations.sh"],
                },
                "backups": {
                    **shared,
                    "build": {"context": str(repo), "target": "builder"},
                    "command": ["node", "-e", "setInterval(()=>{},1000)"],
                },
                "events": {
                    **shared,
                    "build": {"context": str(repo), "target": "builder"},
                    "command": ["node", "-e", "setInterval(()=>{},1000)"],
                },
                # Proxy fixture uses cached Caddy and a private ephemeral host port.
                "proxy": {
                    "image": "caddy:2.8-alpine",
                    "ports": ["127.0.0.1:0:80"],
                    "command": [
                        "caddy",
                        "reverse-proxy",
                        "--from",
                        ":80",
                        "--to",
                        "app:3000",
                    ],
                },
            }
            (repo / "docker-compose.yml").write_text(
                json.dumps({"services": services, "volumes": {"pgdata": {}}})
            )
            git("init", "-b", "main")
            git("config", "user.email", "fixture@example.invalid")
            git("config", "user.name", "Fixture")
            git("add", ".")
            git("commit", "-m", "fixture baseline")
            old = git("rev-parse", "HEAD")
            remote = root / "remote.git"
            command(["git", "clone", "--bare", str(repo), str(remote)])
            git("remote", "add", "origin", str(remote))
            command(
                [
                    *compose,
                    "build",
                    "--build-arg",
                    "GIT_COMMIT=" + old,
                    "app",
                    "migrate",
                    "backups",
                    "events",
                ]
            )
            command([*compose, "up", "-d", "--wait", "db"])
            command([*compose, "run", "--rm", "--no-deps", "migrate"])
            command(
                [*compose, "up", "-d", "--no-deps", "app", "backups", "events", "proxy"]
            )
            database_port = command([*compose, "port", "db", "5432"]).split(":")[-1]
            url = (
                "postgresql://fixture:fixture_password@localhost:"
                + database_port
                + "/axildb"
            )
            seed = """const {PrismaClient}=require('@prisma/client');const d=new PrismaClient();(async()=>{const c=await d.collection.create({data:{name:'Preserve upgrade fixture',slug:'upgrade-fixture'}});const p=await d.plantDefinition.create({data:{collectionId:c.id,genus:'Hoya'}});const i=await d.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:p.id,plantId:'PRESERVE',instanceType:'ACQUIRED'}});await d.plantCareEvent.create({data:{collectionId:c.id,plantInstanceId:i.id,eventType:'WATERED',performedAt:new Date()}});await d.fertilizerRecipe.create({data:{collectionId:c.id,name:'Preserve recipe'}});await d.aiCuratorSuggestion.create({data:{collectionId:c.id,plantDefinitionId:p.id,phase:'ENRICHMENT',suggestionType:'TEST',title:'Preserve research',suggestedValue:{fixture:true},reasoning:'Preserve'}});await d.propagationEvent.create({data:{collectionId:c.id,method:'CUTTING',date:new Date()}});await d.photo.create({data:{collectionId:c.id,entityType:'PLANT_INSTANCE',entityId:i.id,filename:'preserve.jpg',path:'/uploads/preserve.jpg'}});})().finally(()=>d.$disconnect())"""
            command(
                ["node", "-e", seed], cwd=ROOT, env={**os.environ, "DATABASE_URL": url}
            )
            fingerprint_sql = 'SELECT (SELECT count(*) FROM "PlantDefinition"),(SELECT count(*) FROM "PlantInstance"),(SELECT count(*) FROM "PlantCareEvent"),(SELECT count(*) FROM "FertilizerRecipe"),(SELECT count(*) FROM "AiCuratorSuggestion"),(SELECT count(*) FROM "Photo"),(SELECT count(*) FROM "PropagationEvent")'

            def counts():
                return command(
                    [
                        *compose,
                        "exec",
                        "-T",
                        "db",
                        "psql",
                        "-U",
                        "fixture",
                        "-d",
                        "axildb",
                        "-tAc",
                        fingerprint_sql,
                    ]
                )

            before = counts()
            db_id = command([*compose, "ps", "-q", "db"])
            proxy_id = command([*compose, "ps", "-q", "proxy"])
            key = root / "key"
            key.write_text("ab" * 32)
            key.chmod(0o600)
            proxy_port = command([*compose, "port", "proxy", "80"]).split(":")[-1]
            config = Config(
                {
                    "repository": str(repo),
                    "trusted_remote": str(remote),
                    "remote": "origin",
                    "branch": "main",
                    "project": project,
                    "compose_files": [str(repo / "docker-compose.yml")],
                    "env_file": str(repo / ".env"),
                    "state_dir": str(root / "state"),
                    "socket": str(root / "agent.sock"),
                    "secret_file": str(key),
                    "backup_dir": str(repo / "backups"),
                    "app_service": "app",
                    "worker_services": ["backups", "events"],
                    "migration_service": "migrate",
                    "database_service": "db",
                    "backup_service": "backups",
                    "proxy_health_url": "http://127.0.0.1:"
                    + proxy_port
                    + "/api/health/ready",
                    "minimum_free_bytes": 1024**3,
                    "health_timeout_seconds": 12,
                    "stabilization_seconds": 2,
                }
            )
            agent = (
                DesktopFixtureAgent(config)
                if os.uname().sysname == "Darwin"
                else Agent(config)
            )
            # New safe migration exercises the actual supported Prisma production command.
            migration = repo / "prisma/migrations/20261019000000_deployment_fixture"
            migration.mkdir()
            (migration / "migration.sql").write_text(
                'CREATE TABLE "DeploymentFixture" (id TEXT PRIMARY KEY);'
            )
            (repo / "fixture-release.txt").write_text("approved new code")
            git("add", ".")
            git("commit", "-m", "fixture upgrade")
            git("push", "origin", "main")
            target = git("rev-parse", "HEAD")
            check = agent.check_updates()
            assert check["revision"] == target
            report, _ = agent.preflight(target)
            assert report["ready"], report
            id = agent.queue(target, "fixture-admin", uuid.uuid4().hex)["id"]
            thread = threading.Thread(target=agent.worker_once)
            thread.start()
            # Simulate closing the initiating browser: no client is needed for execution.
            thread.join(timeout=600)
            assert not thread.is_alive(), "Fixture deployment exceeded its bound"
            job = agent.store.job(id)
            assert job["status"] == "COMPLETED", job
            assert agent.installation()[0] == target
            assert counts() == before == "1|1|1|1|1|1|1", counts()
            assert command([*compose, "ps", "-q", "db"]) == db_id
            assert command([*compose, "ps", "-q", "proxy"]) == proxy_id
            assert (
                repo / "public/uploads/preserve.jpg"
            ).read_bytes() == b"fixture photograph bytes"
            assert (
                repo / "public/labels/preserve.txt"
            ).read_bytes() == b"fixture label bytes"
            assert (
                repo / "backups" / job["data"]["backup"] / "axildb.dump"
            ).stat().st_size > 0
            # A later application-only upgrade deliberately fails readiness. Prove
            # explicit recovery uses the captured previous images without schema changes.
            (repo / "health-failure.flag").write_text("deliberate failure")
            git("add", ".")
            git("commit", "-m", "fixture unhealthy upgrade")
            git("push", "origin", "main")
            unhealthy = git("rev-parse", "HEAD")
            agent.check_updates()
            second = agent.queue(unhealthy, "fixture-admin", uuid.uuid4().hex)["id"]
            agent.worker_once()
            assert agent.store.job(second)["status"] == "RECOVERY_REQUIRED"
            assert agent.recovery_options(second)[
                "applicationRollback"
            ], agent.recovery_options(second)
            agent.dispatch(
                {
                    "protocol": 1,
                    "operation": "ROLLBACK",
                    "actor": "fixture-admin",
                    "jobId": second,
                    "confirmed": True,
                }
            )
            agent.worker_once()
            assert agent.store.job(second)["status"] == "RECOVERED", agent.store.job(
                second
            )
            assert agent.installation()[0] == target
            assert counts() == before
            assert command([*compose, "ps", "-q", "db"]) == db_id
            assert command([*compose, "ps", "-q", "proxy"]) == proxy_id
            restarted = (
                DesktopFixtureAgent(config)
                if os.uname().sysname == "Darwin"
                else Agent(config)
            )
            assert restarted.store.job(id)["status"] == "COMPLETED"
            assert restarted.store.events(id, 0)
            assert not restarted.recovery_options(id)[
                "applicationRollback"
            ], "Schema-changing deployment must never offer automatic app rollback"
            print(
                "Real isolated Docker deployment passed: exact image revision, verified backup, production Prisma migration command, application replacement, host-local proxy/database stabilization, explicit schema-compatible app-only recovery, durable history and all seven data categories/files preserved. Database and proxy containers were not recreated."
            )
        except BaseException as error:
            print(
                subprocess.run(
                    [*compose, "logs", "--tail", "12", "app", "proxy"],
                    capture_output=True,
                    text=True,
                ).stdout[-4000:]
            )
            if not isinstance(error, subprocess.CalledProcessError):
                raise
            print((error.stdout or "")[-3000:])
            print((error.stderr or "")[-3000:])
            raise
        finally:
            # Targeted test-only cleanup. No volumes are removed by the agent itself.
            subprocess.run([*compose, "down", "--remove-orphans"], capture_output=True)
            volumes = subprocess.run(
                [
                    "docker",
                    "volume",
                    "ls",
                    "--filter",
                    "label=com.docker.compose.project=" + project,
                    "--format",
                    "{{.Name}}",
                ],
                capture_output=True,
                text=True,
            ).stdout.split()
            for volume in volumes:
                subprocess.run(["docker", "volume", "rm", volume], capture_output=True)


if __name__ == "__main__":
    main()
