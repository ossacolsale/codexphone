# Codex Phone

Private Android notifications when Codex finishes a turn in VS Code. Linux desktop,
KDE Connect, no additional cloud service, no telemetry, and no conversation
contents sent to your phone. Independent project, not affiliated with OpenAI or KDE.

**0.3.0 is a local beta.** The previous version was tested with real Android
hardware; this release needs a fresh installation test before Marketplace publication.

## Requirements

- Desktop Linux, VS Code 1.90 or later and the official Codex extension with hooks support.
- Python 3 and KDE Connect CLI on the same machine as Codex.
- KDE Connect on Android, notification permission and the Ping plugin enabled.
- Both devices on a reachable local network. Guest Wi-Fi/client isolation can prevent discovery.

The dashboard can offer an installation command for Debian/Ubuntu, Fedora, Arch
and openSUSE. It runs in an integrated terminal only after explicit confirmation.
You may install manually instead:

| Distribution | Command |
| --- | --- |
| Debian / Ubuntu | `sudo apt install kdeconnect python3` |
| Fedora | `sudo dnf install kde-connect python3` |
| Arch | `sudo pacman -S kdeconnect python` |
| openSUSE | `sudo zypper install kdeconnect-kde python3` |

Android: [KDE Connect on F-Droid](https://f-droid.org/packages/org.kde.kdeconnect_tp/).
No Node.js or npm is required by end users.

## Build and install locally

Use Node.js 22 LTS or a newer supported LTS, npm, Python 3 and Git:

```sh
git clone https://github.com/ossacolsale/codexphone.git
cd codexphone
npm install
npm test
npm run package:vsix
code --install-extension ./codex-kde-connect-notify-0.3.0.vsix
```

Alternatively install the VSIX from Extensions > ... > Install from VSIX.
The publisher ID remains `local-preview` for compatibility with the beta.
It must be changed to a registered Marketplace publisher before public release.
A DEP0169 warning from the VS Code CLI may be unrelated to this extension;
this extension does not call url.parse and has no runtime npm dependencies.

## First setup

1. Open **Codex Phone** in the Activity Bar.
2. Check dependencies and open KDE Connect on the phone. Click **Refresh** if needed.
3. Pair the phone if necessary (accept the request on Android).
4. Click **Use device**, then confirm the installation of the bundled helper and Stop hook.
5. Click **Send test notification**. KDE Connect acceptance is not an Android delivery receipt.
6. Approve the Stop hook in Codex (Hooks settings or /hooks where available)
   and start a new Codex session. A registered hook is not necessarily an approved hook.
7. Complete a short Codex turn and check the phone.

If you update from 0.2.1, use **Update helper** on the selected phone to install
the new bundled helper, preserving your selection and deduplication database.
No previous standalone script is required. If an exact legacy standalone hook
is detected, the extension offers to replace it after explicit consent.

## Clean uninstall / testing from scratch

Before uninstalling the VS Code extension, open its panel and click
**Disable Codex notifications**. This removes only the owned Stop handler and
backs up hooks.json. Restart Codex sessions so they reload the configuration.
Uninstall the extension using the Extensions view or:

```sh
code --uninstall-extension local-preview.codex-kde-connect-notify
```

To test with no selection or stored state, after disabling the hook and closing
all Codex sessions and VS Code windows, move the state directory to a backup:

```sh
codex_home="${CODEX_HOME:-$HOME/.codex}"
if [ -d "$codex_home/kde-notify" ]; then
  mv -- "$codex_home/kde-notify" "$codex_home/kde-notify.backup.$(date +%Y%m%d-%H%M%S)"
fi
```

Never delete the entire Codex directory or hooks.json. Pairing in KDE Connect
and other Codex hooks remain untouched. Do not restore old hooks or state while
the new installation is active. Uninstalling the VSIX alone does not remove the
external hook, because the helper intentionally has a stable path.

## Privacy and reliability

- The helper consumes Codex's hook event locally and uses only
  hook_event_name, session_id and turn_id. It never logs, stores or forwards
  prompts, answers, source code or project names.
- KDE Connect receives only the fixed text "Codex: task finished" or
  "Codex: test notification". KDE Connect handles encrypted communication
  with paired devices; no cloud relay is added by this extension.
- The extension writes `$CODEX_HOME/kde-notify/runner.py`, `device-id` and
  `sent.sqlite3` (default home: ~/.codex). The database stores SHA-256 event
  hashes and timestamps. Device selection remains local.
- The helper claims each event before attempting delivery. This is at-most-once:
  offline or failed notifications are not replayed after reconnecting.
- Test pings check readiness before making one send attempt. They may be repeated manually.
- A Stop event signals a turn ending, not necessarily successful work.
  Other Stop hooks may request continuation, so notifications can precede
  the ultimate completion. The dashboard warns if other Stop hooks are present.
- The extension does not verify Codex hook approval. Remote SSH, containers,
  WSL and other remote extension hosts are not supported in this release.
- Dependency installation and explicit documentation links may access the network;
  notification handling itself does not use HTTP or remote APIs.

## Troubleshooting

Use **Show diagnostics** in the dashboard. If devices are absent, open KDE Connect
on Android, verify the Wi-Fi network and firewall, and refresh. Check that Android
allows KDE Connect notifications and background activity. If manual test pings
arrive but Codex notifications do not, check approval of the Stop hook and start
a new Codex session. If the first test does not arrive even though KDE Connect
accepted it, retry manually and check Android's Ping plugin.

## Development

`npm test` runs Node and Python unit tests without using real devices.
`npm run package:vsix` uses official VSCE. No custom packaging script is needed.
Do not publish until a clean install and first-ping test pass on real hardware.
The project is MIT licensed.
