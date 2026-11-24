'use strict';
(() => {
  const vscode=acquireVsCodeApi(), el=id=>document.getElementById(id);
  let busy=true, status;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  function btn(text,action,id,disabled=false){
    const b=node('button',text);b.dataset.action=action;b.dataset.id=id||'';b.dataset.disabled=String(disabled);return b;
  }
  function controls(){
    for(const b of document.querySelectorAll('button[data-action]')){
      b.disabled=busy||b.dataset.disabled==='true'||(b.id==='test'&&!status?.selected)||(b.id==='disable'&&!status?.installed);
    }
    document.querySelector('main').setAttribute('aria-busy',String(busy));
  }
  function render(s){
    status=s;
    const checks=el('checks');checks.replaceChildren();
    for(const [label,ok] of [['Linux desktop',s.pre.linux&&!s.remote],['Python 3',s.pre.python],['KDE Connect',s.pre.kde],['Codex hook registered',!!s.installed],['Bundled helper',s.helper]]){
      checks.append(node('p',(ok?'✓ ':'! ')+label,ok?'ok':'muted'));
    }
    if(s.installed)checks.append(node('p','Hook approval is not verified; check Codex.','muted'));
    if(s.configError)checks.append(node('p',s.configError,'warning'));
    if(s.remote)checks.append(node('p','Remote sessions are not supported.','warning'));
    document.querySelector('[data-action="deps"]').hidden=s.pre.python&&s.pre.kde;
    el('selected').textContent=s.selected?(s.selectedName||'Selected phone not visible')+' · '+(s.online?'online':'offline or not paired'):'No phone selected.';
    const list=el('devices');list.replaceChildren();
    if(s.discoveryError)list.append(node('p','Discovery failed: '+s.discoveryError,'warning'));
    if(!s.devices.length)list.append(node('p','No devices found. Open KDE Connect on Android, check Wi-Fi and refresh.','muted'));
    for(const d of s.devices){
      const item=node('div','','device'), info=node('div','','info');
      info.append(node('strong',d.name),node('p',d.paired&&d.online?'Paired · online':d.online?'Online · pairing required':'Offline · pairing not verified','muted'));
      if(s.selected===d.id)info.append(node('span','Selected phone','ok'));
      item.append(info);
      if(d.online&&d.paired){
        const current=s.selected===d.id&&s.installed&&s.helper&&!s.update&&!s.legacy;
        item.append(btn(current?'In use':s.selected===d.id&&s.update?'Update helper':'Use device','select',d.id,current));
      } else if(d.online)item.append(btn('Pair','pair',d.id));
      list.append(item);
    }
    if(s.legacy)list.append(node('p','Legacy standalone hook detected. Select a phone and approve replacement to avoid duplicates.','warning'));
    if(s.other)list.append(node('p','Other Stop hooks may continue a turn after a notification.','muted'));
    controls();
  }
  window.addEventListener('message',event=>{
    const m=event.data;if(!m||typeof m!=='object')return;
    if(m.type==='status')render(m.status);
    if(m.type==='busy'){busy=m.busy;el('busy').hidden=!busy;el('busy').textContent=m.operation||'Working…';controls();}
    if(m.type==='notice'||m.type==='error'){el('notice').hidden=false;el('notice').textContent=m.message;el('notice').className=m.type==='error'?'warning':'notice';}
  });
  document.addEventListener('click',event=>{
    const b=event.target.closest('button[data-action]');if(!b||b.disabled||busy)return;
    busy=true;el('busy').hidden=false;el('busy').textContent='Working…';controls();
    vscode.postMessage({type:'action',action:b.dataset.action,id:b.dataset.id});
  });
  controls();vscode.postMessage({type:'ready'});
})();
