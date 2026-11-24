# Changelog

## 0.3.2 (release candidate)

- Remove the owned Codex Stop hook automatically on complete extension uninstall, preserving other hooks and backing up hooks.json.
- Keep local device settings and deduplication state for optional reuse.
- Add uninstall regression tests.
- Stop storing temporary CI VSIX artifacts; prepare manual OIDC Marketplace publishing.

## 0.3.1 (release candidate)

- Restore the original 128 × 128 PNG icon in the extension gallery, README and dashboard header.
- Keep the Activity Bar icon monochrome and theme-compatible.
- Load the dashboard logo only from bundled local resources.
- Restore the refresh command's toolbar icon.

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
