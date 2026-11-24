'use strict';
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
async function run(command, args, timeout = 12000) {
  try {
    return await execFile(command, args, { encoding: 'utf8', timeout, maxBuffer: 80 * 1024, env: { ...process.env, LC_ALL: 'C' } });
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('Command not found: ' + command);
    if (err.killed || err.signal) throw new Error(command + ': timed out');
    throw new Error(command + ': command failed (' + (err.code ?? 'unknown') + ')');
  }
}
async function prerequisites(execute = run) {
  const result = { linux: process.platform === 'linux', python: false, kde: false };
  if (!result.linux) return result;
  await Promise.all([
    execute('python3', ['--version'], 5000).then(() => { result.python = true; }).catch(() => {}),
    execute('kdeconnect-cli', ['--version'], 8000).then(() => { result.kde = true; }).catch(() => {})
  ]);
  return result;
}
function parseIdName(output) {
  const map = new Map();
  for (const line of output.split(/\r?\n/)) {
    const matched = /^([A-Za-z0-9_-]{8,100})(?:\s+(.+))?$/.exec(line.trim());
    if (matched) map.set(matched[1], matched[2] || matched[1]);
  }
  return map;
}
function parseReachableAutocomplete(output) {
  const ids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]{8,100})\[/.exec(line.trim());
    if (m) ids.add(m[1]);
  }
  return ids;
}
// Invoke the daemon sequentially, rather than racing several clients during startup.
async function listDevices(execute = run) {
  const available = await execute('kdeconnect-cli', ['--list-available', '--id-name-only'], 5000);
  const all = await execute('kdeconnect-cli', ['--list-devices', '--id-name-only'], 5000);
  const completion = await execute('kdeconnect-cli', ['--shell-device-autocompletion'], 3000)
    .then(x => x.stdout).catch(() => '');
  const known = parseIdName(all.stdout), pairedOnline = parseIdName(available.stdout);
  const reachable = parseReachableAutocomplete(completion);
  for (const id of pairedOnline.keys()) reachable.add(id);
  const combined = new Map();
  for (const [id, name] of known) combined.set(id, { id, name, paired: pairedOnline.has(id), online: reachable.has(id) });
  for (const [id, name] of pairedOnline) combined.set(id, { id, name, paired: true, online: true });
  const weight = d => d.paired && d.online ? 0 : d.online ? 1 : 2;
  return [...combined.values()].sort((a, b) => weight(a) - weight(b) || a.name.localeCompare(b.name));
}
async function devices({ target = '', discover = false, execute = run, sleep = delay } = {}) {
  // Refresh is best-effort: some KDE Connect versions differ in refresh behavior.
  if (discover) await execute('kdeconnect-cli', ['--refresh'], 5000).catch(() => {});
  const attempts = discover ? 3 : 1;
  let last = [], lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      last = await listDevices(execute);
      lastError = undefined;
      if (target ? last.some(d => d.id === target && d.paired && d.online) : last.some(d => d.online)) return last;
    } catch (err) { lastError = err; }
    if (attempt + 1 < attempts) await sleep(900);
  }
  if (lastError) throw lastError;
  return last;
}
async function testPing(id, { execute = run, sleep = delay } = {}) {
  if (!ID_PATTERN.test(id)) throw new Error('Select a valid Android device first.');
  const found = await devices({ target: id, discover: true, execute, sleep });
  if (!found.some(d => d.id === id && d.paired && d.online)) {
    throw new Error('Phone not paired or reachable. Open KDE Connect on Android, check Wi-Fi, and try again.');
  }
  // Never retry a ping after an ambiguous send result; that could duplicate it.
  await execute('kdeconnect-cli', ['--device', id, '--ping-msg', 'Codex: test notification'], 12000);
}
async function installCommand() {
  if (process.platform !== 'linux') return null;
  let props = {};
  try {
    const content = await fs.readFile('/etc/os-release', 'utf8');
    for (const line of content.split('\n')) {
      const m = /^(ID|ID_LIKE)=(.*)$/.exec(line);
      if (m) props[m[1]] = m[2].replace(/^['"]|['"]$/g, '').toLowerCase();
    }
  } catch (_) { return null; }
  const ids = [props.ID, ...(props.ID_LIKE || '').split(/\s+/)].filter(Boolean);
  if (ids.some(id => ['ubuntu', 'debian', 'linuxmint', 'pop', 'elementary'].includes(id))) return {label:'APT',command:'sudo apt install kdeconnect python3'};
  if (ids.some(id => ['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(id))) return {label:'DNF',command:'sudo dnf install kde-connect python3'};
  if (ids.some(id => ['arch', 'manjaro', 'endeavouros'].includes(id))) return {label:'pacman',command:'sudo pacman -S kdeconnect python'};
  if (ids.some(id => ['opensuse', 'opensuse-tumbleweed', 'opensuse-leap', 'suse'].includes(id))) return {label:'zypper',command:'sudo zypper install kdeconnect-kde python3'};
  return null;
}
module.exports = { run, prerequisites, devices, listDevices, testPing, parseIdName, parseReachableAutocomplete, installCommand, ID_PATTERN };
