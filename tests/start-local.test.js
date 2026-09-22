'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');

function launch(port){
  const child=spawn(process.execPath,[path.join(__dirname,'../start-local.js')],{env:{...process.env,PORT:String(port),TAIPAO_NO_BROWSER:'1'},windowsHide:true,timeout:10000,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  return {child,output:()=>output,closed:once(child,'close')};
}
function started(run){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(Error('Server startup timed out: '+run.output()));},5000);
    const cleanup=()=>{clearTimeout(timer);run.child.stdout.off('data',check);run.child.off('close',failed);};
    const failed=()=>{cleanup();reject(Error(run.output()));};
    const check=()=>{const match=run.output().match(/Mahjong server started: http:\/\/localhost:(\d+)/);if(match){cleanup();resolve(Number(match[1]));}};
    run.child.stdout.on('data',check);run.child.once('close',failed);check();
  });
}
test('首次启动成功，重复启动复用服务并保留已有房间', {timeout:15000},async()=>{
  const first=launch(0);let second;
  try{
    const port=await started(first),base=`http://127.0.0.1:${port}`;
    const response=await fetch(base+'/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'启动测试',mode:'three'})});assert.equal(response.status,200);const session=await response.json();
    second=launch(port);const [code]=await second.closed;assert.equal(code,0,second.output());assert.match(second.output(),/already running/);assert.doesNotMatch(second.output(),/Unhandled|EADDRINUSE/);
    const state=await fetch(base+`/api/state?room=${session.room}&token=${session.token}`);assert.equal(state.status,200);assert.equal((await state.json()).room,session.room);assert.equal(first.child.exitCode,null);
  }finally{if(second?.child.exitCode===null)second.child.kill();first.child.kill();await first.closed;}
});
for(const host of ['0.0.0.0','127.0.0.1'])test(`其他程序占用${host}端口时友好报错，不误认或终止该程序`,{timeout:15000},async()=>{
  const other=http.createServer((req,res)=>res.end('<html>Another application</html>'));await new Promise(resolve=>other.listen(0,host,resolve));let attempt;
  try{
    const port=other.address().port;attempt=launch(port);const [code]=await attempt.closed;assert.equal(code,1);assert.match(attempt.output(),/another program/);assert.doesNotMatch(attempt.output(),/Unhandled|already running/);assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(),'<html>Another application</html>');
  }finally{if(attempt?.child.exitCode===null)attempt.child.kill();await new Promise(resolve=>other.close(resolve));}
});
