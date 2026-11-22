import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,put,loadMachine,takeOutput,queueCraft,cancelCraft} from '../src/actions.js';
import {newCoater,runCoater,fillCoater} from '../src/coater.js';
import {putCargo,takeCargo,cargoPoints} from '../src/belt-cargo.js';
import {moveStock,moveAll,add,receiveStock,creditPoints,stockPoints} from '../src/stock.js';
import {finishBatch,speedMode,ingredientGrade} from '../src/proliferation.js';
import {recipes} from '../src/catalog.js';
import {decode} from '../src/save.js';
import {tick} from '../src/simulation.js';
import {startResearch,hashWork} from '../src/research.js';
import {tickFreight} from '../src/freight.js';
const blue='proliferator-3', ore='iron-ore', ingot='iron-ingot';
const advance=(game,n)=>{for(let i=0;i<n;i++)tick(game);};

test('自喷蓝剂增加到 75 次，整垛一次结算，断电、重复、异种与满罐均保留实物',()=>{
  const tile={type:'conveyor-belt-1',x:0,y:0,dir:0,power:1};tile.coater=newCoater(tile);
  const game=newGame();receiveStock(game,'bag',blue,10,40);
  assert.equal(fillCoater(game,tile,blue),8);assert.equal(tile.coater.doses,600);assert.equal(game.bag[blue],2);
  putCargo(tile,'coal',4);tile.power=0;runCoater(tile);assert.equal(tile.inc||0,0);
  tile.power=1;runCoater(tile);runCoater(tile);assert.equal(tile.inc,16);assert.equal(tile.coater.doses,596);
  const feed=tile.coater.feed;putCargo(feed,'proliferator-1');feed.travel=1;runCoater(tile);assert.equal(feed.cargo,'proliferator-1');
  assert.equal(cargoPoints(tile,2),8);takeCargo(tile,2);assert.equal(tile.inc,8);
});

test('两条真实产线等量投矿，停档前后的喷点、产出和旁通喷剂完全一致',()=>{
  const game=newGame(747183,'coating');advance(game,600);
  const saved=decode(JSON.stringify(game));advance(game,3900);advance(saved,3900);assert.deepEqual(game,saved);
  const t=game.planet.tiles;
  assert.equal(t['3,0'].output[ingot],150);assert.equal(t['3,2'].output[ingot],120);
  assert.equal(t['1,0'].bonusCycles,30);assert.equal(t['-2,0'].coater.applied,120);assert.equal(t['-2,2'].coater.applied,120);
  assert.ok(t['-2,4'].output[blue]>0);assert.equal(t['3,0'].output[blue],undefined);
  const damaged=JSON.parse(JSON.stringify(game));damaged.planet.tiles['-2,0'].coater.doses=601;
  assert.throws(()=>decode(JSON.stringify(damaged)),/喷涂机/);
});

test('普通背包装填、仓库取回和取消手搓都携带真实喷点，混料按最低档生效',()=>{
  const game=newGame(747183,'foundry');game.bag={};receiveStock(game,'bag',ore,8,32);
  const t=put(game,'storage-1',{x:0,y:-3},0);loadMachine(game,t,ore,3);assert.equal(t.outputPoints[ore],12);
  takeOutput(game,t);assert.equal(game.bagPoints[ore],32);
  queueCraft(game,ingot,2);assert.equal(game.queue[0].reservedPoints[ore],8);cancelCraft(game,0);assert.equal(game.bagPoints[ore],32);
  const m={input:{},output:{},recipe:'circuit-board'},r=recipes[m.recipe];
  receiveStock(m,'input','iron-ingot',32,128);receiveStock(m,'input','copper-ingot',16,16);
  assert.equal(ingredientGrade(m,r.in),1);
  for(let i=0;i<8;i++)finishBatch(game,m,r);
  assert.equal(m.bonusCycles,1);assert.equal(m.output['circuit-board'],18);assert.equal(stockPoints(m.output,'circuit-board'),0);
  m.recipe='conveyor-belt-2';assert.equal(speedMode(m),true);
});

test('实验室用 320 个满点蓝矩阵完成 400 个蓝矩阵的课题，尾批已付额度可以重载',()=>{
  const game=newGame(747183,'landing');game.science.manual=false;game.techs.push('basic-chemical-engineering');
  startResearch(game,'applied-superconductor');const lab=put(game,'matrix-lab',{x:-1,y:0},0);lab.recipe='research';
  receiveStock(lab,'input','electromagnetic-matrix',320,1280);
  hashWork(game,lab.input,40,true);assert.equal(game.research.hash,50);const restored=decode(JSON.stringify(game));
  const t=restored.planet.tiles['-1,0'];hashWork(restored,t.input,57560,true);
  assert.ok(restored.techs.includes('applied-superconductor'));assert.deepEqual(t.input,{});
});

test('跨行星货单按实物保存喷点，需求端收到的矿可以直接投入增产炉',()=>{
  const game=newGame(747183,'freight'),item='titanium-ore';const supply=game.space.parked.inner.tiles['-1,-4'];
  creditPoints(supply,'output',item,supply.output[item]*4);tickFreight(game,1/30);
  assert.equal(game.freight.trips[0].inc,800);const loaded=decode(JSON.stringify(game));
  const hub=loaded.planet.tiles['-3,3'];loaded.planet.tiles['2,-1'].station.drones=0;
  for(let i=0;i<6000&&!hub.output[item];i++)tickFreight(loaded,1/30);
  assert.ok(hub.output[item]>=200);assert.equal(hub.outputPoints[item],hub.output[item]*4);
  const invalid=JSON.parse(JSON.stringify(loaded));invalid.planet.tiles['-3,3'].outputPoints[item]++;
  assert.throws(()=>decode(JSON.stringify(invalid)),/增产点数/);
});
