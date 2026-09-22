'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeRoom,rooms,addBot,makeSoloRoom,startGame,viewFor,ownActions,selfAction,canWin,canNormalWin,winningTai,basicTai,draw,discard,claim,claimQueue,finishWin,confirmSettlement,calculateSettlement,runFenZhang}=require('../server');
let serial=0;
const tiles=ids=>ids.map(id=>({id,uid:`three-${serial++}`}));
function room(){
  const r={mode:'three',code:'test-three',hostToken:'p0',phase:'playing',players:[0,1,2].map(i=>({name:`玩家${i}`,token:`p${i}`,connected:true})),clients:new Map()};
  r.game={hands:[[],[],[]],melds:[[],[],[]],flowers:[[],[],[]],discards:[[],[],[]],scores:[0,0,0],wall:tiles(Array(40).fill(5)),indicators:tiles([7,8]),dealer:0,current:0,phase:'playing',round:1,prompt:null,claimQueue:[],openingFourWhites:[false,false,false],winContext:[null,null,null],logs:[],visualEvents:[],visualSeq:0};
  return r;
}
function normalRoom(){const r=room();r.game.hands[0]=tiles([0,1,2,3,4,5,18,19,20,28,28,28,6,6]);r.game.melds[0]=[{type:'碰',tiles:tiles([9,9,9])}];return r;}
const unformed=[0,2,4,6,9,11,13,15,18,20,22,24,27];
const formed=[0,1,2,3,4,5,9,10,11,18,19,20,27];
function forcedRoom(normal=false){const r=room();r.game.hands[0]=tiles([7,7,7,...(normal?formed:unformed)]);r.game.wall=[...tiles([8]),...tiles(Array(30).fill(5))];return r;}

test('三人好友房限制三个座位，单机只补两名电脑',()=>{
  const r=makeRoom('房主','host','three');
  try{assert.throws(()=>startGame(r),/3位/);addBot(r,'host');addBot(r,'host');assert.throws(()=>addBot(r,'host'),/坐满/);startGame(r);assert.deepEqual(r.game.hands.map(h=>h.length),[17,16,16]);assert.equal(viewFor(r,'host').playerCount,3);assert.deepEqual(viewFor(r,'host').players.map(p=>p.wind),[0,2,1]);}finally{clearTimeout(r.botTimer);rooms.delete(r.code)}
  const solo=makeSoloRoom('玩家','solo','three');try{assert.equal(solo.players.length,3);assert.equal(solo.players.filter(p=>p.bot).length,2)}finally{clearTimeout(solo.botTimer);rooms.delete(solo.code)}
  assert.throws(()=>makeRoom('玩家','x','bad'),/未知玩法/);
});
test('三人9台不能自摸，10台可以；四人无新增门槛',()=>{
  const r=normalRoom();r.game.flowers[0]=tiles([34,35]);
  assert.equal(winningTai(r,0,true).baseTai,9);assert.equal(canWin(r.game.hands[0],1,r.game.indicators),true);assert.equal(ownActions(r,0).some(a=>a.type==='hu'),false);assert.throws(()=>selfAction(r,0,'hu'),/台数/);assert.equal(r.game.phase,'playing');
  r.game.flowers[0].push(...tiles([38]));assert.equal(winningTai(r,0,true).baseTai,10);selfAction(r,0,'hu');assert.equal(r.game.result.tai,10);
  const four=normalRoom();four.mode='four';assert.equal(canNormalWin(four,0,four.game.hands[0],true),true);
});
test('接炮也需10台，抢杠的3台计入起胡门槛',()=>{
  const r=normalRoom(),t=r.game.hands[0].pop();r.game.flowers[0]=tiles([34,35,38]);
  assert.equal(canNormalWin(r,0,[...r.game.hands[0],t],false),false);assert.equal(claimQueue(r,1,t).some(a=>a.type==='hu'&&a.seat===0),false);
  assert.equal(canNormalWin(r,0,[...r.game.hands[0],t],false,{robKong:true}),true);
  r.game.flowers[0].push(...tiles([33]));assert.equal(claimQueue(r,1,t).some(a=>a.type==='hu'&&a.seat===0),true);
  r.game.lastDiscarder=1;r.game.lastDiscard=t;r.game.discards[1]=[t];r.game.prompt={seat:0,type:'hu'};claim(r,0,'hu');assert.equal(r.game.result.tai,10);
});
test('16台不翻，17台变34，20台变40，超过34台也只翻一次',()=>{
  for(const [flowers,base,total] of [[[34,35,36,37],16,16],[[34,35,36,37,38],17,34],[[34,35,36,37,38,39,33],20,40]]){
    const r=normalRoom();r.game.flowers[0]=tiles(flowers);selfAction(r,0,'hu');assert.equal(r.game.result.baseTai,base);assert.equal(r.game.result.tai,total);assert.equal(r.game.result.doubled,base>=17);assert.equal(r.game.result.items.reduce((sum,x)=>sum+x.tai,0),total);
  }
  assert.equal(winningTai(room(),0,true,{specialTai:40,specialLabel:'边界'}).tai,80);
});
test('摸齐3+1未成牌自动推34台，任何其他台型均不叠加',()=>{
  const r=forcedRoom();r.game.flowers[0]=tiles([34,35,36,37]);assert.equal(canWin([...r.game.hands[0],...tiles([8])],0,r.game.indicators),false);
  assert.equal(draw(r,0),null);assert.equal(r.game.phase,'result');assert.equal(r.game.result.baseTai,17);assert.equal(r.game.result.tai,34);assert.equal(r.game.result.forcedCaishen,true);assert.deepEqual(r.game.scores,[0,0,0]);assert.throws(()=>discard(r,0,r.game.hands[0][0].uid),/不能出牌/);assert.throws(()=>selfAction(r,0,'hu'),/不能操作/);
});
test('3+1正常成牌计全部正常台数再加17再翻，不重复翻倍',()=>{
  const r=forcedRoom(true);r.game.flowers[0]=tiles([34,35,36,37]);draw(r,0);const normal=basicTai(r,0,true,true).reduce((sum,x)=>sum+x.tai,0);assert.equal(r.game.result.baseTai,normal+17);assert.equal(r.game.result.tai,(normal+17)*2);
  const tais=[...r.game.result.tais];confirmSettlement(r,tais);assert.equal(r.game.result.tai,tais[0]);assert.equal(r.game.scores.reduce((a,b)=>a+b,0),0);assert.throws(()=>confirmSettlement(r,tais),/不能确认/);
});
test('补花摸齐财神也立即推牌；花财神按原来的组别匹配',()=>{
  const r=forcedRoom();r.game.wall=[...tiles([34]),...tiles(Array(30).fill(5)),...tiles([8])];draw(r,0);assert.equal(r.game.result.tai,34);assert.equal(r.game.flowers[0][0].id,34);
  const f=room();f.game.indicators=tiles([34,8]);f.game.hands[0]=tiles([35,36,37,...unformed]);f.game.wall=[...tiles([8]),...tiles(Array(30).fill(5))];draw(f,0);assert.equal(f.game.result.tai,34);
});
test('暗杠补牌触发3+1正常成牌时包含杠和杠上开花台数',()=>{
  const r=room();r.game.hands[0]=tiles([0,0,0,0,7,7,7,1,2,3,9,10,11,18,19,20,27]);r.game.wall=[...tiles(Array(30).fill(5)),...tiles([8])];selfAction(r,0,'gang',0);
  assert.equal(r.game.phase,'result');assert.equal(r.game.result.forcedCaishen,true);assert.equal(r.game.result.items.find(x=>x.name==='杠上开花').tai,3);const normal=basicTai(r,0,true,true).reduce((sum,x)=>sum+x.tai,0);assert.equal(r.game.result.tai,(normal+3+17)*2);
});
test('明杠补牌强推后不覆盖结果状态',()=>{
  const r=room();r.game.hands[2]=tiles([0,0,0,7,7,7,1,2,3,9,10,11,18,19,20,27]);const tile=tiles([0])[0];r.game.lastDiscarder=0;r.game.lastDiscard=tile;r.game.discards[0]=[tile];r.game.prompt={seat:2,type:'minggang'};r.game.wall=[...tiles(Array(30).fill(5)),...tiles([8])];claim(r,2,'minggang');assert.equal(r.game.phase,'result');assert.equal(r.game.result.winner,2);assert.equal(r.game.result.items.find(x=>x.name==='杠上开花').tai,3);
});
test('三人轮转、碰牌顺序、风位和结算无第四个座位',()=>{
  const r=room();r.game.hands=[tiles([0,2]),tiles([6]),tiles([4])];discard(r,0,r.game.hands[0][0].uid);assert.equal(r.game.current,2);assert.equal(r.game.hands[2].length,2);
  r.game.hands=[[],tiles([1,1]),tiles([1,1])];assert.deepEqual(claimQueue(r,0,tiles([1])[0]).map(x=>x.seat),[2,1]);
  assert.deepEqual(calculateSettlement(r,[2,10,5],1),[-20,30,-10]);
  finishWin(r,1,true,null,{specialTai:17,specialLabel:'测试'});assert.equal(r.game.nextDealer,2);assert.throws(()=>confirmSettlement(r,[2,34,5,0]),/3位/);confirmSettlement(r,[2,34,5]);assert.equal(r.game.result.delta.length,3);assert.equal(r.game.scores.reduce((a,b)=>a+b,0),0);
});
test('三人分张每人一次且按逆时针推进；3+1分张不能绕过必推',()=>{
  const r=room();r.game.hands=[0,1,2].map(()=>tiles([0,2,4,6,9,11,13,15,18,20,22,24,27,28,29,30]));r.game.wall=[...tiles([1,3,5]),...tiles(Array(20).fill(10))];runFenZhang(r,2);assert.equal(r.game.wall.length,20);assert.deepEqual(r.game.result.fenTiles.map(x=>x.seat),[2,1,0]);assert.deepEqual(r.game.result.delta,[0,0,0]);assert.equal(r.game.nextDealer,2);
  const f=forcedRoom();f.game.wall=[...tiles([8]),...tiles(Array(22).fill(5))];draw(f,0);assert.equal(f.game.result.tai,34);assert.equal(f.game.result.fenZhang,true);
});
test('四人模式3+1仍可暂不推，原来15台不翻倍',()=>{
  const r=forcedRoom();r.mode='four';draw(r,0);assert.equal(r.game.phase,'playing');selfAction(r,0,'caishen31');assert.equal(r.game.result.tai,15);assert.equal(r.game.result.doubled,false);
});

test('三人未胡牌者不足10台视为0，够10台只与另一未胡牌者结差额',()=>{
  const r=room();
  for(const [others,expected] of [
    [[9,5],[80,-40,-40]],
    [[10,9],[80,-30,-50]],
    [[15,10],[80,-35,-45]],
    [[10,10],[80,-40,-40]],
    [[9,12],[80,-52,-28]],
    [[0,0],[80,-40,-40]]
  ]){
    const tais=[20,...others];assert.deepEqual(calculateSettlement(r,tais,0),expected);assert.deepEqual(tais,[20,...others]);assert.equal(expected.reduce((a,b)=>a+b,0),0);
  }
  // 未胡牌者间涉及庄家，保留原有庄家倍数；不会抵扣胡家应收。
  assert.deepEqual(calculateSettlement(r,[12,20,10],1),[-36,60,-24]);
  assert.deepEqual(calculateSettlement(r,[9,20,10],1),[-60,60,0]);
});
test('三人自动台数保留原始明细，但未胡牌不足10台显示并结算为0',()=>{
  const r=room();r.game.flowers[1]=tiles([34,35,36]);r.game.flowers[2]=tiles([38,39,40,41]);
  finishWin(r,0,true,null,{specialTai:17,specialLabel:'测试胡牌'});
  assert.deepEqual(r.game.result.rawAutoTais,[34,5,10]);assert.deepEqual(r.game.result.autoTais,[34,0,10]);assert.deepEqual(r.game.result.tais,[34,0,10]);
  assert.equal(r.game.result.playerItems[1].reduce((sum,item)=>sum+item.tai,0),5);
  confirmSettlement(r,[34,9,12]);assert.deepEqual(r.game.result.tais,[34,0,12]);assert.deepEqual(r.game.result.delta,[136,-80,-56]);assert.equal(r.game.scores.reduce((a,b)=>a+b,0),0);
});
test('房主将未胡牌台数改为10台时必须计入差额，四人仍保留低台数互付',()=>{
  const r=room();finishWin(r,0,true,null,{specialTai:17,specialLabel:'测试胡牌'});confirmSettlement(r,[34,10,12]);assert.deepEqual(r.game.result.tais,[34,10,12]);assert.deepEqual(r.game.result.delta,[136,-70,-66]);
  const four=room();four.mode='four';assert.deepEqual(calculateSettlement(four,[20,9,5,0],0),[120,-27,-39,-54]);
});
