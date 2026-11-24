'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {install,uninstall,classify,handlerCommand}=require('../src/hookConfig');
const runner='/home/test/.codex/kde-notify/runner.py', legacy='/home/test/.codex/notify_android.py';
test('register and deduplicate owned handler',()=>{
  const one=install({},runner,legacy,false).config;
  const two=install(one,runner,legacy,false).config;
  assert.deepEqual(one,two);assert.equal(classify(two,runner,legacy).installed,1);
});
test('preserve other events and Stop handlers',()=>{
  const other={type:'command',command:'other-command'};
  const before={hooks:{Stop:[{matcher:'x',hooks:[other]}],SessionStart:[{hooks:[other]}]},custom:true};
  const after=install(before,runner,legacy,false).config;
  assert.deepEqual(uninstall(after,runner).config,before);
});
test('migration requires approval',()=>{
  const old={hooks:{Stop:[{hooks:[{type:'command',command:handlerCommand(legacy)}]}]}};
  assert.throws(()=>install(old,runner,legacy,false));
  assert.deepEqual(classify(install(old,runner,legacy,true).config,runner,legacy),{installed:1,legacy:0,other:0});
});
test('reject invalid configuration',()=>assert.throws(()=>install({hooks:{Stop:'bad'}},runner,legacy,false)));
