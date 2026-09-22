'use strict';
const http=require('node:http');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {server}=require('./server');
const port=Number(process.env.PORT||3005);

function identifyServer(port){
  return new Promise(resolve=>{
    const request=http.get({hostname:'127.0.0.1',port,path:'/',timeout:3000},response=>{
      let body='';response.setEncoding('utf8');
      response.on('data',chunk=>{body+=chunk;if(body.length>262144)request.destroy();});
      response.on('end',()=>resolve(response.statusCode===200&&body.includes('id="entryForm"')&&body.includes('id="caishenTiles"')&&body.includes('id="myHand"')?'mahjong':'other'));
      response.on('error',()=>resolve('other'));
    });
    request.on('timeout',()=>request.destroy());
    request.on('error',error=>resolve(error.code==='ECONNREFUSED'?'none':'other'));
  });
}
function openGame(url){
  if(process.env.TAIPAO_NO_BROWSER==='1'||process.platform!=='win32')return;
  const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore',detached:true});
  browser.on('error',()=>console.log(`Please open this address in your browser: ${url}`));
  browser.unref();
}
function useExisting(kind){
  if(kind==='mahjong'){
    const url=`http://localhost:${port}`;
    console.log(`Mahjong server is already running. Reusing it: ${url}`);
    console.log('Existing rooms and players are preserved.');
    openGame(url);
  }else{
    console.error(`Port ${port} is already in use by another program or an unresponsive service.`);
    console.error('No process was stopped. Close the conflicting program and run start.bat again.');
    process.exitCode=1;
  }
}
if(!Number.isInteger(port)||port<0||port>65535){
  console.error('Invalid PORT. Please use a port number from 1 to 65535.');process.exitCode=1;
}else{
  server.once('error',async error=>{
    if(error.code==='EADDRINUSE'){
      useExisting(await identifyServer(port));
    }else{
      console.error(`Unable to start Mahjong server: ${error.message}`);process.exitCode=1;
    }
  });
  // On Windows, a loopback-only listener can coexist with a wildcard bind.
  // Probe first so the opened localhost URL cannot lead to a different app.
  (async()=>{
    const existing=port===0?'none':await identifyServer(port);
    if(existing!=='none'){useExisting(existing);return;}
    server.listen(port,'0.0.0.0',()=>{
    const actualPort=server.address().port,url=`http://localhost:${actualPort}`;
    console.log(`Mahjong server started: ${url}`);
    for(const entry of Object.values(os.networkInterfaces()).flat())if(entry&&entry.family==='IPv4'&&!entry.internal)console.log(`LAN: http://${entry.address}:${actualPort}`);
    console.log('Keep this window open while playing. Press Ctrl+C to stop.');
    openGame(url);
    });
  })();
}
