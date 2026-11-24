#!/usr/bin/env python3
"""Codex Stop -> Android via KDE Connect. Only a fixed message crosses the LAN."""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

MESSAGE = "Codex: task finished"
ID_RE = re.compile(r"[A-Za-z0-9_-]{8,100}\Z")


def home_dir():
    return Path(os.environ.get("CODEX_HOME") or (Path.home() / ".codex")).expanduser()


def process_event(event, root=None, runner=subprocess.run):
    if not isinstance(event, dict) or event.get("hook_event_name") != "Stop":
        return "ignored"
    session, turn = event.get("session_id"), event.get("turn_id")
    if not (isinstance(session, str) and session and isinstance(turn, str) and turn):
        return "missing-id"
    state = Path(root if root is not None else home_dir()) / "kde-notify"
    try:
        device = (state / "device-id").read_text(encoding="utf-8").strip()
    except OSError:
        return "unconfigured"
    if not ID_RE.fullmatch(device):
        return "invalid-device"
    key = hashlib.sha256((session + "\0" + turn).encode("utf-8")).hexdigest()
    try:
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        with sqlite3.connect(state / "sent.sqlite3", timeout=10) as db:
            db.execute("CREATE TABLE IF NOT EXISTS sent (event_hash TEXT PRIMARY KEY, sent_at TEXT DEFAULT CURRENT_TIMESTAMP)")
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM sent WHERE event_hash = ?", (key,)).fetchone():
                return "duplicate"
            # Claim before sending: at-most-once, including failed/offline events.
            db.execute("INSERT INTO sent(event_hash) VALUES (?)", (key,))
            db.commit()
        reachable = runner(
            ["kdeconnect-cli", "--list-available", "--id-only"],
            capture_output=True, text=True, timeout=7, check=False)
        if reachable.returncode != 0 or device not in reachable.stdout.split():
            return "offline"
        result = runner(
            ["kdeconnect-cli", "--device", device, "--ping-msg", MESSAGE],
            capture_output=True, text=True, timeout=7, check=False)
        return "accepted" if result.returncode == 0 else "send-failed"
    except (OSError, sqlite3.Error, subprocess.TimeoutExpired):
        return "local-error"


def main():
    os.umask(0o077)
    try:
        event = json.load(sys.stdin)
    except (ValueError, UnicodeError):
        event = None
    # Never print or retain the incoming event.
    process_event(event)
    print("{}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
