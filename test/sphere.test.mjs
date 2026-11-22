import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,count} from '../src/actions.js';
import {STEP,tick} from '../src/simulation.js';
import {newSphere,addLayer,addNode,addEdge,addShell,trianglePlan,deleteNode,setOrbit,orbitById,sphereTotals,sendRocket,rocketTarget,advanceSphere,releaseSails} from '../src/sphere.js';
import {skyAt} from '../src/ephemeris.js';
import {bodyOf} from '../src/cluster.js';
import {shareRays} from '../src/orbital-machines.js';
import {decode} from '../src/save.js';

const run=(game,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)tick(game);};

test('轨道参数可编辑，已发射帆保留原倾角和到期时刻',()=>{
  const game=newGame(),sphere=game.dyson;
  releaseSails(game,sphere.orbits[0],3);
  setOrbit(sphere,1,14000,90,34);
  game.elapsed=100;releaseSails(game,sphere.orbits[0],2);
  assert.deepEqual(sphere.cohorts.map(c=>[c.radius,c.tilt,c.expires,c.count]),[[10000,0,5400,3],[14000,90,5500,2]]);
  assert.equal(sphereTotals(sphere).power,180);
  game.elapsed=5400;advanceSphere(game,STEP);
  assert.equal(sphere.expired,3);assert.equal(sphereTotals(sphere).power,72);
});

test('壳面要求闭合、无交叉、不可重复，纬度与层间距随设计检查',()=>{
  const sphere=newSphere(),layer=addLayer(sphere,9000);
  assert.throws(()=>addLayer(sphere,9800),/相隔/);
  assert.throws(()=>addNode(sphere,layer,0,15,0),/纬度/);
  const ids=[[-15,-12],[15,12],[-15,12],[15,-12]].map(([lon,lat])=>addNode(sphere,layer,lon,lat,90).id);
  assert.throws(()=>addShell(sphere,layer,ids),/闭合/);
  ids.forEach((id,i)=>addEdge(sphere,layer,id,ids[(i+1)%4]));
  assert.throws(()=>addShell(sphere,layer,ids),/交叉/);
  const good=addLayer(sphere,13000),shell=trianglePlan(sphere,good,90);
  assert.throws(()=>addShell(sphere,good,shell.nodes.toReversed()),/已规划/);
});

test('最后两个结构点只接收两枚火箭，恢复在途存档仍能合龙并吸收真实帆',()=>{
  const game=newGame(747183,'sandbox'),before=sphereTotals(game.dyson);
  const silo=game.planet.tiles['3,2'],initial=count(silo.input,'small-carrier-rocket');
  run(game,13);assert.equal(game.dyson.flights.length,1);
  assert.equal(sphereTotals(game.dyson).structure,before.structure);
  const restored=decode(JSON.stringify(game));run(game,90);run(restored,90);
  assert.deepEqual(restored,game);
  const after=sphereTotals(game.dyson);
  assert.equal(after.structurePlan,after.structure);assert.equal(after.structure-before.structure,2);
  assert.equal(count(silo.input,'small-carrier-rocket'),initial-2);
  assert.ok(after.cells>0);assert.equal(after.cells,game.dyson.absorbed);
  assert.equal(after.sails+after.cells,game.dyson.launchedSails);
  assert.equal(after.power,after.structure*96+after.sails*36+after.cells*15);
});

test('中途拆除目标报废已发火箭，不能返还整箭或给别的构件重复施工',()=>{
  const game=newGame(),sphere=game.dyson,layer=addLayer(sphere,9000);
  trianglePlan(sphere,layer,90);const target=rocketTarget(sphere);sendRocket(game,target);
  deleteNode(game,layer,target.part.id);game.elapsed=9;const resumed=decode(JSON.stringify(game));
  advanceSphere(resumed,STEP);assert.equal(resumed.dyson.flights.length,0);assert.equal(sphereTotals(resumed.dyson).structure,0);assert.equal(sphere.launchedRockets,1);
});

test('接收站按请求比例分配，供给不足时两站总请求不能超发',()=>{
  const game=newGame(),sphere=game.dyson;
  releaseSails(game,orbitById(sphere,1),100);
  const station=()=>({x:0,y:0,input:{},output:{},mode:'power',continuous:0,lensTime:0,received:0});
  const a=station(),b=station();shareRays(game,[{sky:skyAt(game,bodyOf(game,'home')),receivers:[a,b]}],STEP);
  assert.equal(sphere.receivedKW,3600);assert.equal(a.received,b.received);
  assert.ok(a.received+b.received>0 && a.received+b.received<sphere.receivedKW);
});

test('首版存档补空恒星，损坏的引用和重复订单在读档前拒绝',()=>{
  const old=newGame();delete old.dyson;old.version=1;
  const migrated=decode(JSON.stringify(old));assert.equal(migrated.version,14);assert.deepEqual(migrated.dyson,newSphere());
  const bad=newGame(9,'sandbox');bad.dyson.layers[0].shells[0].borders[0]=9999;
  assert.throws(()=>decode(JSON.stringify(bad)),/戴森球存档/);
  const mismatch=newGame(9,'sandbox');mismatch.dyson.layers[0].edges[0].ordered=1;
  assert.throws(()=>decode(JSON.stringify(mismatch)),/戴森球存档/);
});
