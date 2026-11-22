import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,queueCraft,cancelCraft} from '../src/actions.js';
import {tick} from '../src/simulation.js';
import {decode} from '../src/save.js';
import {setSlotRule} from '../src/stations.js';
import {flow,flowReport,recordFlow,validProduction,spans} from '../src/production-log.js';

const run=(game,steps)=>{for(let n=0;n<steps;n++)tick(game);};
function totals(game,planet=game.planet,scope='planet'){
  return flowReport([planet],game.elapsed,0,scope).rows;
}
test('停产后窗口自然归零，百小时后只保留新柱，存档拒绝未来数据',()=>{
  const planet={};recordFlow(planet,1,'iron-ore',flow.made,8);
  recordFlow(planet,60,'iron-ore',flow.used,2);
  assert.deepEqual(flowReport([planet],60,60).rows.get('iron-ore').counts,[8,2,0,0]);
  assert.deepEqual(flowReport([planet],61,60).rows.get('iron-ore').counts,[0,2,0,0]);
  assert.equal(flowReport([planet],121,60).rows.size,0);
  assert.ok(validProduction(planet.production,121));assert.ok(!validProduction(planet.production,1));
  const now=720001;recordFlow(planet,now,'iron-ore',flow.made,3);
  for(const span of spans)assert.deepEqual(flowReport([planet],now,span).rows.get('iron-ore').counts,[3,0,0,0]);
  assert.deepEqual(flowReport([planet],now,0).rows.get('iron-ore').counts,[11,2,0,0]);
  assert.ok(validProduction(planet.production,now));
});
test('双线冶炼的四层喷点只多产铁块，真实总额和十分钟柱形在读档后相同',()=>{
  const game=newGame(747183,'coating');run(game,600);
  const copy=decode(JSON.stringify(game));run(game,4000);run(copy,4000);
  assert.deepEqual(game.planet.production,copy.planet.production);
  const rows=totals(game);assert.equal(rows.get('iron-ingot').counts[0],270);assert.equal(rows.get('iron-ore').counts[1],240);
  const ten=flowReport([game.planet],game.elapsed,600).rows.get('iron-ingot');
  assert.equal([...ten.columns.values()].reduce((sum,column)=>sum+column[0],0),270);assert.equal(ten.counts[0]*60/600,27);
  const damaged=structuredClone(game);damaged.planet.production.items[0]='made-up-material';assert.throws(()=>decode(JSON.stringify(damaged)),/存档/);
});
test('取货船在供应港装船时记出口，返抵需求港记进口，同系运输不增加星系的对外收支',()=>{
  const game=newGame(747183,'freight'),hub=game.planet.tiles['-3,3'];hub.station.vessels=1;
  tick(game);const trip=game.freight.trips[0],item=trip.item;assert.ok(trip.collect);
  setSlotRule(game,hub,0,'remote','storage');const supplier=game.space.parked.inner;
  assert.equal(totals(game,supplier).get(item)?.counts[3]||0,0);
  let steps=0;while(!trip.back&&steps++<10000)tick(game);assert.ok(trip.back);
  assert.equal(totals(game,supplier).get(item).counts[3],trip.amount);assert.equal(totals(game).get(item)?.counts[2]||0,0);
  const copy=decode(JSON.stringify(game));steps=0;
  while(game.freight.trips.includes(trip)&&steps++<10000){tick(game);tick(copy);}
  assert.ok(!game.freight.trips.includes(trip));assert.deepEqual(copy,game);
  assert.equal(totals(game).get(item).counts[2],trip.amount);
  assert.deepEqual(flowReport([supplier,game.planet],game.elapsed,0,'star').rows.get(item).counts.slice(2),[0,0]);
});
test('复制器取消只退预留，最终交付按每张配方计入中间件产消',()=>{
  const game=newGame();game.bag={'iron-ore':10,'copper-ore':5};
  queueCraft(game,'magnetic-coil',5);cancelCraft(game,0);assert.equal(totals(game).size,0);
  const work=queueCraft(game,'magnetic-coil',5);run(game,Math.ceil(work.time*30)+1);
  const rows=totals(game);assert.deepEqual(rows.get('magnet').counts,[10,10,0,0]);assert.deepEqual(rows.get('magnetic-coil').counts,[10,0,0,0]);
  const old=structuredClone(game);delete old.planet.production;
  assert.equal(totals(decode(JSON.stringify(old))).size,0);
});
