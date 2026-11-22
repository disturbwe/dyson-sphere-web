import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,tileAt} from '../src/actions.js';
import {tick,STEP} from '../src/simulation.js';
import {depart,bodyOf,positionAt,separation} from '../src/navigation.js';
import {decode} from '../src/save.js';
import {makeBeltFlow,runBelts} from '../src/belt-flow.js';
import {FrameBudget,scaleFor} from '../src/frame-budget.js';
import {connectGrid} from '../src/grid-index.js';
import {rng,distance} from '../src/world.js';

function arrive(game){
  for(let n=0;n<12000&&game.space.flight;n++)tick(game);
  assert.equal(game.space.flight,null);
}
test('往返、途中读档和外星采矿保留各行星工厂与归属',()=>{
  const s=newGame(17,'foundry');
  assert.throws(()=>depart(s,'inner'),/驱动引擎/);assert.equal(s.mecha.energy,120);
  s.techs.push('drive-engine-1','drive-engine-2');
  assert.throws(()=>depart(s,'missing'),/目的天体/);
  depart(s,'inner');assert.equal(s.mecha.energy,108);
  assert.ok(separation(s.space.flight.position,positionAt(s,bodyOf(s,'home')))>270);
  for(let i=0;i<75;i++)tick(s);
  const resumed=decode(JSON.stringify(s));arrive(s);arrive(resumed);assert.deepEqual(s,resumed);
  const base=s.space.parked.home,stock=base.tiles['3,0'].output['iron-ingot'];
  assert.equal(s.planet.biome,'lava');assert.ok(stock>0);
  const ore=s.planet.veins.find(v=>v.item==='titanium-ore');s.mecha.x=ore.x;s.mecha.y=ore.y;s.mecha.mining=s.planet.veins.indexOf(ore);
  const available=ore.amount;for(let i=0;i<150;i++)tick(s);
  assert.equal(s.bag['titanium-ore'],available-ore.amount);assert.ok(available>ore.amount);
  depart(s,'home');arrive(s);assert.strictEqual(s.planet,base);
  assert.ok(tileAt(s,{x:3,y:0}).output['iron-ingot']>stock);assert.equal(s.space.parked.inner.veins[s.space.parked.inner.veins.indexOf(ore)].amount,ore.amount);
  assert.deepEqual(s,decode(JSON.stringify(s)));
});

test('满载蛇形八千格不卡调用栈，堵塞不会覆盖库存，密闭环可整体前移',()=>{
  const path=[];
  for(let row=0;row<50;row++)for(let col=0;col<160;col++){
    const right=row%2===0;
    path.push({x:(right?col:159-col)-80,y:row-25,dir:col===159?1:right?0:2,type:'conveyor-belt-3',travel:1,cargo:'iron-ore'});
  }
  const network=makeBeltFlow(path);runBelts(network,STEP);
  assert.equal(path.filter(t=>t.cargo).length,8000);
  path.at(-1).cargo=null;runBelts(network,STEP);
  assert.equal(path[0].cargo,null);assert.equal(path.at(-1).cargo,'iron-ore');
  const ring=[{x:0,y:0,dir:0,cargo:'coal'},{x:1,y:0,dir:1,cargo:'stone'},{x:1,y:1,dir:2,cargo:'iron-ore'},{x:0,y:1,dir:3,cargo:'copper-ore'}].map(t=>({...t,type:'conveyor-belt-1',travel:1}));
  runBelts(makeBeltFlow(ring),STEP);assert.deepEqual(ring.map(t=>t.cargo),['copper-ore','coal','stone','iron-ore']);
});

test('空间索引与全量球面覆盖计算一致，含极地和经线接缝',()=>{
  const rand=rng(8192),radii={wind:3,pole:5,satellite:12},types=Object.keys(radii);
  const relays=Array.from({length:140},(_,i)=>({x:rand()*180-90,y:rand()*86-43,type:types[i%3]}));
  const where=connectGrid(relays,radii),groups=relays.map((_,i)=>i);
  for(let i=0;i<relays.length;i++)for(let j=0;j<i;j++)if(distance(relays[i],relays[j])<=radii[relays[i].type]+radii[relays[j].type]){
    const before=groups[i],after=groups[j];for(let k=0;k<groups.length;k++)if(groups[k]===before)groups[k]=after;
  }
  const pairs=new Map();
  for(let i=0;i<700;i++){
    const p={x:rand()*180-90,y:rand()*89-44.5};let found=-1,nearest=Infinity;
    relays.forEach((t,j)=>{const d=distance(p,t);if(d<=radii[t.type]&&d<nearest){found=j;nearest=d;}});
    const expected=found<0?-1:groups[found],actual=where(p);
    if(!pairs.has(expected))pairs.set(expected,actual);
    assert.equal(actual,pairs.get(expected));assert.equal(actual<0,expected<0);
  }
  assert.equal(new Set(pairs.values()).size,pairs.size);
});

test('高分屏像素上限、降画质时序与低帧恢复滞后',()=>{
  const scale=scaleFor(3840,2160,3,'balanced');assert.ok(3840*2160*scale**2<=1750001);
  const budget=new FrameBudget('balanced');for(let i=0;i<64;i++)budget.record(1/32,60);
  assert.ok(budget.quality<1);const reduced=budget.quality;
  for(let i=0;i<7*60;i++)budget.record(1/60,60);assert.equal(budget.quality,reduced);
  for(let i=0;i<2*60;i++)budget.record(1/60,60);assert.ok(budget.quality>reduced);
});
