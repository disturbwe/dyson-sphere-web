import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,put,placeError,remove,siteError} from '../src/actions.js';
import {largeMiner,applyMineConfig,feedMineBelts,receiveMineBelts,minePorts,mineDuty,mineRoom,mineLoad,minePeak,mineConflict} from '../src/advanced-miner.js';
import {tick} from '../src/simulation.js';
import {cargoSize,putCargo,takeCargo} from '../src/belt-cargo.js';
import {count,stockPoints} from '../src/stock.js';
import {decode} from '../src/save.js';
import {captureBlueprint,readBlueprint} from '../src/blueprint.js';
import {scheduleBlueprint} from '../src/construction.js';

const ore='iron-ore',blue='conveyor-belt-3';
const byCell=(g,cell)=>g.planet.tiles[cell];
const step=(g,n)=>{for(let i=0;i<n;i++)tick(g);};

test('九口同时输出、输入同种矿和轮询带口，分垛保留喷点',()=>{
  const g=newGame(),t=put(g,largeMiner,{x:-2,y:2},0);
  assert.equal(t.station.slots[0].item,ore);
  const spots=[[1,-1,0],[1,0,0],[1,1,0],[0,1,1],[-1,1,1],[-2,1,1],[-2,-1,3],[-1,-1,3],[0,-1,3]];
  const belts=spots.map(([x,y,d])=>put(g,blue,{x:t.x+x,y:t.y+y},d));
  const ports=minePorts(g.planet,t);assert.equal(ports.outputs.length,9);
  g.techs.push('logistics-station-integrated-logistics-1','logistics-station-integrated-logistics-2','logistics-station-integrated-logistics-3');
  t.output[ore]=36;feedMineBelts(g,ports);
  assert.deepEqual(belts.map(cargoSize),Array(9).fill(4));assert.equal(count(t.output,ore),0);
  belts.forEach(b=>takeCargo(b,4,false));applyMineConfig(g,t,{stack:1,mode:'storage'});
  // 每次仅有一件时必须轮过所有空口，后面的接口不会因排序固定而永久饥饿。
  for(let i=0;i<9;i++){t.output[ore]=1;feedMineBelts(g,ports);assert.equal(cargoSize(belts[i]),1);takeCargo(belts[i],1,false);}
  const b=belts[0];b.dir=2;putCargo(b,ore,3,9);b.travel=1;
  receiveMineBelts(minePorts(g.planet,t));assert.equal(count(t.output,ore),3);assert.equal(stockPoints(t.output,ore),9);
  putCargo(b,'copper-ore');b.travel=1;receiveMineBelts(minePorts(g.planet,t));assert.equal(b.cargo,'copper-ore');
});

test('仓容包括取货预留，六成之后降速降耗，入满或无矿时按待机耗电',()=>{
  const g=newGame(),t=put(g,largeMiner,{x:-2,y:2},0),slot=t.station.slots[0];
  applyMineConfig(g,t,{speed:300});assert.equal(minePeak(t),26460);
  assert.throws(()=>applyMineConfig(g,t,{speed:255}),/参数/);assert.equal(t.miner.speed,300);
  t.output[ore]=3000;assert.equal(mineDuty(t),1);slot.held=1000;assert.equal(mineDuty(t),.5);
  assert.equal(mineLoad(t,true),(26460+168)/2);slot.held=2000;
  assert.equal(mineRoom(t),0);assert.equal(mineLoad(t,true),168);assert.equal(mineLoad(t,false),168);
  g.techs.push('logistics-carrier-capacity-9');tick(g);assert.equal(slot.limit,6000);
});

test('需求塔提货途中读档，已采矿量与现货、货垛、铁块和货单逐件守恒',()=>{
  const g=newGame(747183,'mining'),t=byCell(g,'-2,2');applyMineConfig(g,t,{speed:300});
  for(let i=0;i<2700&&!g.freight.trips.length;i++)tick(g);
  const trip=g.freight.trips[0];assert.ok(trip.collect&&trip.kind==='drone'&&!trip.back);
  assert.equal(t.station.slots[0].held,trip.amount);assert.throws(()=>remove(g,t),/返航/);
  const bad=structuredClone(g);bad.freight.trips[0].collect=false;assert.throws(()=>decode(JSON.stringify(bad)),/货单/);
  const copy=decode(JSON.stringify(g));step(g,2700);step(copy,2700);assert.deepEqual(copy,g);
  const stored=Object.values(g.planet.tiles).reduce((sum,t)=>sum+count(t.input,ore)+count(t.output,ore)+(t.cargo===ore?cargoSize(t):0),0);
  const held=g.planet.links.reduce((sum,l)=>sum+(l.hand?.item===ore?l.hand.size:0),0);
  assert.equal(g.stats.mined[ore],stored+held+g.stats.made['iron-ingot']+g.freight.trips.reduce((n,f)=>n+f.amount,0));
  assert.ok(g.freight.delivered[ore]>=100);assert.ok(byCell(g,'2,0').output['iron-ingot']>0);
  applyMineConfig(g,t,{speed:200,mode:'storage'});step(g,2400);assert.equal(g.freight.trips.length,0);
  const before=g.freight.delivered[ore];step(g,900);assert.equal(g.freight.delivered[ore],before);
});

test('矿区间距对已建和预建双向生效，旋转蓝图只复制矿机工艺参数',()=>{
  const g=newGame(),t=put(g,largeMiner,{x:-2,y:2},0);
  assert.match(siteError(g,largeMiner,{x:-3,y:2},0),/重叠/);
  assert.match(siteError(g,'planetary-logistics-station',{x:0,y:1},0),/起降/);
  assert.equal(siteError(g,'mining-machine',{x:-3,y:2},0),'');
  assert.match(mineConflict({type:largeMiner,x:-89,y:5,dir:0},{type:largeMiner,x:89,y:5,dir:2}),/重叠/);
  g.techs.push('mass-construction-1');applyMineConfig(g,t,{speed:220,mode:'storage'});t.output[ore]=25;
  const blueprint=readBlueprint(JSON.stringify(captureBlueprint(g,t,t)));
  assert.deepEqual(blueprint.tiles[0].miner,{speed:220,mode:'storage',stack:0});assert.ok(!blueprint.tiles[0].station);
  remove(g,t);assert.equal(count(g.bag,ore),25);
  scheduleBlueprint(g,blueprint,{x:2,y:3},2);assert.match(placeError(g,largeMiner,{x:3,y:3},2),/重叠/);
  const copy=decode(JSON.stringify(g));step(copy,450);
  const copper=byCell(copy,'2,3');assert.equal(copper.station.slots[0].item,'copper-ore');assert.equal(copper.station.slots[0].local,'storage');
  assert.equal(copper.miner.speed,220);assert.deepEqual(copper.output,{});assert.equal(count(copy.bag,ore),25);
});

test('旧版普通矿机格式升级为矿仓，原实物、矿种及进度原样延续',()=>{
  const g=newGame(),t=put(g,largeMiner,{x:-2,y:2},0);t.output[ore]=32;t.progress=.75;
  g.version=13;delete t.station;delete t.miner;
  const loaded=decode(JSON.stringify(g)),after=byCell(loaded,'-2,2');
  assert.equal(after.station.slots[0].item,ore);assert.deepEqual(after.veins,t.veins);assert.deepEqual(after.output,t.output);
  assert.equal(after.progress,.75);assert.equal(after.miner.speed,100);assert.equal(after.station.slots[0].held,0);
});
