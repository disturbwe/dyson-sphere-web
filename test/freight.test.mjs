import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,remove} from '../src/actions.js';
import {tick,STEP} from '../src/simulation.js';
import {tickFreight} from '../src/freight.js';
import {setSlotItem,setSlotRule,setPort,exchangeFleet} from '../src/stations.js';
import {decode} from '../src/save.js';
import {count} from '../src/stock.js';

const item='titanium-ore';
function route(){
  const game=newGame(747183,'freight');
  return {game,hub:game.planet.tiles['-3,3'],depot:game.planet.tiles['2,-1'],supplier:game.space.parked.inner.tiles['-1,-4']};
}
function physicalTotal(game){
  let total=count(game.bag,item);
  for(const planet of [game.planet,...Object.values(game.space.parked)]){
    for(const t of Object.values(planet.tiles))total+=count(t.input,item)+count(t.output,item)+Number(t.cargo===item);
  }
  // 交货返航的空船已经卸货，需求方取货时封存的仓位只计货单一次。
  return total+game.freight.trips.filter(f=>f.item===item&&(f.collect||!f.back)).reduce((n,f)=>n+f.amount,0);
}
function stepSeconds(game,seconds){for(let n=0;n<Math.round(seconds/STEP);n++)tick(game);}
test('跨星取货保留真实仓位和飞船，读档后矿石总量及末端收货一致',()=>{
  const {game,hub,depot,supplier}=route();const initial=physicalTotal(game);
  stepSeconds(game,3);
  assert.equal(hub.station.awayVessel,2);assert.equal(hub.station.slots[0].incoming,400);assert.equal(supplier.station.slots[0].held,400);
  assert.throws(()=>exchangeFleet(game,hub,'vessel',-1),/停靠/);assert.throws(()=>remove(game,hub),/返航/);
  assert.throws(()=>setSlotRule(game,hub,0,'limit',399),/等待航班完成/);
  const copy=decode(JSON.stringify(game));
  stepSeconds(game,277);stepSeconds(copy,277);
  assert.deepEqual(game,copy);assert.equal(physicalTotal(game),initial+count(game.stats.mined,item));
  assert.ok(game.planet.tiles['5,1'].output[item]>0);assert.ok(count(game.freight.delivered,item)>=400);assert.ok(depot.station.energy>=0);
});
test('供应方派货在去程结束时入仓，空载返程仍占运力，已使用仓位不能移除',()=>{
  const {game,hub,depot,supplier}=route();hub.station.vessels=0;supplier.station.vessels=1;depot.station.drones=0;
  tickFreight(game,STEP);assert.equal(game.freight.trips.length,1);
  const trip=game.freight.trips[0];assert.equal(trip.collect,false);assert.equal(supplier.station.slots[0].held,0);
  setSlotRule(game,hub,0,'remote','storage');
  while(!trip.back)tickFreight(game,STEP);
  assert.equal(count(hub.output,item),200);assert.equal(hub.station.slots[0].incoming,0);assert.equal(supplier.station.awayVessel,1);
  assert.throws(()=>setSlotItem(game,hub,0,'stone'),/返航/);
  while(game.freight.trips.length)tickFreight(game,STEP);
  assert.equal(supplier.station.awayVessel,0);assert.equal(game.freight.delivered[item],200);
});
test('远程跃迁在双程补给后起运，关闭强制跃迁允许常规飞行',()=>{
  const {game,hub}=route();game.techs.push('logistics-carrier-engine-4');hub.station.warpAU=.5;hub.station.warpers=1;
  tickFreight(game,STEP);assert.equal(game.freight.trips.length,0);
  hub.station.warpers=2;game.freight.untilDispatch=0;tickFreight(game,STEP);
  assert.ok(game.freight.trips[0].warped);assert.equal(hub.station.warpers,0);
  hub.station.requireWarp=false;game.freight.untilDispatch=0;tickFreight(game,STEP);
  const conventional=game.freight.trips[1];assert.equal(conventional.warped,false);assert.ok(conventional.leg>game.freight.trips[0].leg);
});
test('空仓位改物料同步清除出口，断裂清单与虚增运力均拒绝导入',()=>{
  const {game,hub,depot}=route();setPort(depot,0,item);setSlotItem(game,depot,0,'iron-ore');assert.equal(depot.station.exitItems[0],null);
  assert.throws(()=>setSlotRule(game,depot,0,'remote','demand'),/供需/);
  tickFreight(game,STEP);let damaged=structuredClone(game);damaged.freight.trips[0].source='home/0,0';
  assert.throws(()=>decode(JSON.stringify(damaged)),/物流存档/);
  damaged=structuredClone(game);damaged.planet.tiles['-3,3'].station.awayVessel++;assert.throws(()=>decode(JSON.stringify(damaged)),/物流存档/);
  assert.throws(()=>setSlotItem(game,hub,0,'stone'),/返航/);
});
