"""Connection lifetime must not depend on cyclic GC scheduling."""
import gc
import sqlite3
import tempfile
import unittest
from pathlib import Path
from core import Store

class ConnectionLifetime(unittest.TestCase):
    def test_connections_close_before_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory))
            gc.collect()
            gc.disable()
            try:
                for _ in range(1000):
                    store.meta("missing")
                connections = [obj for obj in gc.get_objects() if isinstance(obj, sqlite3.Connection)]
                for connection in connections:
                    with self.assertRaises(sqlite3.ProgrammingError):
                        connection.execute("SELECT 1")
            finally:
                gc.enable()
                gc.collect()

    def test_connection_closes_on_error(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory))
            with self.assertRaises(ValueError):
                with store.connect() as connection:
                    connection.execute("INSERT INTO metadata VALUES ('rolled-back', '1')")
                    raise ValueError("test failure")
            self.assertIsNone(store.meta("rolled-back"))
            with self.assertRaises(sqlite3.ProgrammingError):
                connection.execute("SELECT 1")
