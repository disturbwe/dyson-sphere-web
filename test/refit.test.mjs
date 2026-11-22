import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,linkSorter,place,put,remove} from '../src/actions.js';
import {beltLine,replaceBelts} from '../src/belt-line.js';
import {cargoSize,putCargo,takeCargo} from '../src/belt-cargo.js';
import {gradeFamily} from '../src/facility-grades.js';
import {maxHull} from '../src/fog-rules.js';
import {count,receiveStock,stockPoints} from '../src/stock.js';
import {runSorter,sorterRate} from '../src/sorter-motion.js';
import {capabilitiesOf} from '../src/upgrades.js';
import {monitorRate} from '../src/traffic.js';
import {STEP,tick} from '../src/simulation.js';
import {decode} from '../src/save.js';

const iron='iron-ingot';
function run(game,seconds){for(let step=0;step<30*seconds;step++)tick(game);}

test('同一条生产线原位换装，六秒测点达 7200 件和 1800 垛，齿轮实际每分钟增加 60 个',()=>{
  const g=newGame(747183,'refit'),p=g.planet,t=p.tiles,meter=t['-1,1'].monitor,feed=p.links[0],shop=t['2,-1'];
  run(g,15);assert.equal(monitorRate(meter),90);
  const recipe=shop.recipe,work=shop.progress,stocks=shop.input,links=p.links.slice();
  assert.equal(replaceBelts(g,t['-1,1'],'conveyor-belt-3',true),5);
  assert.equal(t['-1,1'].monitor,meter);assert.equal(linkSorter(g,'sorter-4',t[feed.from],t[feed.to]),feed);
  assert.equal(place(g,'assembling-machine-2',shop),shop);assert.equal(shop.recipe,recipe);
  assert.equal(shop.progress,work);assert.equal(shop.input,stocks);assert.equal(feed.filter,iron);assert.deepEqual(p.links,links);
  assert.equal(count(g.bag,'conveyor-belt-1'),5);assert.equal(count(g.bag,'assembling-machine-1'),1);assert.equal(count(g.bag,'sorter-1'),1);
  run(g,10);const gears=g.stats.made.gear;
  run(g,60);assert.equal(g.stats.made.gear-gears,60);assert.equal(monitorRate(meter),7200);assert.equal(meter.pileSum*60/meter.seconds,1800);
  // 原料只可能在仓、配方缓存、带上或爪内。循环送料经过测点多次，实物总额仍为最初的 5400 件。
  const stored=Object.values(t).reduce((sum,tile)=>sum+count(tile.output,iron)+count(tile.input,iron)+(tile.cargo===iron?cargoSize(tile):0),0);
  const held=p.links.reduce((sum,arm)=>sum+(arm.hand?.item===iron?arm.hand.size:0),0);
  assert.equal(stored+held+g.stats.made.gear,5400);
});

test('五节整线或三层实验楼备件不足不扣件，受损制造台保留耐久比例',()=>{
  const g=newGame(747183,'refit'),t=g.planet.tiles,track=t['-1,1'];
  const bag={...g.bag};g.bag['conveyor-belt-3']=4;
  const rev=g.planet.revision;
  assert.throws(()=>replaceBelts(g,track,'conveyor-belt-3',true),/需要 5 节/);
  assert.ok(beltLine(g.planet,track).members.every(t=>t.type==='conveyor-belt-1'));assert.equal(g.bag['conveyor-belt-3'],4);assert.equal(g.planet.revision,rev);
  const lab=put(g,'matrix-lab',{x:4,y:0},0);lab.layers=3;lab.labWork=[.2,.3,.6];lab.recipe='research';
  g.bag['df-self-evolution-lab']=2;assert.throws(()=>place(g,'df-self-evolution-lab',lab),/×3/);assert.equal(g.bag['df-self-evolution-lab'],2);
  g.bag['df-self-evolution-lab']=3;place(g,'df-self-evolution-lab',lab);assert.equal(g.bag['matrix-lab'],3);assert.deepEqual(lab.labWork,[.2,.3,.6]);assert.equal(lab.recipe,'research');
  const shop=t['2,-1'];shop.hull=maxHull(shop)/2;place(g,'assembling-machine-2',shop);assert.equal(shop.hull,maxHull(shop)/2);assert.equal(bag['assembling-machine-2'],1);
  assert.equal(gradeFamily('advanced-mining-machine'),undefined);
});

test('抓着带喷点的四件货时停电、换臂和读档，堵口只卸能放下的件数',()=>{
  const g=newGame(),src=put(g,'storage-1',{x:0,y:0},0),dst=put(g,'conveyor-belt-1',{x:2,y:0},0);
  receiveStock(src,'output',iron,4,13);g.bag['sorter-4']=1;const arm=linkSorter(g,'sorter-4',src,dst);
  g.techs.push('pile-sorter-5');const cap=capabilitiesOf(g);arm.filter=iron;arm.power=1;arm.progress=1;
  runSorter(g,g.planet,arm,.01,cap);assert.deepEqual(arm.hand,{item:iron,size:4,inc:13});
  arm.power=0;const phase=arm.progress;runSorter(g,g.planet,arm,STEP,cap);assert.equal(arm.progress,phase);
  const bad=structuredClone(g);bad.planet.links[0].hand.inc=17;assert.throws(()=>decode(JSON.stringify(bad)));
  const loaded=decode(JSON.stringify(g)),copy=loaded.planet.links[0],out=loaded.planet.tiles['2,0'];
  assert.deepEqual(copy,arm);putCargo(out,iron,2,1);copy.power=1;
  runSorter(loaded,loaded.planet,copy,.15,cap);assert.equal(cargoSize(out),4);assert.equal(copy.hand.size,2);assert.equal(out.inc+copy.hand.inc,14);
  const carried={...copy.hand},a=loaded.planet.tiles['0,0'];loaded.bag['sorter-1']=1;
  linkSorter(loaded,'sorter-1',a,out);assert.deepEqual(copy.hand,carried);assert.equal(copy.filter,iron);
  runSorter(loaded,loaded.planet,copy,.3,cap);assert.deepEqual(copy.hand,carried);
  // 拆除端点同时回收整臂和在途的两件，另一端未卸空的货垛继续留在原带格上。
  remove(loaded,a);assert.equal(loaded.planet.links.length,0);assert.equal(loaded.bag[iron],2);assert.equal(stockPoints(loaded.bag,iron),carried.inc);assert.equal(cargoSize(out),4);
});

test('三级跨度的集装分拣器遵循逐级装卸容量，第六级均可逐帧送满急速带',()=>{
  for(const span of [1,2,3]){
    const g=newGame(),src=put(g,'storage-2',{x:0,y:0},0),dst=put(g,'conveyor-belt-3',{x:span,y:0},0);
    src.output[iron]=1000;g.bag['sorter-4']=1;const arm=linkSorter(g,'sorter-4',src,dst);arm.power=1;
    assert.equal(sorterRate(arm,capabilitiesOf(g)),10/span);
    g.techs.push('pile-sorter-6');const cap=capabilitiesOf(g);assert.equal(sorterRate(arm,cap),30);
    runSorter(g,g.planet,arm,STEP,cap);let delivered=0;
    for(let i=0;i<30;i++){takeCargo(dst);runSorter(g,g.planet,arm,STEP,cap);delivered+=cargoSize(dst);}
    assert.equal(delivered,120);
  }
});
