import tempfile
import unittest
from pathlib import Path
from core import Store, now

class NotificationTests(unittest.TestCase):
    def test_durable_terminal_handoff(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory))
            job = store.claim('a' * 40, 'admin', 'b' * 32)
            id = job
            store.update(id, status='RUNNING', stage='BUILDING')
            self.assertEqual(store.notifications()['notifications'], [])
            store.update(id, status='FAILED', finished=now(), data={'failedStage': 'BUILDING'})
            events = store.notifications()['notifications']
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]['outcome'], 'FAILED')
            store.update(id, status='FAILED')
            restarted = Store(Path(directory))
            self.assertEqual(restarted.notifications()['notifications'], events)
            restarted.notifications([events[0]['id']])
            self.assertEqual(restarted.notifications()['notifications'], [])

    def test_success_and_interruption(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory))
            first = store.claim('a' * 40, 'admin', 'c' * 32)
            store.update(first, status='RUNNING', stage='BUILDING')
            store.interrupted()
            self.assertEqual(store.notifications()['notifications'], [], 'uncertain restart is not a confirmed failure')
            second = store.claim('a' * 40, 'admin', 'd' * 32)
            store.update(second, stage='COMPLETED', status='COMPLETED', finished=now())
            self.assertEqual(store.notifications()['notifications'][0]['outcome'], 'COMPLETED')
