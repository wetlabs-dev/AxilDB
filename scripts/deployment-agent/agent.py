#!/usr/bin/env python3
"""Private authenticated Unix HTTP transport. Never listens on a TCP port."""
import argparse
import hashlib
import hmac
import http.client
import socket
import uuid
import fcntl
from http.server import BaseHTTPRequestHandler
import json
import os
from pathlib import Path
import signal
import socketserver
import threading
import time
from core import Agent, Config, PROTOCOL, now


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    request_queue_size = 16


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, *args):
        pass

    def address_string(self):
        return "local"

    def do_POST(self):
        code = 200
        try:
            if self.path != "/v1/operations":
                raise ValueError("Unknown deployment protocol route")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 8192:
                raise ValueError("Invalid payload size")
            self.connection.settimeout(10)
            body = self.rfile.read(size)
            self.server.agent.authenticate(body, self.headers)
            value = self.server.agent.dispatch(json.loads(body))
        except PermissionError:
            code = 403
            value = {"error": "Agent authentication failed"}
        except (ValueError, RuntimeError, TimeoutError) as error:
            code = 409
            value = {"error": self.server.agent.redact(str(error))}
        except Exception:
            code = 503
            value = {
                "error": "Deployment agent could not complete this operation. Inspect the host service journal."
            }
        payload = json.dumps(
            {"protocol": PROTOCOL, "data": value} if code == 200 else value
        ).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/etc/axildb-deploy/config.json")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--resolve-job")
    parser.add_argument("--acknowledge-manual-migration-review", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    if not args.validate and Path(args.config).stat().st_mode & 0o027:
        raise ValueError(
            "Agent configuration must not be world-accessible or group-writable"
        )
    config = Config(json.loads(Path(args.config).read_text()))
    if args.validate:
        print(
            "Configuration structure is valid. Host access and preflight must still be verified."
        )
        return
    if args.probe:
        for attempt in range(10):
            try:
                body = json.dumps(
                    {
                        "protocol": PROTOCOL,
                        "operation": "STATUS",
                        "actor": "host-bootstrap",
                    }
                ).encode()
                timestamp = str(int(time.time()))
                nonce = uuid.uuid4().hex
                signature = hmac.new(
                    config.secret_file.read_text().strip().encode(),
                    timestamp.encode() + b"\n" + nonce.encode() + b"\n" + body,
                    hashlib.sha256,
                ).hexdigest()
                conn = http.client.HTTPConnection("local", timeout=45)
                conn.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                conn.sock.settimeout(45)
                conn.sock.connect(str(config.socket))
                conn.request(
                    "POST",
                    "/v1/operations",
                    body,
                    {
                        "X-AxilDB-Time": timestamp,
                        "X-AxilDB-Nonce": nonce,
                        "X-AxilDB-Signature": signature,
                    },
                )
                response = conn.getresponse()
                value = json.loads(response.read())
                conn.close()
                if response.status != 200 or value.get("protocol") != PROTOCOL:
                    raise RuntimeError("Agent authentication or protocol probe failed")
                print(
                    "Authenticated host agent reachable. Application readiness: "
                    + value["data"]["health"]["status"]
                )
                return
            except (OSError, ConnectionError):
                if attempt == 9:
                    raise
                time.sleep(1)
    config.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = (config.state_dir / "agent.lock").open("a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    agent = Agent(config)
    if args.resolve_job:
        if not args.acknowledge_manual_migration_review:
            raise ValueError(
                "Explicit host acknowledgement of manual schema review is required"
            )
        job = agent.store.job(args.resolve_job)
        if job["status"] != "RECOVERY_REQUIRED":
            raise ValueError("Job is not awaiting recovery")
        revision, _ = agent.installation()
        if revision not in (job["revision"], job["previous"]):
            raise ValueError(
                "Running revision does not match either recorded deployment"
            )
        health = agent.stabilize(revision)
        agent.store.update(
            job["id"],
            status="COMPLETED" if revision == job["revision"] else "RECOVERED",
            finished=now(),
            data={
                **job["data"],
                "health": health,
                "recoveryResult": "Host operator acknowledged manual schema review and verified the running application",
            },
        )
        agent.store.event(
            job["id"],
            job["stage"],
            "Host operator reconciled recovery after explicit schema review",
            "WARNING",
        )
        agent.store.meta(
            "deployed", {"revision": revision, "deployedAt": now(), "jobId": job["id"]}
        )
        print(
            "Verified recovery recorded. No database or deployment command was executed."
        )
        return
    config.socket.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    if config.socket.exists():
        config.socket.unlink()
    server = Server(str(config.socket), Handler)
    server.agent = agent
    os.chmod(config.socket, 0o660)
    stopped = threading.Event()

    def worker():
        while not stopped.is_set():
            try:
                agent.worker_once()
            except Exception as error:
                print("Agent worker error: " + agent.redact(str(error)), flush=True)
            stopped.wait(1)

    threading.Thread(target=worker, daemon=True).start()

    def shutdown(*_):
        stopped.set()
        # Service restart records in-flight work for reconciliation; never retries migrations.
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        stopped.set()
        server.server_close()


if __name__ == "__main__":
    main()
