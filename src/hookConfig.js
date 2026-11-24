'use strict';
function assertConfig(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('hooks.json must contain a JSON object');
  if (root.hooks !== undefined && (!root.hooks || typeof root.hooks !== 'object' || Array.isArray(root.hooks))) {
    throw new Error('The hooks property of hooks.json must be an object');
  }
  if (root.hooks?.Stop !== undefined) {
    if (!Array.isArray(root.hooks.Stop)) throw new Error('hooks.Stop must be an array');
    for (const group of root.hooks.Stop) {
      if (!group || typeof group !== 'object' || Array.isArray(group) || !Array.isArray(group.hooks)) {
        throw new Error('hooks.Stop contains incompatible groups; no changes made');
      }
    }
  }
}
function shellQuote(text) { return "'" + String(text).replace(/'/g, "'\"'\"'") + "'"; }
function handlerCommand(file) { return 'python3 ' + shellQuote(file); }
function legacyCommands(file) { return new Set([handlerCommand(file), 'python3 ' + file]); }
function classify(root, runner, legacy) {
  assertConfig(root);
  const own = handlerCommand(runner), old = legacyCommands(legacy);
  let installed = 0, legacyCount = 0, other = 0;
  for (const group of root.hooks?.Stop || []) {
    for (const hook of group.hooks) {
      if (!hook || hook.type !== 'command' || typeof hook.command !== 'string') { other++; continue; }
      if (hook.command === own) installed++;
      else if (old.has(hook.command)) legacyCount++;
      else other++;
    }
  }
  return { installed, legacy: legacyCount, other };
}
function editHandlers(root, predicate) {
  assertConfig(root);
  const result = JSON.parse(JSON.stringify(root));
  let removed = 0;
  if (!result.hooks?.Stop) return { config: result, removed };
  const groups = [];
  for (const group of result.hooks.Stop) {
    const filtered = group.hooks.filter(h => {
      const match = h && h.type === 'command' && typeof h.command === 'string' && predicate(h.command);
      if (match) removed++;
      return !match;
    });
    if (filtered.length || group.hooks.length === 0) groups.push({ ...group, hooks: filtered });
  }
  if (groups.length) result.hooks.Stop = groups;
  else delete result.hooks.Stop;
  return { config: result, removed };
}
function install(root, runner, legacy, migrate) {
  const existing = classify(root, runner, legacy);
  if (existing.legacy && !migrate) throw new Error('Approve legacy hook migration to avoid duplicate notifications');
  const legacySet = legacyCommands(legacy), wanted = handlerCommand(runner);
  const out = editHandlers(root, command => command === wanted || (migrate && legacySet.has(command)));
  if (!out.config.hooks) out.config.hooks = {};
  if (!out.config.hooks.Stop) out.config.hooks.Stop = [];
  out.config.hooks.Stop.push({ hooks: [{ type: 'command', command: wanted, timeout: 15, async: true }] });
  return { config: out.config, migrated: existing.legacy };
}
function uninstall(root, runner) { return editHandlers(root, command => command === handlerCommand(runner)); }
module.exports = { assertConfig, shellQuote, handlerCommand, legacyCommands, classify, install, uninstall };
