'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {canNormalWin,winningTai,viewFor}=require('../server');
let serial=0;
const tiles=ids=>ids.map(id=>({id,uid:`win-check-${serial++}`}));
function room(hand){
  const r={mode:'three',code:'win-check',hostToken:'p0',phase:'playing',players:[0,1,2].map(i=>({name:`玩家${i}`,token:`p${i}`,score:0,connected:true})),clients:new Map()};
  r.game={hands:[tiles(hand),[],[]],melds:[[
    {type:'碰',tiles:tiles([30,30,30])},
    {type:'碰',tiles:tiles([27,27,27])},
    {type:'碰',tiles:tiles([18,18,18])}
  ],[],[]],flowers:[[],[],[]],discards:[[],[],[]],scores:[0,0,0],wall:[],indicators:tiles([11,8]),dealer:0,current:0,phase:'playing',prompt:null,claimQueue:[],openingFourWhites:[false,false,false],winContext:[null,null,null],logs:[],visualEvents:[],visualSeq:0};
  return r;
}

test('混一色台数够但牌型未成时不能误判自摸，并向界面提供原因',()=>{
  const r=room([11,18,19,20,21,22,32,18]);
  assert.equal(winningTai(r,0,true).baseTai,11);
  assert.equal(canNormalWin(r,0,r.game.hands[0],true),false);
  assert.equal(viewFor(r,'p0').winCheck.shape,false);
  assert.equal(viewFor(r,'p0').winCheck.baseTai,11);
});

test('同一混一色牌型补成合法牌组和将后可以自摸',()=>{
  const r=room([11,18,18,18,19,20,21,32]);
  assert.equal(canNormalWin(r,0,r.game.hands[0],true),true);
  assert.equal(viewFor(r,'p0').winCheck.shape,true);
  assert.ok(viewFor(r,'p0').winCheck.items.some(x=>x.name==='混一色'&&x.tai===7));
});
