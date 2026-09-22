'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {startGame,viewFor,draw,selfAction,claim,replaceFlowers}=require('../server');
let serial=0;
const tiles=ids=>ids.map(id=>({id,uid:`wall-${serial++}`}));
function room(){
  const r={mode:'three',code:'wall',hostToken:'p0',phase:'playing',players:[0,1,2].map(i=>({token:`p${i}`,name:`玩家${i}`,connected:true})),clients:new Map()};
  const hand=[0,2,4,6,9,11,13,15,18,20,22,24,27,28,29,30];
  r.game={phase:'playing',current:0,dealer:0,round:1,hands:[tiles(hand),tiles(hand),tiles(hand)],melds:[[],[],[]],flowers:[[],[],[]],discards:[[],[],[]],scores:[0,0,0],indicators:tiles([7,8]),wall:tiles(Array(94).fill(5)),winContext:[null,null,null],openingFourWhites:[false,false,false],logs:[],visualEvents:[],visualSeq:0,prompt:null,claimQueue:[]};
  return r;
}
const remaining=r=>viewFor(r,'p0').wallCount;
test('三家各16张剩74，庄家多摸后73，此后每次正常摸牌减1',()=>{
  const r=room();assert.equal(remaining(r),74);draw(r,0);assert.equal(r.game.hands[0].length,17);assert.equal(remaining(r),73);draw(r,1);assert.equal(remaining(r),72);assert.equal(viewFor(r,'p0').reservedWallCount,20);
});
test('真实开局符合73减全桌补花数向上凑偶数，财神指示牌另外扣除',()=>{
  for(let i=0;i<25;i++){const r=room();r.game=null;startGame(r);const flowers=r.game.flowers.flat().length;assert.equal(remaining(r),73-2*Math.ceil(flowers/2));assert.equal(r.game.wall.length+r.game.hands.flat().length+flowers+r.game.indicators.length,144);}
});
test('起手补花按全桌合计凑偶数，白板也计入补花',()=>{
  const r=room();draw(r,0);let count=0;
  for(const [seat,id] of [[0,34],[1,33],[2,38],[0,35]]){r.game.hands[seat][0]=tiles([id])[0];replaceFlowers(r,seat);count++;assert.equal(remaining(r),73-2*Math.ceil(count/2));}
});
test('普通摸牌遇花：先扣这次正常摸牌，再按累计补花数凑偶数',()=>{
  const r=room();draw(r,0);r.game.wall[0]=tiles([34])[0];draw(r,1);assert.equal(remaining(r),70);assert.equal(r.game.flowers[1].length,1);
  r.game.wall[0]=tiles([33])[0];draw(r,2);assert.equal(remaining(r),69);assert.equal(r.game.flowers[2].length,1);
  r.game.wall[0]=tiles([38])[0];draw(r,0);assert.equal(remaining(r),66);
});
test('暗杠、明杠、补杠各扣两张，可叠加补花的取偶扣数',()=>{
  for(const kind of ['gang','minggang','bugang']){
    const r=room();draw(r,0);r.game.hands[0]=tiles(kind==='gang'?[0,0,0,0]:kind==='minggang'?[0,0,0]:[0]);
    if(kind==='bugang')r.game.melds[0]=[{type:'碰',tiles:tiles([0,0,0])}];
    if(kind==='minggang'){r.game.lastDiscard=tiles([0])[0];r.game.lastDiscarder=1;r.game.discards[1]=[r.game.lastDiscard];r.game.prompt={seat:0,type:'minggang',label:'杠'};claim(r,0,'minggang')}else selfAction(r,0,kind,0);
    assert.equal(remaining(r),71);assert.equal(viewFor(r,'p0').reservedWallCount,21);
  }
  const r=room();draw(r,0);r.game.hands[0]=tiles([0,0,0,0]);r.game.wall[r.game.wall.length-1]=tiles([34])[0];selfAction(r,0,'gang',0);assert.equal(remaining(r),69);assert.equal(r.game.flowers[0].length,1);
});
test('无杠无花余4张仍可正常摸，余3张才分张且不取预留牌',()=>{
  const r=room();r.game.wall=tiles(Array(24).fill(5));assert.equal(remaining(r),4);draw(r,0);assert.equal(r.game.phase,'playing');assert.equal(remaining(r),3);draw(r,2);assert.equal(r.game.result.draw,true);assert.deepEqual(r.game.result.fenTiles.map(x=>x.seat),[2,1,0]);assert.equal(r.game.wall.length,20);assert.equal(remaining(r),0);
});
test('有杠且奇数补花时，分张边界相应移动',()=>{
  const r=room();r.game.melds[0]=[{type:'暗杠',tiles:tiles([1,1,1,1])}];r.game.flowers[1]=tiles([34]);r.game.wall=tiles(Array(25).fill(5));assert.equal(remaining(r),3);draw(r,2);assert.equal(r.game.result.draw,true);assert.equal(r.game.wall.length,22);assert.equal(remaining(r),0);
});
test('分张遇花按相同规则扣牌，补牌从尾部取且不越过预留区',()=>{
  const r=room();r.game.wall=[...tiles([34]),...tiles(Array(21).fill(5)),...tiles([6])];draw(r,0);assert.equal(r.game.result.draw,true);assert.equal(r.game.flowers[0][0].id,34);assert.equal(r.game.result.fenTiles[0].tile.id,6);assert.equal(r.game.wall.length,21);assert.equal(remaining(r),0);
  const end=room();end.game.wall=[...tiles([34]),...tiles(Array(20).fill(5))];draw(end,0);assert.equal(end.game.result.draw,true);assert.equal(end.game.flowers[0].length,0);assert.equal(end.game.wall.length,21);
});
