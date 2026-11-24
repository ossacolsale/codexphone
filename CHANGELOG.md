# Changelog

## 0.3.0 (local beta)

- English UI, command labels, notification text and documentation.
- Explicit KDE Connect discovery and bounded readiness polling before test pings.
- Serialized dashboard operations with visible busy state; no waiting indefinitely
  for the setup success toast to be dismissed.
- Refresh handshake when the webview loads; fresh availability check before sending.
- Stable hook and helper paths, persistent deduplication and explicit helper updates.
- Official VSCE packaging, repository metadata and automated regression tests.
- Removed prototype cleanup and custom VSIX builder scripts.

## 0.2.1

- Initial locally tested Linux/Android dashboard, device pairing and official
  Codex Stop hook integration.
