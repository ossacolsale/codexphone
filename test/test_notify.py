import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
from subprocess import CompletedProcess

spec = importlib.util.spec_from_file_location("notify", Path(__file__).resolve().parents[1] / "python" / "notify_android.py")
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)

class NotifyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / "kde-notify"
        self.state.mkdir()
        self.id = "abcdef1234567890"
        (self.state / "device-id").write_text(self.id)
        self.calls = []
        self.online = True
        self.event = {"hook_event_name": "Stop", "session_id": "session", "turn_id": "turn", "last_assistant_message": "SECRET"}
    def run_cli(self, args, **kwargs):
        self.calls.append(args)
        return CompletedProcess(args, 0, self.id if "--list-available" in args and self.online else "", "")
    def send(self, event=None):
        return notify.process_event(self.event if event is None else event, self.root, self.run_cli)
    def test_duplicate_and_privacy(self):
        self.assertEqual(self.send(), "accepted")
        self.assertEqual(self.send(), "duplicate")
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(self.calls[1][-1], "Codex: task finished")
        self.assertNotIn("SECRET", str(self.calls))
        with sqlite3.connect(self.state / "sent.sqlite3") as db:
            hashes = db.execute("SELECT event_hash FROM sent").fetchall()
        self.assertEqual(len(hashes), 1)
        self.assertEqual(len(hashes[0][0]), 64)
    def test_offline_no_replay(self):
        self.online = False
        self.assertEqual(self.send(), "offline")
        self.online = True
        self.assertEqual(self.send(), "duplicate")
        self.assertEqual(len(self.calls), 1)
    def test_missing_id(self):
        self.assertEqual(self.send({"hook_event_name": "Stop"}), "missing-id")
        self.assertEqual(self.calls, [])
    def test_unrelated_event(self):
        self.assertEqual(self.send({"hook_event_name": "SessionStart"}), "ignored")
        self.assertEqual(self.calls, [])
