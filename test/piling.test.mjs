import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,put,remove} from '../src/actions.js';
import {researchRoute} from '../src/research.js';
import {tick,STEP} from '../src/simulation.js';
import {cargoSize,putCargo,takeCargo} from '../src/belt-cargo.js';
import {newMonitor,sampleMonitor,configureMonitor,monitorRate,validateMonitor} from '../src/traffic.js';
import {newPiler,runPiler} from '../src/piler.js';
import {blueprintBill,captureBlueprint} from '../src/blueprint.js';
import {decode} from '../src/save.js';

const advance=(game,steps)=>{for(let i=0;i<steps;i++)tick(game,STEP);};
const makeBelt=()=>({cargo:null,travel:0,type:'conveyor-belt-3',power:1});
const at=(game,x)=>game.planet.tiles[x+',1'];

// 先让各格排满再计时，单独测量离散时间舍入或带尾交接造成的长期损失。
test('三级满带各一分钟持续交付 360、720、1800 件',()=>{
  for(const [tier,perMinute] of [[1,360],[2,720],[3,1800]]){
    const game=newGame(747183,'landing',32,'off');
    put(game,'storage-tank',{x:-3,y:0},0).output.water=4000;
    for(let x=-2;x<=2;x++)put(game,'conveyor-belt-'+tier,{x,y:0},0);
    const target=put(game,'storage-tank',{x:3,y:0},0);
    advance(game,91);const before=target.output.water;advance(game,1800);
    assert.equal(target.output.water-before,perMinute);
  }
});

test('双级集装、反向拆垛和半窗续档均保持实物守恒',()=>{
  const game=newGame(747183,'piling');advance(game,723);
  const resumed=decode(JSON.stringify(game));advance(game,1080);advance(resumed,1080);
  assert.deepEqual(resumed,game);
  const before=at(game,-3).monitor,mid=at(game,0).monitor,after=at(game,2).monitor;
  for(const [m,height] of [[before,1],[mid,2],[after,4]])assert.equal(m.sum,m.pileSum*height);
  assert.equal(monitorRate(before),720);assert.equal(monitorRate(after),720);
  assert.equal(at(game,4).piler.maxHeight,2);assert.ok(at(game,7).output.water>600);
  const total=Object.values(game.planet.tiles).reduce((sum,t)=>sum+(t.output.water||0)+(t.piler?.size||0)+cargoSize(t),0);
  assert.equal(total,3600);
  const broken=structuredClone(game);at(broken,-2).piler.loaded++;
  assert.throws(()=>decode(JSON.stringify(broken)),/货垛|账目/);
});

test('反向奇数垛、满出口和断电直通不丢货',()=>{
  const inlet=makeBelt(),outlet=makeBelt(),tile={piler:newPiler(),power:1},port={tile,inlet,outlet,reverse:true};
  putCargo(inlet,'water',3);inlet.travel=1;putCargo(outlet,'stone');
  runPiler(port,STEP);assert.equal(tile.piler.size,3);assert.equal(tile.piler.splitPending,true);
  takeCargo(outlet);runPiler(port,STEP);assert.equal(cargoSize(outlet),2);assert.equal(tile.piler.size,1);
  for(let i=0;i<15;i++)runPiler(port,STEP);assert.equal(tile.piler.size,1);
  takeCargo(outlet);runPiler(port,STEP);assert.equal(cargoSize(outlet),1);takeCargo(outlet);
  tile.power=0;putCargo(inlet,'coal',4);inlet.travel=1;
  for(let i=0;i<3;i++)runPiler(port,STEP);
  assert.equal(cargoSize(outlet),4);assert.equal(tile.piler.delivered,7);assert.equal(tile.piler.size,0);
});

test('监测窗口按过滤后的件数计量，区分零流量下的堵带和断料',()=>{
  const t=makeBelt(),m=t.monitor=newMonitor();
  configureMonitor(m,'seconds',1);configureMonitor(m,'filter','water');configureMonitor(m,'target',60);configureMonitor(m,'alarm','failLoaded');
  putCargo(t,'coal',4);takeCargo(t);putCargo(t,'water',4);takeCargo(t,1);takeCargo(t);
  for(let i=0;i<30;i++)sampleMonitor(t,STEP);
  assert.equal(m.sum,4);assert.equal(m.pileSum,1);assert.equal(monitorRate(m),240);assert.equal(m.state,'pass');
  putCargo(t,'water',4);for(let i=0;i<30;i++)sampleMonitor(t,STEP);
  assert.equal(monitorRate(m),0);assert.equal(m.state,'fail');assert.equal(m.alert,true);
  takeCargo(t,4,false);sampleMonitor(t,STEP);assert.equal(m.alert,false);
  configureMonitor(m,'seconds',1.75);assert.equal(m.state,'waiting');assert.equal(m.buckets.length,7);
  const before=structuredClone(m);assert.throws(()=>configureMonitor(m,'seconds',1.3));assert.deepEqual(before,m);
  m.buckets[0]++;assert.throws(()=>validateMonitor(m),/采样记录/);
});

test('带上测点只复制设置与建材，拆下时保留带格和当时的货物',()=>{
  const g=newGame(747183,'piling');advance(g,320);
  g.techs.push(...researchRoute(g,'mass-construction-1'));
  const tile=at(g,2),point={x:2,y:1},p=captureBlueprint(g,point,point);
  assert.deepEqual(blueprintBill(p),{'conveyor-belt-1':1,'traffic-monitor':1});
  assert.equal(p.tiles[0].monitor.filter,'water');assert.equal(p.tiles[0].monitor.lifetime,undefined);
  const amount=cargoSize(tile),prior=g.bag['traffic-monitor'];remove(g,point);
  assert.equal(at(g,2),tile);assert.equal(tile.monitor,undefined);assert.equal(cargoSize(tile),amount);assert.equal(g.bag['traffic-monitor'],prior+1);
});
