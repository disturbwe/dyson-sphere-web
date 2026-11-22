import assert from 'node:assert/strict';
import test from 'node:test';
import {newGame,stackTank,remove,place,placeError,add} from '../src/actions.js';
import {tick} from '../src/simulation.js';
import {decode} from '../src/save.js';
import {nearestTree,startFelling,forestOf,clearFootprint} from '../src/forest.js';
import {drawOil} from '../src/oil.js';
import {connectLiquid,runFraction,runTank} from '../src/liquid-ports.js';

const restore=g=>decode(JSON.stringify(g));
const steps=(g,n)=>{for(let i=0;i<n;i++)tick(g);};

test('普通着陆可以步行采树，中途存档只产生一次确定掉落，建造清场没有掉落',()=>{
  const a=newGame(),id=nearestTree(a.planet,a.mecha);
  assert.ok(id>=0);startFelling(a,id);steps(a,12);
  const b=restore(a);steps(a,720);steps(b,720);
  assert.deepEqual(a.bag,b.bag);assert.ok(a.bag.log>=2);assert.equal(a.mecha.timber,null);
  assert.ok(a.planet.felled.includes(id));assert.throws(()=>startFelling(a,id));
  const other=nearestTree(a.planet,a.mecha),before={...a.bag};
  clearFootprint(a.planet,forestOf(a.planet).trees[other]);
  assert.deepEqual(a.bag,before);assert.throws(()=>startFelling(a,other));
});
test('油泉按实际工作量衰减，半衰期、下限和同泉占位都有效',()=>{
  const rate={rate:2},u={orePerItem:1,miningRate:1};
  const n=drawOil(rate,43200,u);
  assert.ok(Math.abs(rate.rate-1)<1e-9);assert.ok(Math.abs(n-43200/Math.LN2)<1e-5);
  drawOil(rate,0,u);assert.equal(rate.rate,1);drawOil(rate,43200*20,u);assert.equal(rate.rate,.1);
  assert.equal(drawOil(rate,10,u),1);
  const a=newGame();add(a.bag,'oil-extractor',2);
  const p=a.planet.veins.find(v=>v.item==='crude-oil'),t=place(a,'oil-extractor',p),before=p.rate;
  assert.match(placeError(a,'oil-extractor',{x:p.x+1,y:p.y},0),/空闲/);
  steps(a,120);assert.equal(p.rate,before);assert.deepEqual(t.output,{});
});
test('六类流体中只接收当前一种，堆叠储罐拆上层不丢液体或底层端口',()=>{
  const g=newGame(747183,'refinery'),t=g.planet.tiles['-1,-2'],initial=g.bag['storage-tank'];
  stackTank(g,t);assert.equal(t.layers,2);assert.equal(g.bag['storage-tank'],initial-1);
  assert.throws(()=>stackTank(g,t),/上限/);t.output={hydrogen:19704};
  const restored=restore(g);remove(restored,t);assert.equal(restored.planet.tiles['-1,-2'].layers,1);
  assert.equal(restored.bag.hydrogen,9704);assert.equal(restored.bag['storage-tank'],initial);
  const plan=connectLiquid(g.planet,t);const port=plan.ports.find(p=>p?.inward);
  port.belt.cargo='water';port.belt.travel=1;runTank(plan);
  assert.equal(port.belt.cargo,'water');assert.equal(t.output.water,undefined);
});
test('分馏以实际氢回流触发，断带及堵带均不重抽，错误端口不吞其他货物',()=>{
  const g=newGame(747183,'refinery'),t=g.planet.tiles['-1,1'],p=connectLiquid(g.planet,t);
  t.power=1;const seed=t.fraction.seed;
  p.inlet.cargo='hydrogen';p.inlet.travel=1;p.outlet.cargo='hydrogen';runFraction(g,p,1);
  assert.equal(p.inlet.cargo,'hydrogen');assert.equal(t.fraction.seed,seed);
  p.outlet.cargo=null;p.inlet.cargo='water';runFraction(g,p,1);assert.equal(p.inlet.cargo,'water');
  p.inlet.cargo='hydrogen';t.power=0;runFraction(g,p,1);assert.equal(t.fraction.seed,seed);
  p.inlet.dir=(p.inlet.dir+1)%4;runFraction(g,connectLiquid(g.planet,t),1);assert.equal(t.fraction.passed,0);
});
test('红矩阵与分馏并行生产，机组、皮带和罐中氢的总账在工作和读档后均守恒',()=>{
  const a=newGame(747183,'refinery');steps(a,2100);const b=restore(a);steps(a,2700);steps(b,2700);
  assert.deepEqual(a.planet,b.planet);assert.deepEqual(a.stats,b.stats);
  const inventory=(id)=>Object.values(a.planet.tiles).reduce((sum,t)=>sum+(t.input[id]||0)+(t.output[id]||0)+(t.cargo===id?1:0),0);
  assert.ok(a.planet.tiles['-3,-4'].output['energy-matrix']>0);
  assert.ok(a.stats.made.deuterium>0);
  assert.equal(inventory('hydrogen')+inventory('deuterium')+inventory('energy-matrix')*2,48+a.stats.made.hydrogen);
  assert.equal(a.planet.tiles['-1,1'].fraction.converted,a.stats.made.deuterium);
  assert.equal(inventory('refined-oil'),a.stats.made['refined-oil']);
});
