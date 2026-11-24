'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cleanup } = require('../src/uninstall');
const { handlerCommand } = require('../src/hookConfig');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-phone-uninstall-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'hooks.json');
  const state = path.join(root, 'kde-notify');
  const runner = path.join(state, 'runner.py');
  const own = { type: 'command', command: handlerCommand(runner) };
  await fs.mkdir(state);
  await fs.writeFile(path.join(state, 'device-id'), 'abcdef1234567890');
  return { root, file, state, runner, own };
}
test('uninstall removes only the owned Stop command and backs up original bytes', async t => {
  const f = await fixture(t);
  const other = { type: 'command', command: 'other-tool' };
  const original = { hooks: { Stop: [{ matcher: 'x', hooks: [f.own, other] }, { hooks: [f.own] }], SessionStart: [{ hooks: [other] }] }, custom: true };
  const bytes = JSON.stringify(original);
  await fs.writeFile(f.file, bytes);
  const result = await cleanup(f.root);
  assert.equal(result.removed, 2);
  assert.equal(await fs.readFile(result.backup, 'utf8'), bytes);
  assert.deepEqual(JSON.parse(await fs.readFile(f.file, 'utf8')), { hooks: { Stop: [{ matcher: 'x', hooks: [other] }], SessionStart: [{ hooks: [other] }] }, custom: true });
  assert.equal(await fs.readFile(path.join(f.state, 'device-id'), 'utf8'), 'abcdef1234567890');
  assert.deepEqual(await cleanup(f.root), { removed: 0 });
});
test('uninstall leaves unrelated or missing configuration alone', async t => {
  const f = await fixture(t);
  assert.deepEqual(await cleanup(f.root), { removed: 0 });
  const bytes = '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"other"}]}]}}';
  await fs.writeFile(f.file, bytes);
  assert.deepEqual(await cleanup(f.root), { removed: 0 });
  assert.equal(await fs.readFile(f.file, 'utf8'), bytes);
});
test('uninstall fails safely on invalid JSON', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.file, 'invalid');
  await assert.rejects(cleanup(f.root));
  assert.equal(await fs.readFile(f.file, 'utf8'), 'invalid');
});
test('uninstall refuses a symlink rather than replacing or editing its target', async t => {
  const f = await fixture(t);
  const target = path.join(f.root, 'other.json');
  await fs.writeFile(target, JSON.stringify({ hooks: { Stop: [{ hooks: [f.own] }] } }));
  await fs.symlink(target, f.file);
  await assert.rejects(cleanup(f.root), /non-regular/);
  assert.equal((await fs.lstat(f.file)).isSymbolicLink(), true);
});
