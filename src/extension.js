'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { run, prerequisites, devices, testPing, installCommand, ID_PATTERN } = require('./linux');
const { assertConfig, classify, install, uninstall } = require('./hookConfig');
let context, output, bar, view, last, busy = false, operation = '';
function loc() {
  const home = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
  const state = path.join(home, 'kde-notify');
  return { state, runner: path.join(state, 'runner.py'), previous: path.join(home, 'notify_android.py'),
    config: path.join(home, 'hooks.json'), device: path.join(state, 'device-id'), database: path.join(state, 'sent.sqlite3') };
}
async function read(p) {
  try { return await fs.readFile(p); } catch(e) { if(e.code === 'ENOENT') return null; throw e; }
}
async function atomic(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = p + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  try { await fs.writeFile(tmp, data, { flag:'wx', mode:0o600 }); await fs.rename(tmp,p); }
  finally { await fs.rm(tmp,{force:true}).catch(()=>{}); }
}
async function backup(p, data) {
  const dest = p + '.codex-phone.' + new Date().toISOString().replace(/[:.]/g,'-') + '.' + crypto.randomBytes(3).toString('hex') + '.bak';
  await fs.writeFile(dest,data,{flag:'wx',mode:0o600});
  output.appendLine('Backup created.');
}
async function configuration() {
  const raw = await read(loc().config);
  let config;
  try { config = raw ? JSON.parse(raw.toString('utf8')) : {}; assertConfig(config); }
  catch (_) { throw new Error('Invalid or unsupported hooks.json; no changes made.'); }
  return {raw,config};
}
async function commit(before, after) {
  if (JSON.stringify(before.config) === JSON.stringify(after)) return;
  const target = loc().config;
  const same = current => (current?.toString('utf8') ?? null) === (before.raw?.toString('utf8') ?? null);
  if (!same(await read(target))) throw new Error('hooks.json changed. Refresh and try again.');
  if (before.raw) await backup(target,before.raw);
  if (!same(await read(target))) throw new Error('hooks.json changed during setup. Refresh and try again.');
  await atomic(target,JSON.stringify(after,null,2)+'\n');
}
function push(msg) { if(view) void view.webview.postMessage(msg).then(undefined,()=>{}); }
function notice(message) {
  output.appendLine(message); push({type:'notice',message});
  // Non-modal toasts must never block the operation until dismissed.
  void vscode.window.showInformationMessage(message);
}
function error(e) {
  const message=e instanceof Error?e.message:String(e);
  output.appendLine('Error: '+message); push({type:'error',message});
  void vscode.window.showErrorMessage('Codex Phone: '+message);
}
function local() {
  if(process.platform!=='linux'||vscode.env.remoteName) throw new Error('Use local desktop Linux; remote sessions are not supported.');
}
async function selected() { return (await read(loc().device))?.toString('utf8').trim() || ''; }
async function refresh(discover=false) {
  const l=loc(), pre=await prerequisites(), id=await selected();
  let list=[], discoveryError='', configError='', counts={installed:0,legacy:0,other:0};
  if(pre.kde && !vscode.env.remoteName) {
    try { list=await devices({target:id,discover}); } catch(e){ discoveryError=e.message; }
  }
  try { counts=classify((await configuration()).config,l.runner,l.previous); } catch(e){ configError=e.message; }
  const helper=await read(l.runner), bundled=await fs.readFile(path.join(context.extensionPath,'python','notify_android.py'));
  const phone=list.find(d=>d.id===id);
  last={pre,devices:list,selected:id,selectedName:phone?.name||'',online:!!(phone?.paired&&phone?.online),
    installed:counts.installed,legacy:counts.legacy,other:counts.other,configError,discoveryError,
    helper:!!helper,update:!!helper&&!helper.equals(bundled),remote:!!vscode.env.remoteName};
  bar.text=counts.installed?(last.online?'$(device-mobile) Codex Phone':'$(device-mobile) Codex Phone · offline'):'$(bell) Codex Phone · setup';
  bar.tooltip='Open Codex Phone dashboard'; bar.show();
  push({type:'status',status:last});
  return last;
}
async function setup(id) {
  local();
  const d=last?.devices.find(d=>d.id===id);
  if(!d?.online||!d.paired||!ID_PATTERN.test(id)) throw new Error('Choose a paired, reachable device first.');
  const pre=await prerequisites();
  if(!pre.python||!pre.kde) throw new Error('Install Python 3 and KDE Connect first.');
  const l=loc(), before=await configuration(), counts=classify(before.config,l.runner,l.previous);
  let migrate=false;
  if(counts.legacy) {
    migrate=await vscode.window.showWarningMessage('Replace the old standalone notification hook to avoid duplicate notifications? Other hooks remain unchanged.',{modal:true},'Replace hook')==='Replace hook';
    if(!migrate)return;
  }
  const ok=await vscode.window.showInformationMessage('Use '+d.name+'? This installs the bundled helper and registers a Codex Stop hook. Only a fixed message is sent.',{modal:true},'Confirm setup');
  if(ok!=='Confirm setup')return;
  const next=install(before.config,l.runner,l.previous,migrate);
  const bundled=await fs.readFile(path.join(context.extensionPath,'python','notify_android.py'));
  const existing=await read(l.runner);
  if(existing&&!existing.equals(bundled))await backup(l.runner,existing);
  await atomic(l.runner,bundled); await atomic(l.device,id+'\n');
  await commit(before,next.config);
  notice('Setup complete. Send a test notification now. Approve the Stop hook in Codex and start a new Codex session.');
}
async function pair(id) {
  local();
  const d=last?.devices.find(d=>d.id===id);
  if(!d?.online||!ID_PATTERN.test(id))throw new Error('Device not visible; refresh first.');
  if(d.paired)return;
  if(await vscode.window.showInformationMessage('Request pairing with '+d.name+'? Accept it on Android.',{modal:true},'Pair')!=='Pair')return;
  await run('kdeconnect-cli',['--device',id,'--pair'],35000);
  notice('Pairing requested. Accept on Android and refresh.');
}
async function choose() {
  local(); const s=await refresh(true);
  if(!s.pre.python||!s.pre.kde){ await dependencies(); return; }
  const available=s.devices.filter(d=>d.online);
  if(!available.length){notice('No reachable devices. Open KDE Connect on Android and refresh.');return;}
  const d=await vscode.window.showQuickPick(available.map(d=>({label:d.name,description:d.paired?'Paired · online':'Pairing required',id:d.id,paired:d.paired})),{title:'Choose Android device'});
  if(d)await(d.paired?setup(d.id):pair(d.id));
}
async function dependencies() {
  local(); const spec=await installCommand();
  if(!spec){notice('Distribution not recognized. Install KDE Connect and Python 3 using your package manager.');return;}
  const ok=await vscode.window.showWarningMessage('Run this package manager command in a terminal?\n\n'+spec.command+'\n\nIt may require sudo.',{modal:true},'Open terminal');
  if(ok!=='Open terminal')return;
  const term=vscode.window.createTerminal({name:'Codex Phone · '+spec.label});
  term.show();term.sendText(spec.command,true);
  notice('After installation, click Refresh.');
}
async function test() { local(); const id=await selected(); if(!id)throw new Error('Select a phone first.'); await testPing(id); notice('KDE Connect accepted the test ping. Check Android notifications.'); }
async function diagnostics() {
  const s=await refresh(false); output.clear();
  output.appendLine(['Codex Phone local diagnostics','Linux: '+s.pre.linux,'Remote: '+s.remote,'Python: '+s.pre.python,'KDE Connect: '+s.pre.kde,
    'Devices found: '+s.devices.length,'Selected phone: '+(s.selectedName||'not visible'),'Paired and reachable: '+s.online,
    'Registered hooks: '+s.installed,'Legacy hooks: '+s.legacy,'Other Stop hooks: '+s.other,
    'Hook approval: unknown; check Codex Hooks settings or /hooks.','Helper installed: '+s.helper,'Helper update available: '+s.update,
    'Configuration error: '+(s.configError||'none'),'Discovery error: '+(s.discoveryError||'none')].join('\n'));output.show(true);
}
async function disable() {
  local();const before=await configuration(), next=uninstall(before.config,loc().runner);
  if(!next.removed){notice('No Codex Phone hook is registered.');return;}
  if(await vscode.window.showWarningMessage('Remove only the Codex Phone Stop hook? Your device selection and database remain intact.',{modal:true},'Disable notifications')!=='Disable notifications')return;
  await commit(before,next.config);notice('Notifications disabled. Restart Codex sessions to reload hooks.');
}
const actions={
  refresh:['Discovering devices…',()=>refresh(true),false],
  choose:['Choosing a phone…',choose],select:['Configuring notifications…',setup],
  pair:['Requesting pairing…',pair],test:['Checking connection and sending test…',test],
  deps:['Preparing dependencies…',dependencies],diagnostics:['Checking diagnostics…',diagnostics,false],
  disable:['Disabling notifications…',disable],
  android:['Opening Android app page…',()=>vscode.env.openExternal(vscode.Uri.parse('https://f-droid.org/packages/org.kde.kdeconnect_tp/')),false]
};
async function dispatch(action,id){
  if(!Object.hasOwn(actions,action))return;
  if(busy){push({type:'notice',message:'Another operation is running. Please retry when it finishes.'});return;}
  const [label,fn,after]=actions[action];busy=true;operation=label;push({type:'busy',busy,operation});
  try{await fn(id);}catch(e){error(e);}
  finally{
    if(after!==false)try{await refresh(false);}catch(e){error(e);}
    busy=false;operation='';push({type:'busy',busy,operation});
  }
}
function page(w){
  const js=w.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','dashboard.js'));
  const css=w.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','dashboard.css'));
  const nonce=crypto.randomBytes(16).toString('hex');
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src '+w.cspSource+'; script-src \'nonce-'+nonce+'\';"><link rel="stylesheet" href="'+css+'"><title>Codex Phone</title></head><body><main>'+
    '<h1>Codex Phone</h1><p class="muted">Private Android notifications · KDE Connect · Local network</p>'+
    '<p id="busy" role="status">Checking system…</p><p id="notice" role="status" hidden></p>'+
    '<section><h2>Setup</h2><div id="checks"></div><button data-action="deps">Install Linux dependencies</button></section>'+
    '<section><div class="heading"><h2>Your phone</h2><button data-action="refresh">Refresh</button></div><p id="selected" class="muted"></p><div id="devices"></div><button data-action="choose">Choose from list…</button></section>'+
    '<section><h2>Test and manage</h2><button class="primary" data-action="test" id="test" disabled>Send test notification</button><button data-action="diagnostics">Show diagnostics</button><button data-action="disable" id="disable" disabled>Disable Codex notifications</button></section>'+
    '<section><h2>First notification</h2><ol><li>Select a paired, online phone.</li><li>Approve the Stop hook in Codex Hooks settings or /hooks where available.</li><li>Start a new Codex session and complete a short turn.</li></ol><p class="muted">No prompts, code or project names are sent. Offline events are not replayed.</p><button data-action="android">KDE Connect for Android</button></section>'+
    '</main><script nonce="'+nonce+'" src="'+js+'"></script></body></html>';
}
class Dashboard{
  resolveWebviewView(v){
    view=v;v.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};
    v.webview.onDidReceiveMessage(m=>{
      if(!m||typeof m!=='object')return;
      if(m.type==='ready'){if(last)push({type:'status',status:last});push({type:'busy',busy,operation});if(!busy)void dispatch('refresh');}
      if(m.type==='action'&&typeof m.action==='string')void dispatch(m.action,m.id);
    });
    v.webview.html=page(v.webview);
    v.onDidChangeVisibility(()=>{if(v.visible&&!busy)void dispatch('refresh');});
    v.onDidDispose(()=>{if(view===v)view=undefined;});
  }
}
function activate(ctx){
  context=ctx;output=vscode.window.createOutputChannel('Codex Phone');bar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,90);
  bar.text='$(device-mobile) Codex Phone';bar.command='codexKdeNotify.dashboard';bar.show();
  ctx.subscriptions.push(output,bar,vscode.window.registerWebviewViewProvider('codexKdeNotify.dashboard',new Dashboard()));
  ctx.subscriptions.push(vscode.commands.registerCommand('codexKdeNotify.dashboard',()=>vscode.commands.executeCommand('workbench.view.extension.codexKdeNotify')));
  for(const [cmd,action] of Object.entries({setup:'choose',refresh:'refresh',test:'test',installDependencies:'deps',diagnostics:'diagnostics',remove:'disable'})){
    ctx.subscriptions.push(vscode.commands.registerCommand('codexKdeNotify.'+cmd,()=>dispatch(action)));
  }
}
function deactivate(){}
module.exports={activate,deactivate};
