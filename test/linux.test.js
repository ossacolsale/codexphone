'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {devices,testPing,parseIdName}=require('../src/linux');
const id='abcdef1234567890', noop=async()=>{};
test('parse ID and display name',()=>assert.equal(parseIdName(id+' My Phone\n').get(id),'My Phone'));
function fake(readyAfter=2, failPing=false){
  let attempts=0;const calls=[];
  const execute=async(cmd,args)=>{
    calls.push(args);
    if(args.includes('--refresh'))return {stdout:''};
    if(args.includes('--list-available')){attempts++;return {stdout:attempts>=readyAfter?id+' Phone\n':''};}
    if(args.includes('--list-devices'))return {stdout:id+' Phone\n'};
    if(args.includes('--shell-device-autocompletion'))return {stdout:''};
    if(args.includes('--ping-msg')){if(failPing)throw Error('send failed');return {stdout:''};}
    throw Error('unexpected command');
  };
  return {calls,execute};
}
test('wait for initial KDE discovery then ping exactly once',async()=>{
  const f=fake();await testPing(id,{execute:f.execute,sleep:noop});
  assert.equal(f.calls.filter(x=>x.includes('--list-available')).length,2);
  assert.equal(f.calls.filter(x=>x.includes('--ping-msg')).length,1);
});
test('offline target never receives a ping',async()=>{
  const f=fake(99);await assert.rejects(testPing(id,{execute:f.execute,sleep:noop}),/not paired or reachable/);
  assert.equal(f.calls.filter(x=>x.includes('--ping-msg')).length,0);
});
test('ambiguous send is never retried',async()=>{
  const f=fake(1,true);await assert.rejects(testPing(id,{execute:f.execute,sleep:noop}),/send failed/);
  assert.equal(f.calls.filter(x=>x.includes('--ping-msg')).length,1);
});
test('reject invalid device ID',async()=>{const f=fake();await assert.rejects(testPing('--bad',{execute:f.execute,sleep:noop}));assert.equal(f.calls.length,0);});
