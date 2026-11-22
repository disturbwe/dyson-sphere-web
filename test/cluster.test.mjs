import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,place} from '../src/actions.js';
import {starSystem,clusterOf,bodyOf,distanceLY} from '../src/cluster.js';
import {depart,toggleWarp} from '../src/navigation.js';
import {tick,STEP} from '../src/simulation.js';
import {decode} from '../src/save.js';
import {setSlotItem,setSlotRule} from '../src/stations.js';
import {tickFreight} from '../src/freight.js';

function reach(game,condition,seconds){
  for(let step=0;step<seconds/STEP&&!condition();step++)tick(game);
  assert.ok(condition(),'航行须在可推导的时限内完成');
}
test('同种子星团、初始行星标识和致密星专属矿带可重复',()=>{
  const a=newGame(747183,'landing',32), b=newGame(747183,'landing',32);
  assert.deepEqual(clusterOf(a).stars,clusterOf(b).stars);
  assert.equal(clusterOf(a).stars.length,32);
  assert.deepEqual(starSystem(a).map(p=>p.id),['inner','giant','home','outer']);
  const ids=clusterOf(a).stars.flatMap(star=>starSystem(a,star.id).map(p=>p.id));
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(starSystem(a,'s31')[0].biome,'ashen');assert.equal(bodyOf(a,'home').seed,a.seed);
  assert.ok(distanceLY(...clusterOf(a).stars.slice(0,2))<4);
  assert.throws(()=>depart(a,'s1:p0',true),/驱动引擎/);
});
test('曲速中途读档、到站换星及回航只扣两枚翘曲器；留守球继续施工',()=>{
  const g=newGame(747183,'sandbox'),target='s1:p0',initial=g.bag['space-warper'];
  const homeSphere=g.dyson,homePlanet=g.planet;
  depart(g,target,true);assert.throws(()=>toggleWarp(g),/1,000 m/);
  assert.equal(g.bag['space-warper'],initial);
  reach(g,()=>g.space.flight?.warp,12);
  assert.equal(g.bag['space-warper'],initial-1);
  const copy=decode(JSON.stringify(g));
  reach(g,()=>!g.space.flight,120);reach(copy,()=>!copy.space.flight,120);
  assert.deepEqual(copy,g);assert.equal(g.space.current,target);
  assert.equal(g.dyson.layers.length,0);assert.equal(g.space.spheres.s0,homeSphere);
  assert.equal(g.space.parked.home,homePlanet);
  assert.equal(g.dyson.luminosity,clusterOf(g).byId.get('s1').luminosity);
  const newSphere=g.dyson;
  depart(g,'home',true);reach(g,()=>!g.space.flight,120);
  assert.equal(g.bag['space-warper'],initial-2);
  assert.equal(g.dyson,homeSphere);assert.equal(g.planet,homePlanet);assert.equal(g.space.spheres.s1,newSphere);
  assert.deepEqual(decode(JSON.stringify(g)),g);
});
test('跨恒星物流用两枚翘曲器，完成实物交割与空船返航',()=>{
  const g=newGame(747183,'sandbox');g.bag['interstellar-logistics-station']=2;
  const supplier=place(g,'interstellar-logistics-station',{x:0,y:-3});
  setSlotItem(g,supplier,0,'titanium-ore');setSlotRule(g,supplier,0,'remote','supply');supplier.output['titanium-ore']=80;
  depart(g,'s1:p0',true);reach(g,()=>!g.space.flight,120);
  const buyer=place(g,'interstellar-logistics-station',{x:0,y:-3});
  setSlotItem(g,buyer,0,'titanium-ore');setSlotRule(g,buyer,0,'limit',80);setSlotRule(g,buyer,0,'remote','demand');
  Object.assign(buyer.station,{energy:12000,vessels:1,warpers:2,warpAU:1});
  g.freight.untilDispatch=0;tickFreight(g,STEP);
  const trip=g.freight.trips[0];assert.ok(trip.warped&&trip.collect);assert.equal(trip.source,'home/0,-3');
  assert.equal(trip.destination,'s1:p0/0,-3');assert.equal(buyer.station.warpers,0);
  const copy=decode(JSON.stringify(g));reach(g,()=>!g.freight.trips.length,400);reach(copy,()=>!copy.freight.trips.length,400);
  assert.deepEqual(copy,g);assert.equal(buyer.output['titanium-ore'],80);assert.equal(buyer.station.awayVessel,0);
});
