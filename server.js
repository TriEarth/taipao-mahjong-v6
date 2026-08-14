'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map();
const TILE_NAMES = ['一万','二万','三万','四万','五万','六万','七万','八万','九万','一筒','二筒','三筒','四筒','五筒','六筒','七筒','八筒','九筒','一索','二索','三索','四索','五索','六索','七索','八索','九索','东风','南风','西风','北风','红中','发财','白板','春','夏','秋','冬','梅','兰','菊','竹'];
const WINDS = ['东','南','西','北'];
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain; charset=utf-8'};
const uid = () => crypto.randomBytes(12).toString('hex');
const roomCode = () => { let c; do c = String(Math.floor(100000 + Math.random()*900000)); while(rooms.has(c)); return c; };
const shuffle = a => { for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a; };
const sortTiles = a => a.sort((x,y)=>x.id-y.id || x.uid.localeCompare(y.uid));
const isBonusId = id => id === 33 || id >= 34;
const isHonorOrFlower = id => id >= 27;
const makeTile = (id,n) => ({id,uid:`${id}-${n}-${uid().slice(0,5)}`});
const makeWall = () => shuffle([...Array(34)].flatMap((_,id)=>[0,1,2,3].map(n=>makeTile(id,n))).concat([...Array(8)].map((_,i)=>makeTile(34+i,0))));
const seatWindIndex = (dealer,seat) => (dealer-seat+4)%4;

function caishenMatches(id, indicators){
  return indicators.some(t => t.id < 34 ? t.id === id : (id >= 34 && Math.floor((id-34)/4) === Math.floor((t.id-34)/4)));
}
function caishenKey(id){return id<34?`tile-${id}`:`flower-${Math.floor((id-34)/4)}`;}
function caishenTypes(indicators){const seen=new Set();return indicators.filter(t=>{const key=caishenKey(t.id);if(seen.has(key))return false;seen.add(key);return true;});}
function sameCaishenIndicators(indicators){return indicators.length===2&&caishenKey(indicators[0].id)===caishenKey(indicators[1].id);}
function caishenCounts(hand,indicators){return caishenTypes(indicators).map(indicator=>hand.filter(t=>caishenKey(t.id)===caishenKey(indicator.id)).length);}
function specialCaishenPattern(hand,indicators){
  if(indicators.length!==2||sameCaishenIndicators(indicators))return null;
  const counts=caishenCounts(hand,indicators).sort((a,b)=>a-b);
  if(counts[0]===1&&counts[1]===3)return {type:'caishen31',label:'3+1 财神胡',tai:15};
  return null;
}
function doubleCaishenWin(hand,indicators){return sameCaishenIndicators(indicators)&&hand.filter(t=>caishenMatches(t.id,indicators)).length===2?{type:'doubleCaishenHu',label:'双财神胡',tai:15}:null;}
function sortHand(hand,indicators){return hand.sort((a,b)=>Number(!caishenMatches(a.id,indicators))-Number(!caishenMatches(b.id,indicators))||a.id-b.id||a.uid.localeCompare(b.uid));}
const needsReplacement = (tile,indicators) => isBonusId(tile.id) && !caishenMatches(tile.id,indicators);
function splitCounts(hand, indicators){
  const c=Array(33).fill(0);let wild=0;
  hand.forEach(t=>{ if(caishenMatches(t.id,indicators)) wild++; else if(t.id<33)c[t.id]++; });
  return {c,wild};
}
function canWin(hand, meldCount, indicators){
  if(hand.some(t=>needsReplacement(t,indicators)))return false;
  const needed=5-meldCount;if(hand.length!==needed*3+2)return false;
  const {c,wild}=splitCounts(hand,indicators);
  const memo=new Map();
  function melds(counts,w,left){
    const key=counts.join('')+'|'+w+'|'+left;if(memo.has(key))return memo.get(key);
    if(left===0){const ok=counts.every(n=>n===0);memo.set(key,ok);return ok;}
    const i=counts.findIndex(n=>n>0);
    if(i<0){const ok=w>=left*3;memo.set(key,ok);return ok;}
    const same=Math.min(3,counts[i]),need=3-same;
    if(need<=w){counts[i]-=same;if(melds(counts,w-need,left-1)){counts[i]+=same;memo.set(key,true);return true}counts[i]+=same;}
    if(i<27&&i%9<=6){let needSeq=0;const used=[];for(const x of [i,i+1,i+2]){if(counts[x]){counts[x]--;used.push(x)}else needSeq++;}
      if(needSeq<=w&&melds(counts,w-needSeq,left-1)){used.forEach(x=>counts[x]++);memo.set(key,true);return true}used.forEach(x=>counts[x]++);
    }
    memo.set(key,false);return false;
  }
  for(let i=0;i<33;i++)if(c[i]){const use=Math.min(2,c[i]),need=2-use;if(need<=wild){c[i]-=use;if(melds(c,wild-need,needed)){c[i]+=use;return true}c[i]+=use;}}
  return wild>=2 && melds(c,wild-2,needed);
}
function makeRoom(hostName,token){
  const code=roomCode();const room={code,hostToken:token,phase:'lobby',players:[],clients:new Map(),game:null,created:Date.now()};
  room.players.push({token,name:cleanName(hostName),score:0,connected:true});rooms.set(code,room);return room;
}
function makeSoloRoom(hostName,token){
  const room=makeRoom(hostName,token);room.solo=true;
  ['阿炮','小台','财神'].forEach((name,i)=>room.players.push({token:`bot-${room.code}-${i}`,name,score:0,connected:true,bot:true}));
  startGame(room);return room;
}
function addBot(room,token){
  if(room.hostToken!==token)throw Error('只有房主能添加电脑玩家');
  if(room.phase!=='lobby')throw Error('牌局开始后不能添加电脑玩家');
  if(room.players.length>=4)throw Error('四个座位已经坐满');
  const used=new Set(room.players.map(p=>p.name)),base=['阿炮','小台','财神','牌搭子'];
  const name=base.find(n=>!used.has(n))||`电脑${room.players.filter(p=>p.bot).length+1}`;
  room.players.push({token:`bot-${room.code}-${uid()}`,name,score:0,connected:true,bot:true});
  broadcast(room);return room.players.at(-1);
}
function cleanName(n){return String(n||'麻友').trim().slice(0,10)||'麻友'}
function playerSeat(room,token){return room.players.findIndex(p=>p.token===token)}
function log(room,text){const g=room.game;if(!g)return;g.logs.unshift({text,time:Date.now()});g.logs=g.logs.slice(0,12)}
function replaceFlowers(room,seat){
  const g=room.game,p=g.hands[seat];let guard=0;
  while(guard++<30){const i=p.findIndex(t=>needsReplacement(t,g.indicators));if(i<0)break;const f=p.splice(i,1)[0];g.flowers[seat].push(f);const t=g.wall.pop();if(t)p.push(t);}
}
function takeIndicator(wall){const tile=wall.pop();if(!tile)throw Error('牌墙中没有可用财神牌');return tile;}
function startGame(room){
  if(room.players.length!==4)throw Error('需要四位玩家到齐');
  const old=room.game,dealer=old?old.nextDealer:0,round=old?old.nextRound:1,scores=old?old.scores:[0,0,0,0];
  const wall=makeWall();
  // 台炮：开牌位置反方向两张公开，作为本局财神牌面。
  // 任意牌都可能开作财神；花牌财神按春夏秋冬/梅兰菊竹同组匹配。
  const indicators=[takeIndicator(wall),takeIndicator(wall)];
  const g=room.game={wall,indicators,hands:[[],[],[],[]],melds:[[],[],[],[]],flowers:[[],[],[],[]],discards:[[],[],[],[]],scores,
    dealer,round,gameId:uid(),current:dealer,phase:'playing',prompt:null,lastDiscard:null,lastDiscarder:null,drawnUid:null,logs:[],winner:null,nextDealer:dealer,nextRound:round,openingFourWhites:[false,false,false,false],winContext:[null,null,null,null],visualSeq:0,visualEvents:[]};
  for(let pass=0;pass<17;pass++)for(let s=0;s<4;s++)if(pass<16+(s===dealer?1:0))g.hands[s].push(g.wall.shift());
  for(let s=0;s<4;s++)g.openingFourWhites[s]=g.hands[s].filter(t=>t.id===33).length===4;
  for(let s=0;s<4;s++){replaceFlowers(room,s);sortHand(g.hands[s],g.indicators);}
  room.phase='playing';log(room,`第 ${round} 局开始，${room.players[dealer].name} 坐庄`);log(room,`公开双财神：${indicators.map(t=>TILE_NAMES[t.id]).join('、')}`);broadcast(room);
  scheduleBots(room);
}
function recordVisual(g,type,seat,extra={}){
  const event={id:++g.visualSeq,type,seat,...extra};g.visualEvents.push(event);g.visualEvents=g.visualEvents.slice(-24);return event;
}
function draw(room,seat,tail=false){
  const g=room.game;if(g.wall.length<=24){runFenZhang(room,seat);return null;}
  if(!tail)g.winContext[seat]=null;
  let t=tail?g.wall.pop():g.wall.shift();if(!t){endDraw(room);return null;}
  if(needsReplacement(t,g.indicators)){g.flowers[seat].push(t);recordVisual(g,'flower',seat,{tile:t});log(room,`${room.players[seat].name} 补花 ${TILE_NAMES[t.id]}`);return draw(room,seat,true);}
  g.hands[seat].push(t);g.drawnUid=t.uid;recordVisual(g,'draw',seat);return t;
}
function ownActions(room,seat){
  const g=room.game;if(g.phase!=='playing'||g.prompt||g.current!==seat)return [];
  const a=[],doubleWin=doubleCaishenWin(g.hands[seat],g.indicators),special=specialCaishenPattern(g.hands[seat],g.indicators);if(doubleWin)a.push(doubleWin);if(special)a.push(special);if(canWin(g.hands[seat],g.melds[seat].length,g.indicators))a.push({type:'hu',label:'自摸'});
  const c=Array(33).fill(0);g.hands[seat].forEach(t=>{if(t.id<33&&!caishenMatches(t.id,g.indicators))c[t.id]++});
  c.forEach((n,id)=>{if(n===4)a.push({type:'gang',id,label:`暗杠 ${TILE_NAMES[id]}`});});
  g.melds[seat].filter(m=>m.type==='碰').forEach(m=>{const id=m.tiles[0].id;if(g.hands[seat].some(t=>t.id===id&&!caishenMatches(t.id,g.indicators)))a.push({type:'bugang',id,label:`补杠 ${TILE_NAMES[id]}`});});return a;
}
function claimQueue(room,from,tile){
  const g=room.game,q=[];
  for(let d=1;d<4;d++){const s=(from-d+4)%4,h=[...g.hands[s],tile];if(canWin(h,g.melds[s].length,g.indicators))q.push({seat:s,type:'hu',label:'胡'});}
  for(let d=1;d<4;d++){const s=(from-d+4)%4,count=g.hands[s].filter(t=>t.id===tile.id&&!caishenMatches(t.id,g.indicators)).length;if(count>=3)q.push({seat:s,type:'minggang',label:'杠'});if(count>=2)q.push({seat:s,type:'peng',label:'碰'});}
  return q;
}
function nextPromptOrTurn(room){
  const g=room.game;if(g.claimQueue&&g.claimQueue.length){g.prompt=g.claimQueue.shift();broadcast(room);return;}
  g.prompt=null;g.claimQueue=[];g.current=(g.lastDiscarder+3)%4;const t=draw(room,g.current);if(!t)return;log(room,`逆时针轮到 ${room.players[g.current].name}`);broadcast(room);
}
function discard(room,seat,tileUid){
  const g=room.game;if(g.phase!=='playing'||g.prompt||g.current!==seat)throw Error('现在不能出牌');
  const i=g.hands[seat].findIndex(t=>t.uid===tileUid);if(i<0)throw Error('找不到这张牌');
  if(needsReplacement(g.hands[seat][i],g.indicators))throw Error('这张白板或花牌必须补牌，不能打出');
  const t=g.hands[seat].splice(i,1)[0];g.discards[seat].push(t);g.lastDiscard=t;g.lastDiscarder=seat;g.drawnUid=null;recordVisual(g,'discard',seat,{tileUid:t.uid});log(room,`${room.players[seat].name} 打出 ${TILE_NAMES[t.id]}`);
  sortHand(g.hands[seat],g.indicators);g.winContext[seat]=null;
  g.claimQueue=claimQueue(room,seat,t);nextPromptOrTurn(room);
}
function removeSame(hand,id,n){const out=[];for(let k=0;k<n;k++){const i=hand.findIndex(t=>t.id===id);if(i<0)throw Error('牌数不足');out.push(hand.splice(i,1)[0]);}return out;}
function claim(room,seat,type){
  const g=room.game,p=g.prompt;if(!p||p.seat!==seat)throw Error('现在不需要你响应');
  if(type==='pass'){g.prompt=null;if(g.pendingBuGang){if(g.claimQueue.length){g.prompt=g.claimQueue.shift();broadcast(room)}else completeBuGang(room);return;}nextPromptOrTurn(room);return;}
  if(type!==p.type)throw Error('无效操作');
  if(g.pendingBuGang){if(type!=='hu')throw Error('补杠时只能抢杠胡或过');const pending=g.pendingBuGang,source=g.hands[pending.seat],i=source.findIndex(x=>x.uid===pending.tile.uid);if(i<0)throw Error('补杠牌已不存在');source.splice(i,1);g.hands[seat].push(pending.tile);g.pendingBuGang=null;g.claimQueue=[];g.prompt=null;finishWin(room,seat,false,pending.seat,{robKong:true});return;}
  const from=g.lastDiscarder,t=g.lastDiscard;g.discards[from].pop();g.claimQueue=[];g.prompt=null;
  if(type==='hu'){g.hands[seat].push(t);finishWin(room,seat,false,from);return;}
  if(type==='peng'){g.melds[seat].push({type:'碰',tiles:[...removeSame(g.hands[seat],t.id,2),t]});}
  if(type==='minggang'){g.melds[seat].push({type:'明杠',tiles:[...removeSame(g.hands[seat],t.id,3),t]});draw(room,seat,true);g.winContext[seat]={gangBloom:true};}
  g.current=seat;g.lastDiscard=null;g.lastDiscarder=null;log(room,`${room.players[seat].name} ${type==='peng'?'碰':'杠'} ${TILE_NAMES[t.id]}`);broadcast(room);
}
function selfAction(room,seat,type,id){
  const g=room.game;if(g.current!==seat||g.prompt)throw Error('现在不能操作');
  if(type==='doubleCaishenHu'){const special=doubleCaishenWin(g.hands[seat],g.indicators);if(!special)throw Error('当前不符合双财神胡牌');finishWin(room,seat,true,null,{specialTai:special.tai,specialLabel:special.label});return;}
  if(type==='caishen31'){const special=specialCaishenPattern(g.hands[seat],g.indicators);if(!special)throw Error('当前不符合3+1财神胡牌');const normal=canWin(g.hands[seat],g.melds[seat].length,g.indicators);finishWin(room,seat,true,null,normal?{extraSpecialTai:15,specialLabel:'3+1财神成牌'}:{specialTai:15,specialLabel:special.label});return;}
  if(type==='hu'){if(!canWin(g.hands[seat],g.melds[seat].length,g.indicators))throw Error('当前不能胡');finishWin(room,seat,true,null,g.winContext[seat]||{});return;}
  if(type==='gang'){const tiles=removeSame(g.hands[seat],Number(id),4);if(tiles.some(t=>caishenMatches(t.id,g.indicators)))throw Error('财神不能杠');g.melds[seat].push({type:'暗杠',tiles});log(room,`${room.players[seat].name} 暗杠 ${TILE_NAMES[id]}`);draw(room,seat,true);g.winContext[seat]={gangBloom:true};broadcast(room);return;}
  if(type==='bugang'){const meldIndex=g.melds[seat].findIndex(x=>x.type==='碰'&&x.tiles[0].id===Number(id)),i=g.hands[seat].findIndex(t=>t.id===Number(id)&&!caishenMatches(t.id,g.indicators));if(meldIndex<0||i<0)throw Error('当前不能补杠');const tile=g.hands[seat][i],queue=[];for(let d=1;d<4;d++){const s=(seat-d+4)%4;if(canWin([...g.hands[s],tile],g.melds[s].length,g.indicators))queue.push({seat:s,type:'hu',label:'抢杠胡'});}if(queue.length){g.pendingBuGang={seat,meldIndex,tile};g.claimQueue=queue;g.prompt=g.claimQueue.shift();log(room,`${room.players[seat].name} 准备补杠 ${TILE_NAMES[id]}`);broadcast(room);}else completeBuGang(room,{seat,meldIndex,tile});return;}
  throw Error('未知操作');
}
function completeBuGang(room,pending=room.game.pendingBuGang){const g=room.game;if(!pending)throw Error('没有待完成的补杠');const i=g.hands[pending.seat].findIndex(t=>t.uid===pending.tile.uid),m=g.melds[pending.seat][pending.meldIndex];if(i<0||!m)throw Error('补杠状态已失效');m.tiles.push(g.hands[pending.seat].splice(i,1)[0]);m.type='补杠';g.pendingBuGang=null;g.prompt=null;g.claimQueue=[];g.current=pending.seat;log(room,`${room.players[pending.seat].name} 补杠 ${TILE_NAMES[pending.tile.id]}`);draw(room,pending.seat,true);g.winContext[pending.seat]={gangBloom:true};broadcast(room);}
function basicTai(room,seat,isWinner,selfDraw){
  const g=room.game,hand=g.hands[seat],all=[...hand,...g.melds[seat].flatMap(m=>m.tiles)],wilds=hand.filter(t=>caishenMatches(t.id,g.indicators)),items=[];
  const ladder=(n,opening=false)=>opening&&n===4?15:[0,1,3,5,10][Math.min(4,n)]||0;
  const types=caishenTypes(g.indicators);
  if(sameCaishenIndicators(g.indicators)){
    const count=wilds.length,tai=count===1?7:count>=2?15:0;if(tai)items.push({name:`同牌财神 × ${count}`,tai});
  }else for(const indicator of types){
    const count=hand.filter(t=>caishenKey(t.id)===caishenKey(indicator.id)).length;if(!count)continue;
    const special=isHonorOrFlower(indicator.id),table=special?[0,3,7,11]:[0,2,5,8];items.push({name:`${special?'字牌/白板/花牌':'普通牌'}财神 × ${count}`,tai:table[Math.min(3,count)]});
  }
  const whites=g.flowers[seat].filter(t=>t.id===33).length,whiteTai=ladder(whites,!!g.openingFourWhites?.[seat]);if(whiteTai)items.push({name:`白板 × ${whites}${g.openingFourWhites?.[seat]?'（起手）':''}`,tai:whiteTai});
  const redFlowers=g.flowers[seat].filter(t=>t.id>=34&&t.id<=37).length,redFlowerTai=ladder(redFlowers);if(redFlowerTai)items.push({name:`红花 × ${redFlowers}`,tai:redFlowerTai});
  const blackFlowers=g.flowers[seat].filter(t=>t.id>=38).length,blackFlowerTai=ladder(blackFlowers);if(blackFlowerTai)items.push({name:`黑花 × ${blackFlowers}`,tai:blackFlowerTai});
  const ownWind=27+((g.dealer-seat+4)%4),counts=Array(34).fill(0);all.forEach(t=>{if(t.id<34&&!caishenMatches(t.id,g.indicators))counts[t.id]++});
  for(const id of [31,32,ownWind])if(counts[id]>=3)items.push({name:`${TILE_NAMES[id]}刻子`,tai:1});
  g.melds[seat].forEach(m=>{if(!m.type.includes('杠'))return;const id=m.tiles[0].id,special=id===31||id===32||id===ownWind,dark=m.type==='暗杠';items.push({name:m.type+' · '+TILE_NAMES[id],tai:dark?(special?5:4):(special?4:3)});});
  if(isWinner&&!g.melds[seat].length&&!wilds.length&&!g.flowers[seat].length)items.push({name:'清牌（无碰杠财神花白板）',tai:15});
  if(isWinner&&selfDraw)items.push({name:'自摸',tai:1});
  if(isWinner){
    if(!wilds.length)items.push({name:'无财神胡牌',tai:5});
    const ids=all.filter(t=>t.id<33&&!caishenMatches(t.id,g.indicators)).map(t=>t.id),suits=new Set(ids.filter(x=>x<27).map(x=>Math.floor(x/9))),honor=ids.some(x=>x>=27);
    if(suits.size===1&&!honor)items.push({name:'清一色',tai:15});else if(suits.size===1&&honor)items.push({name:'混一色',tai:7});
    if(canAllTriplets(hand,g.melds[seat].length,g.indicators))items.push({name:'对对胡',tai:7});
    if([27,28,29,30].every(id=>counts[id]>=3))items.push({name:'四家风均为刻子',tai:15});
  }
  return items;
}
function canAllTriplets(hand,meldCount,indicators){
  const needed=5-meldCount;if(hand.length!==needed*3+2)return false;const {c,wild}=splitCounts(hand,indicators);
  for(let pair=0;pair<33;pair++){const counts=[...c],use=Math.min(2,counts[pair]),need=2-use;if(need>wild)continue;counts[pair]-=use;let w=wild-need,ok=true;for(const n of counts){const rem=n%3;if(rem){const fill=3-rem;if(fill>w){ok=false;break}w-=fill}}if(ok&&w%3===0)return true;}
  return wild>=2&&((wild-2)%3===0)&&c.every(n=>n%3===0);
}
function calculateSettlement(room,tais,winner){
  const g=room.game,delta=[0,0,0,0];
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
    const mult=(a===g.dealer||b===g.dealer)?2:1;let high,low,amount;
    if(a===winner||b===winner){high=winner;low=winner===a?b:a;amount=tais[winner];}
    else if(tais[a]===tais[b])continue;else{high=tais[a]>tais[b]?a:b;low=high===a?b:a;amount=Math.abs(tais[a]-tais[b]);}
    amount*=mult;delta[high]+=amount;delta[low]-=amount;
  }
  return delta;
}
function finishWin(room,winner,selfDraw,loser,options={}){
  const g=room.game;g.phase='result';g.winner=winner;const items=options.specialTai?[{name:options.specialLabel,tai:options.specialTai}]:basicTai(room,winner,true,selfDraw);if(options.extraSpecialTai)items.push({name:options.specialLabel,tai:options.extraSpecialTai});if(options.fenZhang)items.push({name:'分张胡牌',tai:3});if(options.gangBloom)items.push({name:'杠上开花',tai:3});if(options.robKong)items.push({name:'抢杠胡',tai:3});const baseTai=Math.max(1,items.reduce((a,x)=>a+x.tai,0)),doubled=false,tai=baseTai;
  const playerItems=room.players.map((_,s)=>s===winner?items:basicTai(room,s,false,false)),autoTais=playerItems.map((list,s)=>s===winner?tai:list.reduce((a,x)=>a+x.tai,0));
  const winLabel=options.specialLabel|| (options.fenZhang?'分张胡牌':selfDraw?'自摸':'胡牌');
  g.result={winner,selfDraw,loser,tai,baseTai,doubled,special:!!options.specialTai,specialLabel:options.specialLabel||null,items,playerItems,autoTais,tais:[...autoTais],confirmed:false,delta:null,fenZhang:!!options.fenZhang,fenTiles:g.fenTiles||[]};g.nextDealer=winner===g.dealer?g.dealer:(g.dealer+3)%4;g.nextRound=winner===g.dealer?g.round:g.round+1;log(room,`${room.players[winner].name} ${winLabel}，等待房主确认台数`);broadcast(room);
}
function confirmSettlement(room,tais){
  const g=room.game,r=g?.result;if(!r||r.draw||r.confirmed)throw Error('当前不能确认结算');if(!Array.isArray(tais)||tais.length!==4)throw Error('需要填写四位玩家台数');const clean=tais.map(n=>Math.max(0,Math.min(9999,Math.round(Number(n)))));if(clean.some(n=>!Number.isFinite(n)))throw Error('台数必须是数字');const delta=calculateSettlement(room,clean,r.winner);delta.forEach((d,i)=>g.scores[i]+=d);r.tais=clean;r.tai=clean[r.winner];r.delta=delta;r.confirmed=true;log(room,`房主确认台数，筹码结算完成`);broadcast(room);return r;
}
function runFenZhang(room,startSeat){
  const g=room.game;if(g.phase==='result'||g.phase==='fenzhang')return;g.phase='fenzhang';g.prompt=null;g.claimQueue=[];g.fenTiles=[];log(room,'牌山进入分张：四家依次摸最后四张分张牌');
  for(let d=0;d<4;d++){
    const seat=(startSeat-d+4)%4,t=g.wall.shift();if(!t)break;g.hands[seat].push(t);recordVisual(g,'draw',seat);sortHand(g.hands[seat],g.indicators);g.fenTiles.push({seat,tile:t});log(room,`${room.players[seat].name} 摸分张牌 ${TILE_NAMES[t.id]}`);
    if(canWin(g.hands[seat],g.melds[seat].length,g.indicators)){finishWin(room,seat,true,null,{fenZhang:true});return;}
  }
  endDraw(room,{fenZhang:true});
}
function endDraw(room,options={}){const g=room.game;g.phase='result';g.result={draw:true,delta:[0,0,0,0],fenZhang:!!options.fenZhang,fenTiles:g.fenTiles||[]};g.nextDealer=(g.dealer+3)%4;g.nextRound=g.round+1;log(room,options.fenZhang?'四家分张均未胡，牌局流局':'黄牌，本局不结算');broadcast(room);}

function scheduleBots(room){
  if(room.phase!=='playing'||!room.game||!room.players.some(p=>p.bot)||room.botTimer)return;
  room.botTimer=setTimeout(()=>{
    room.botTimer=null;const g=room.game;if(!g||g.phase!=='playing')return;
    try{
      if(g.prompt){const seat=g.prompt.seat;if(!room.players[seat]?.bot)return;claim(room,seat,g.prompt.type);scheduleBots(room);return;}
      const seat=g.current;if(!room.players[seat]?.bot)return;
      const actions=ownActions(room,seat),hu=actions.find(a=>a.type==='doubleCaishenHu'||a.type==='caishen31'||a.type==='hu'),gang=actions.find(a=>a.type==='gang'||a.type==='bugang');
      if(hu)selfAction(room,seat,hu.type);else if(gang)selfAction(room,seat,gang.type,gang.id);else{
        const candidates=g.hands[seat].filter(t=>!caishenMatches(t.id,g.indicators));
        const tile=candidates[Math.floor(Math.random()*candidates.length)]||g.hands[seat][0];discard(room,seat,tile.uid);
      }
      scheduleBots(room);
    }catch(e){log(room,`电脑玩家操作跳过：${e.message}`);broadcast(room);}
  },350);
}

function viewFor(room,token){
  const seat=playerSeat(room,token),g=room.game;
  const base={room:room.code,phase:room.phase,seat,host:room.hostToken===token,solo:!!room.solo,players:room.players.map((p,i)=>({name:p.name,score:g?g.scores[i]:p.score,connected:p.connected,bot:!!p.bot,seat:i,wind:g?seatWindIndex(g.dealer,i):null}))};
  if(!g)return base;
  return {...base,phase:g.phase,dealer:g.dealer,round:g.round,gameId:g.gameId,current:g.current,wallCount:Math.max(0,g.wall.length-24),indicators:g.indicators,
    hand:g.hands[seat]||[],revealedHands:g.phase==='result'?g.hands:null,handCounts:g.hands.map(h=>h.length),melds:g.melds,flowers:g.flowers,discards:g.discards,drawnUid:g.current===seat?g.drawnUid:null,
    prompt:g.prompt&&g.prompt.seat===seat?{type:g.prompt.type,label:g.prompt.label,tile:g.pendingBuGang?.tile||g.lastDiscard}:null,waitingClaim:!!g.prompt&&g.prompt.seat!==seat,
    ownActions:ownActions(room,seat),logs:g.logs,visualEvents:g.visualEvents||[],result:g.phase==='result'?g.result:null};
}
function sendSSE(res,data){res.write(`data: ${JSON.stringify(data)}\n\n`)}
function broadcast(room){for(const [token,set] of room.clients)for(const res of set)sendSSE(res,viewFor(room,token));}
function json(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(Error('请求格式错误'))}});req.on('error',reject)});}
function serveStatic(req,res,u){let file=path.join(PUBLIC,decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(PUBLIC)){res.writeHead(403);return res.end()}fs.stat(file,(e,st)=>{if(e||!st.isFile()){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=86400'});fs.createReadStream(file).pipe(res)});}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try{
    if(req.method==='POST'&&u.pathname==='/api/create'){const b=await readBody(req),token=b.token||uid(),room=makeRoom(b.name,token);return json(res,200,{room:room.code,token});}
    if(req.method==='POST'&&u.pathname==='/api/solo'){const b=await readBody(req),token=uid(),room=makeSoloRoom(b.name,token);return json(res,200,{room:room.code,token});}
    if(req.method==='POST'&&u.pathname==='/api/join'){const b=await readBody(req),room=rooms.get(String(b.room||''));if(!room)throw Error('房间不存在');let token=b.token,seat=playerSeat(room,token);if(seat<0){if(room.phase!=='lobby')throw Error('牌局已经开始');if(room.players.length>=4)throw Error('房间已满');token=uid();room.players.push({token,name:cleanName(b.name),score:0,connected:true});}else room.players[seat].connected=true;broadcast(room);return json(res,200,{room:room.code,token});}
    // Polling transport for proxies that do not support Server-Sent Events (for example Quick Tunnel).
    if(req.method==='GET'&&u.pathname==='/api/state'){const room=rooms.get(u.searchParams.get('room')),token=u.searchParams.get('token');if(!room||playerSeat(room,token)<0)return json(res,404,{error:'Session not found'});room.players[playerSeat(room,token)].connected=true;return json(res,200,viewFor(room,token));}
    if(req.method==='GET'&&u.pathname==='/api/events'){const room=rooms.get(u.searchParams.get('room')),token=u.searchParams.get('token');if(!room||playerSeat(room,token)<0){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');if(!room.clients.has(token))room.clients.set(token,new Set());room.clients.get(token).add(res);room.players[playerSeat(room,token)].connected=true;sendSSE(res,viewFor(room,token));broadcast(room);req.on('close',()=>{room.clients.get(token)?.delete(res);setTimeout(()=>{if(!room.clients.get(token)?.size){const s=playerSeat(room,token);if(s>=0)room.players[s].connected=false;broadcast(room)}},1000)});return;}
    if(req.method==='POST'&&u.pathname==='/api/leave'){const b=await readBody(req),room=rooms.get(b.room),seat=room?playerSeat(room,b.token):-1;if(!room||seat<0)return json(res,200,{ok:true});if(room.hostToken===b.token||room.solo){if(room.botTimer)clearTimeout(room.botTimer);rooms.delete(room.code);}else if(room.phase==='lobby'){room.players.splice(seat,1);}else room.players[seat].connected=false;broadcast(room);return json(res,200,{ok:true});}
    if(req.method==='POST'&&u.pathname==='/api/action'){const b=await readBody(req),room=rooms.get(b.room),seat=room?playerSeat(room,b.token):-1;if(!room||seat<0)throw Error('身份已失效');if(b.type==='addBot')addBot(room,b.token);else if(b.type==='start'){if(room.hostToken!==b.token)throw Error('只有房主能开局');startGame(room)}else if(b.type==='discard')discard(room,seat,b.uid);else if(b.type==='claim')claim(room,seat,b.claim);else if(b.type==='self')selfAction(room,seat,b.action,b.id);else if(b.type==='confirm'){if(room.hostToken!==b.token)throw Error('只有房主能确认台数');confirmSettlement(room,b.tais)}else if(b.type==='next'){if(room.hostToken!==b.token)throw Error('等待房主开下一局');if(room.game?.result&&!room.game.result.draw&&!room.game.result.confirmed)throw Error('请先确认台数并结算筹码');startGame(room)}else throw Error('未知操作');scheduleBots(room);return json(res,200,{ok:true});}
    serveStatic(req,res,u);
  }catch(e){json(res,400,{error:e.message||'操作失败'});}
});
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>{
  const ips=Object.values(os.networkInterfaces()).flat().filter(x=>x&&x.family==='IPv4'&&!x.internal).map(x=>x.address);
  console.log(`\n台炮麻将已启动：\n  本机 http://localhost:${PORT}`);ips.forEach(ip=>console.log(`  局域网 http://${ip}:${PORT}`));console.log('\n按 Ctrl+C 停止服务器。\n');
});

module.exports={server,rooms,canWin,canAllTriplets,caishenMatches,caishenKey,caishenTypes,caishenCounts,sameCaishenIndicators,doubleCaishenWin,specialCaishenPattern,sortHand,isBonusId,makeWall,replaceFlowers,takeIndicator,viewFor,basicTai,calculateSettlement,confirmSettlement,startGame,draw,discard,runFenZhang,makeSoloRoom,addBot,seatWindIndex,ownActions,finishWin,claimQueue,nextPromptOrTurn};
