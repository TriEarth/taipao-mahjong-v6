'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {viewFor}=require('../server');
let serial=0;
const tiles=ids=>ids.map(id=>({id,uid:`concealed-kong-${serial++}`}));
function room(){
  const r={mode:'three',code:'concealed-kong',hostToken:'p0',phase:'playing',players:[0,1,2].map(i=>({name:`玩家${i}`,token:`p${i}`,score:0,connected:true})),clients:new Map()};
  r.game={hands:[[],[],[]],melds:[[
    {type:'暗杠',tiles:tiles([1,1,1,1])},
    {type:'碰',tiles:tiles([2,2,2])}
  ],[],[]],flowers:[[],[],[]],discards:[[],[],[]],scores:[0,0,0],wall:[],indicators:tiles([7,8]),dealer:0,current:0,phase:'playing',prompt:null,claimQueue:[],openingFourWhites:[false,false,false],winContext:[null,null,null],logs:[],visualEvents:[],visualSeq:0};
  return r;
}

test('进行中暗杠只向本人提供牌面，其他玩家只收到隐藏牌背',()=>{
  const r=room(),self=viewFor(r,'p0'),other=viewFor(r,'p1');
  assert.equal(self.melds[0][0].tiles[0].id,1);
  assert.equal(other.melds[0][0].tiles.every(t=>t.concealed),true);
  assert.equal(other.melds[0][0].tiles.some(t=>Object.hasOwn(t,'id')),false);
  assert.equal(other.melds[0][1].tiles[0].id,2);
});

test('结算阶段公开暗杠真实牌面',()=>{
  const r=room();r.game.phase='result';
  const result=viewFor(r,'p1');
  assert.deepEqual(result.melds[0][0].tiles.map(t=>t.id),[1,1,1,1]);
});
