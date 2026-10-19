"""Test-only private agent fixture. Does not execute Docker commands."""

import argparse
import os
from pathlib import Path
import signal
import threading
import time
from agent import Server, Handler
from core import Config
from test_agent import Tests, FixtureAgent

parser = argparse.ArgumentParser()
parser.add_argument("--directory", required=True)
args = parser.parse_args()
directory = Path(args.directory)
directory.mkdir(mode=0o700)
fixture = Tests("test_private_socket_protocol")
fixture.setUp()
if os.environ.get('AXILDB_TEST_MIGRATION_REVIEW') == '1':
    fixture.add_migration('ALTER TABLE example DROP CONSTRAINT old_rule;')
key = directory / "agent.key"
key.write_text("ab" * 32)
key.chmod(0o600)


class SlowAgent(FixtureAgent):
    def run(self, args, **kwargs):
        if args[0] == "docker" and "build" in args:
            self.event("Fixture build in progress")
            time.sleep(5)
        return super().run(args, **kwargs)


raw = {**fixture.raw, "socket": str(directory / "agent.sock"), "secret_file": str(key)}
agent = SlowAgent(Config(raw), fixture.old)
server = Server(str(directory / "agent.sock"), Handler)
server.agent = agent
stop = threading.Event()


def worker():
    while not stop.is_set():
        agent.worker_once()
        stop.wait(0.2)


threading.Thread(target=worker, daemon=True).start()


def shutdown(*_):
    raise SystemExit()


signal.signal(signal.SIGTERM, shutdown)
try:
    server.serve_forever()
finally:
    stop.set()
    server.server_close()
    fixture.tearDown()
