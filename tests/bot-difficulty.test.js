'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeRoom,rooms,viewFor,setBotDifficulty,botDiscard,normalizeBotDifficulty}=require('../server');
const tile=(id,n)=>({id,uid:`bot-test-${id}-${n}`});

test('电脑难度保存到房间并能在开局前由房主调整',()=>{
  const room=makeRoom('房主','host','three','hell');
  try{
    assert.equal(room.botDifficulty,'hell');
    assert.equal(viewFor(room,'host').botDifficultyName,'地狱');
    setBotDifficulty(room,'host','hard');
    assert.equal(viewFor(room,'host').botDifficulty,'hard');
    assert.throws(()=>setBotDifficulty(room,'other','easy'),/房主/);
    setBotDifficulty(room,'host','unknown');
    assert.equal(room.botDifficulty,'medium');
  }finally{rooms.delete(room.code)}
});

test('困难和地狱人机会保护财神并优先丢出孤张',()=>{
  const room={mode:'four',botDifficulty:'hell',game:{indicators:[tile(7,1),tile(8,2)],hands:[],discards:[[],[],[],[]],melds:[[],[],[],[]],flowers:[[],[],[],[]]}};
  room.game.hands[0]=[0,1,2,3,4,5,6,7,8,9,10,11,7,27,31,22,25].map((id,i)=>tile(id,i));
  const first=botDiscard(room,0),second=botDiscard(room,0);
  assert.equal(first.uid,second.uid);
  assert.notEqual(first.id,7);
  assert.notEqual(first.id,8);
  assert.ok([22,25,27,31].includes(first.id));
  assert.equal(normalizeBotDifficulty('bad'),'medium');
});
