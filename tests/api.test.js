'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {server,rooms}=require('../server');

test('HTTP单机模式可创建、读取状态并退出',async()=>{
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  const port=server.address().port,base=`http://127.0.0.1:${port}`;
  try{
    const created=await fetch(base+'/api/solo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'单机测试员'})});
    assert.equal(created.status,200);const session=await created.json();
    const stateResponse=await fetch(`${base}/api/state?room=${session.room}&token=${session.token}`);
    assert.equal(stateResponse.status,200);const state=await stateResponse.json();
    assert.equal(state.solo,true);assert.equal(state.players.length,4);assert.equal(state.players.slice(1).every(p=>p.bot),true);assert.equal(state.phase,'playing');
    const left=await fetch(base+'/api/leave',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(session)});
    assert.equal(left.status,200);assert.equal(rooms.has(session.room),false);

    const friendCreated=await fetch(base+'/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'好友房主'})});
    const friend=await friendCreated.json();assert.equal(friendCreated.status,200);
    for(let i=0;i<3;i++){const added=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...friend,type:'addBot'})});assert.equal(added.status,200)}
    const friendLobby=await (await fetch(`${base}/api/state?room=${friend.room}&token=${friend.token}`)).json();
    assert.equal(friendLobby.players.length,4);assert.equal(friendLobby.players.slice(1).every(p=>p.bot),true);
    const started=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...friend,type:'start'})});assert.equal(started.status,200);
    const friendGame=await (await fetch(`${base}/api/state?room=${friend.room}&token=${friend.token}`)).json();assert.equal(friendGame.phase,'playing');assert.deepEqual(friendGame.players.map(p=>p.wind),[0,3,2,1]);
    await fetch(base+'/api/leave',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(friend)});
  }finally{
    for(const room of rooms.values())if(room.botTimer)clearTimeout(room.botTimer);
    rooms.clear();await new Promise(resolve=>server.close(resolve));
  }
});
