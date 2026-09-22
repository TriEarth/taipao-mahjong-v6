'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const http=require('node:http');

test('完全退出仅本机同源带凭证可用，关闭房间、长连接和服务并释放端口',{timeout:15000},async()=>{
  const child=spawn(process.execPath,[path.join(__dirname,'../start-local.js')],{env:{...process.env,PORT:'0',TAIPAO_NO_BROWSER:'1'},windowsHide:true,timeout:12000,stdio:['ignore','pipe','pipe']}),closed=once(child,'close');
  let output='',events;
  try{
    const port=await new Promise((resolve,reject)=>{
      child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/server started: http:\/\/localhost:(\d+)/);if(match)resolve(Number(match[1]));});
      child.once('exit',()=>reject(Error('Server stopped before startup: '+output)));
    });
    const base=`http://127.0.0.1:${port}`,getControl=(headers={})=>new Promise((resolve,reject)=>{
      http.get(base+'/api/local-control',{headers},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,json:async()=>JSON.parse(body)}));}).on('error',reject);
    });
    const control=await getControl();assert.equal(control.status,200);const {shutdownToken}=await control.json();assert.ok(shutdownToken);
    for(const headers of [{Host:`example.com:${port}`},{Origin:'https://example.com'},{'X-Forwarded-For':'203.0.113.1'},{'CF-Ray':'test'}]){
      const response=await getControl(headers);assert.equal(response.status,403);assert.equal((await response.json()).shutdownToken,undefined);
    }
    const stop=(headers,body)=>fetch(base+'/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    assert.equal((await stop({}, {shutdownToken})).status,403);
    assert.equal((await stop({Origin:'https://example.com'}, {shutdownToken})).status,403);
    assert.equal((await stop({Origin:base,'X-Forwarded-For':'203.0.113.1'}, {shutdownToken})).status,403);
    assert.equal((await stop({Origin:base}, {shutdownToken:'wrong'})).status,403);
    const room=await (await fetch(base+'/api/solo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'退出测试',mode:'three'})})).json();
    await new Promise((resolve,reject)=>{
      events=http.get(base+`/api/events?room=${room.room}&token=${room.token}`,response=>{response.once('data',resolve);response.on('error',()=>{});});events.on('error',reject);
    });
    const response=await stop({Origin:base},{shutdownToken});assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
    const [code]=await closed;assert.equal(code,0);events.destroy();
    const replacement=http.createServer();await new Promise((resolve,reject)=>replacement.once('error',reject).listen(port,'0.0.0.0',resolve));await new Promise(resolve=>replacement.close(resolve));
  }finally{events?.destroy();if(child.exitCode===null)child.kill();await closed;}
});
