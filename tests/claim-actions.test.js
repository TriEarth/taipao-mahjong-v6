'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {claimQueue,nextPromptOrTurn,claim,viewFor,discard}=require('../server');
let serial=0;
const tiles=ids=>ids.map(id=>({id,uid:`claim-${serial++}`}));
const huPeng=[0,0,1,2,3,9,10,11,18,19,20,27,27,27,4,4];
const huGang=[0,0,0,1,2,3,9,10,11,18,19,20,21,22,23,7];
const huOnly=[1,2,3,9,10,11,18,19,20,21,22,23,27,27,27,0];
function fixture({mode='three',gang=false,otherHu=false,noHu=false}={}){
  const count=mode==='three'?3:4,seats=()=>Array.from({length:count},()=>[]);
  const room={mode,code:'claims',hostToken:'p0',phase:'playing',players:Array.from({length:count},(_,i)=>({token:`p${i}`,name:`玩家${i}`,connected:true})),clients:new Map()};
  const g=room.game={phase:'playing',current:2,dealer:2,round:1,hands:seats(),melds:seats(),flowers:seats(),discards:seats(),indicators:tiles([7,8]),wall:tiles(Array(40).fill(6)),scores:Array(count).fill(0),winContext:Array(count).fill(null),openingFourWhites:Array(count).fill(false),logs:[],visualEvents:[],visualSeq:0};
  g.hands[1]=tiles(noHu?[0,0,0]:gang?huGang:huPeng);
  if(gang)g.flowers[1]=tiles([34,35,36,37]);
  if(otherHu)g.hands[0]=tiles(huOnly);
  g.lastDiscard=tiles([0])[0];g.lastDiscarder=2;g.discards[2]=[g.lastDiscard];g.claimQueue=claimQueue(room,2,g.lastDiscard);nextPromptOrTurn(room);
  return room;
}
const choices=(r,seat=1)=>viewFor(r,`p${seat}`).prompt?.actions.map(a=>a.type);

test('三人和四人可同时看到胡碰过，选择碰后能继续出牌',()=>{
  for(const mode of ['three','four']){
    const r=fixture({mode});assert.deepEqual(choices(r),['hu','peng']);assert.equal(viewFor(r,'p2').prompt,null);
    claim(r,1,'peng');assert.equal(r.game.phase,'playing');assert.equal(r.game.current,1);assert.equal(r.game.prompt,null);assert.equal(r.game.melds[1][0].type,'碰');assert.equal(r.game.hands[1].length,14);assert.equal(r.game.discards[2].length,0);assert.equal(r.game.result,undefined);
    discard(r,1,r.game.hands[1][0].uid);assert.equal(r.game.discards[1].length,1);
  }
});
test('胡杠碰同时可选，选择明杠后补一张牌且不会自动胡',()=>{
  const r=fixture({gang:true});assert.deepEqual(choices(r),['hu','minggang','peng']);const before=r.game.wall.length;
  claim(r,1,'minggang');assert.equal(r.game.phase,'playing');assert.equal(r.game.melds[1][0].type,'明杠');assert.equal(r.game.melds[1][0].tiles.length,4);assert.equal(r.game.hands[1].length,14);assert.equal(r.game.wall.length,before-1);assert.deepEqual(r.game.winContext[1],{gangBloom:true});
});
test('同时能杠碰时可选择碰，不强制杠；胡牌选项仍正常结算',()=>{
  const r=fixture({noHu:true});assert.deepEqual(choices(r),['minggang','peng']);claim(r,1,'peng');assert.equal(r.game.melds[1][0].type,'碰');assert.equal(r.game.hands[1].length,1);
  const h=fixture();claim(h,1,'hu');assert.equal(h.game.phase,'result');assert.equal(h.game.result.winner,1);
});
test('选择碰或杠必须等另一家放弃胡牌，再自动执行已选操作',()=>{
  for(const action of ['peng','minggang']){
    const r=fixture({gang:true,otherHu:true}),before=r.game.wall.length;claim(r,1,action);
    assert.equal(r.game.prompt.seat,0);assert.equal(r.game.prompt.type,'hu');assert.deepEqual(choices(r,0),['hu']);assert.equal(r.game.melds[1].length,0);assert.equal(r.game.discards[2].length,1);assert.equal(r.game.wall.length,before);assert.equal(viewFor(r,'p1').waitingClaim,true);
    claim(r,0,'pass');assert.equal(r.game.prompt,null);assert.equal(r.game.current,1);assert.equal(r.game.melds[1][0].type,action==='peng'?'碰':'明杠');assert.equal(r.game.phase,'playing');
  }
});
test('已选择的碰杠不能截走他人胡牌，且重复提交不会多次取牌',()=>{
  const r=fixture({gang:true,otherHu:true});claim(r,1,'peng');assert.throws(()=>claim(r,1,'peng'),/不需要你响应/);claim(r,0,'hu');assert.equal(r.game.result.winner,0);assert.equal(r.game.melds[1].length,0);assert.equal(r.game.hands[1].length,16);assert.throws(()=>claim(r,1,'peng'),/不需要你响应/);
});
test('过一次放弃本张弃牌全部操作，不再追问碰杠',()=>{
  const r=fixture({gang:true,otherHu:true});claim(r,1,'pass');assert.equal(r.game.claimQueue.some(x=>x.seat===1),false);claim(r,0,'pass');assert.equal(r.game.prompt,null);assert.equal(r.game.current,1);assert.equal(r.game.hands[1].length,17);assert.equal(r.game.melds[1].length,0);assert.equal(r.game.discards[2].length,1);
});
test('无效操作不改变手牌；抢杠只能胡或过，不能碰杠',()=>{
  const r=fixture();const before=JSON.stringify(r.game);assert.throws(()=>claim(r,1,'minggang'),/无效操作/);assert.equal(JSON.stringify(r.game),before);
  r.game.pendingBuGang={seat:2,tile:r.game.lastDiscard,meldIndex:0};r.game.prompt.label='抢杠胡';assert.deepEqual(choices(r),['hu']);assert.throws(()=>claim(r,1,'peng'),/无效操作/);
});
