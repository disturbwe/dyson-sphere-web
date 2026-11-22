import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,place,put,remove} from '../src/actions.js';
import {captureBlueprint,stampLayout,readBlueprint,blueprintBill} from '../src/blueprint.js';
import {scheduleBlueprint,runConstruction,surveyStamp} from '../src/construction.js';
import {cancelWorks} from '../src/construction-orders.js';
import {decode} from '../src/save.js';
import {tick,STEP} from '../src/simulation.js';
import {setSlotItem,setSlotRule,setPort} from '../src/stations.js';
import {savePattern,blueprints,discardPattern} from '../src/blueprint-library.js';

const example=g=>captureBlueprint(g,{x:1,y:0},{x:3,y:0});
const anchor={x:0,y:-4};
const saved=game=>decode(JSON.stringify(game));

test('真实框选保留配方和连接，旋转镜像跨日期线，舍弃离开选区的分拣器',()=>{
  const g=newGame(747183,'blueprint');
  const p=example(g);assert.deepEqual(blueprintBill(p),{'arc-smelter':1,'storage-1':1,'sorter-1':1});
  assert.equal(p.tiles[0].recipe,'iron-ingot');assert.equal(p.links[0].from,0);assert.equal(p.links[0].to,1);
  assert.deepEqual(readBlueprint(JSON.stringify(p)),p);
  const pts=stampLayout(p,{x:-90,y:4},1,true);
  assert.deepEqual(pts.map(n=>[n.x,n.y,n.dir]),[[-90,5,3],[-90,3,3]]);
  put(g,'tesla-tower',{x:89,y:0},0);put(g,'tesla-tower',{x:-90,y:0},0);
  const seam=captureBlueprint(g,{x:89,y:0},{x:-90,y:0});assert.equal(seam.width,2);assert.equal(seam.tiles.length,2);
  assert.equal(captureBlueprint(g,{x:1,y:0},{x:3,y:0},new Set(['3,0'])).links.length,0);
});

test('跨存档复制物流设置时转动四向出口，新的塔没有现货、运力或电量',()=>{
  const g=newGame(747183,'sandbox'),t=put(g,'interstellar-logistics-station',{x:5,y:0},2);
  setSlotItem(g,t,0,'iron-ore');setSlotRule(g,t,0,'remote','demand');setSlotRule(g,t,0,'limit',800);setPort(t,1,'iron-ore');
  t.output['iron-ore']=50;t.station.energy=100;t.station.vessels=2;
  const p=readBlueprint(JSON.stringify(captureBlueprint(g,t,t)));
  assert.equal(p.tiles[0].station.vessels,undefined);assert.equal(p.tiles[0].output,undefined);
  const other=newGame(54827,'sandbox');other.bag[t.type]=1;
  scheduleBlueprint(other,p,anchor,1,true);
  for(let i=0;i<600;i++)runConstruction(other,STEP);
  const dest=other.planet.tiles['0,-4'];assert.deepEqual(dest.output,{});assert.equal(dest.station.vessels,0);assert.equal(dest.station.energy,0);
  assert.equal(dest.station.exitItems[2],'iron-ore');assert.equal(dest.station.slots[0].remote,'demand');
});

test('蓝图施工原子占位、背包领件、缺货等待，在途存档恢复不重复扣料',()=>{
  const g=newGame(747183,'blueprint'),p=example(g),before={...g.bag};
  assert.throws(()=>scheduleBlueprint(g,p,{x:2,y:0}),/占用/);assert.equal(g.planet.construction,undefined);
  delete g.bag['storage-1'];scheduleBlueprint(g,p,anchor);
  assert.throws(()=>place(g,'tesla-tower',{x:-1,y:-4}),/待建/);
  tick(g);assert.equal(g.bag['arc-smelter'],before['arc-smelter']-1);assert.equal(g.planet.construction.drones.length,1);
  const copy=saved(g);
  for(const game of [g,copy]){
    for(let i=0;i<420;i++)tick(game);
    assert.equal(game.planet.tiles['-1,-4'].recipe,'iron-ingot');assert.ok(game.planet.construction.sites['1,-4']);
    game.bag['storage-1']=1;
    for(let i=0;i<800;i++)tick(game);
    assert.equal(game.planet.construction,undefined);assert.equal(game.bag['sorter-1'],before['sorter-1']-1);
    assert.ok(game.planet.links.some(l=>l.from==='-1,-4'&&l.to==='1,-4'));
  }
  assert.deepEqual(g,copy);
});

test('取消建设机去程归还领件，拆除端点连带撤回正在安装的分拣器',()=>{
  const g=newGame(747183,'blueprint'),before={...g.bag},p=example(g);
  scheduleBlueprint(g,p,anchor);runConstruction(g,STEP);assert.equal(g.planet.construction.drones.length,2);
  const bad=structuredClone(g);bad.planet.construction.drones.push({...bad.planet.construction.drones[0]});assert.throws(()=>saved(bad),/领件/);
  assert.equal(cancelWorks(g),3);assert.deepEqual(g.bag,before);
  scheduleBlueprint(g,p,anchor);
  for(let i=0;i<600&&!g.planet.construction.drones.some(d=>d.job.includes('>'));i++)runConstruction(g,STEP);
  assert.ok(g.planet.construction.drones.some(d=>d.job.includes('>')));
  remove(g,{x:-1,y:-4});assert.equal(g.bag['sorter-1'],before['sorter-1']);
  for(let i=0;i<400;i++)runConstruction(g,STEP);
  assert.ok(!g.planet.links.some(l=>l.from==='-1,-4'));assert.doesNotThrow(()=>saved(g));
});

test('图纸文件格式、区域和科技门槛在改动世界前校验，图纸库跨档持久化',()=>{
  const g=newGame(747183,'blueprint'),p=example(g);const bad=structuredClone(p);bad.links[0].from=3;
  assert.throws(()=>readBlueprint(JSON.stringify(bad)),/索引/);assert.throws(()=>captureBlueprint(newGame(747183,'foundry'),anchor,anchor),/选区/);
  assert.throws(()=>scheduleBlueprint(newGame(42),p,anchor),/批量建造/);assert.ok(surveyStamp(g,p,{x:2,y:41}).errors.size);
  const data=new Map();const storage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  savePattern(p,'furnace',storage);assert.equal(blueprints(storage)[0].id,'furnace');assert.equal(blueprints(storage)[0].pattern.title,p.title);
  discardPattern('furnace',storage);assert.equal(storage.length,0);
});
