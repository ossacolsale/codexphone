'use strict';
// VS Code executes this Node script after the extension is completely uninstalled.
// No vscode API, network access, external dependencies or shell commands.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { uninstall } = require('./hookConfig');

async function readRegular(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile()) throw new Error('Refusing to modify a non-regular file: ' + file);
    return await fs.readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function cleanup(home) {
  const root = path.resolve(home);
  const state = path.join(root, 'kde-notify');
  const file = path.join(root, 'hooks.json');
  const runner = path.join(state, 'runner.py');
  const raw = await readRegular(file);
  if (!raw) return { removed: 0 };
  const before = JSON.parse(raw.toString('utf8'));
  const next = uninstall(before, runner);
  if (!next.removed) return { removed: 0 };

  const suffix = new Date().toISOString().replace(/[:.]/g, '-') + '.' + crypto.randomBytes(6).toString('hex');
  const backup = file + '.codex-phone.uninstall.' + suffix + '.bak';
  const tmp = file + '.codex-phone.' + suffix + '.tmp';
  const unchanged = async () => {
    const current = await readRegular(file);
    return current !== null && current.equals(raw);
  };
  if (!await unchanged()) throw new Error('hooks.json changed during uninstall; no changes made.');
  await fs.writeFile(backup, raw, { flag: 'wx', mode: 0o600 });
  try {
    await fs.writeFile(tmp, JSON.stringify(next.config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (!await unchanged()) throw new Error('hooks.json changed during uninstall; backup retained.');
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
  // Keep user state and the inert helper for a possible reinstall. Do not modify
  // any other hook, application configuration or device pairing.
  return { removed: next.removed, backup };
}

if (require.main === module) {
  if (process.platform === 'linux') {
    cleanup(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'))
      .then(result => console.log('Codex Phone: removed ' + result.removed + ' notification hook(s).'))
      .catch(error => { console.error('Codex Phone uninstall: ' + error.message); process.exitCode = 1; });
  }
}
module.exports = { cleanup };
