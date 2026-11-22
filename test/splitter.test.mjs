import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,put,mountDepot,remove} from '../src/actions.js';
import {newSplitter,runSplitter,setPriority,depotAccepts} from '../src/splitter.js';
import {beltPorts} from '../src/liquid-ports.js';
import {tick,STEP} from '../src/simulation.js';
import {decode} from '../src/save.js';
import {captureBlueprint,readBlueprint,stampLayout,blueprintBill} from '../src/blueprint.js';
import {scheduleBlueprint,runConstruction} from '../src/construction.js';
import {cancelWorks} from '../src/construction-orders.js';

function terminal(inward,cargo){return {inward,belt:{type:'conveyor-belt-1',cargo,travel:cargo?1:0}};}
function advance(game,steps){for(let i=0;i<steps;i++)tick(game);}

test('饱和双输入轮流占用同一出口，优先入口保持独占且不超出带速',()=>{
  const tile={split:newSplitter(),output:{}};
  const ports=[terminal(false),terminal(true),terminal(true),null];
  function run(){
    // 下游每一帧取空，两入口永远有货；发货仍受每秒六件的端口时钟限制。
    for(let i=0;i<300;i++){
      for(const side of [1,2])Object.assign(ports[side].belt,{cargo:'iron-ore',travel:1});
      ports[0].belt.cargo=null;runSplitter({tile,ports},STEP);
    }
  }
  run();assert.deepEqual(tile.split.received,[0,30,30,0]);assert.equal(tile.split.sent[0],60);
  tile.split.inFirst=1;run();assert.deepEqual(tile.split.received,[0,90,30,0]);
});

test('筛选出口堵住时铁不串线，铜仍通过；满仓保留同类尾格空间',()=>{
  const tile={split:newSplitter(),output:{}};
  Object.assign(tile.split,{depot:true,filter:'iron-ore',outFirst:0});
  const ports=[terminal(false,'iron-ore'),terminal(true,'iron-ore'),terminal(false),terminal(true,'copper-ore')];
  runSplitter({tile,ports},STEP);
  assert.equal(tile.output['iron-ore'],1);assert.equal(ports[2].belt.cargo,'copper-ore');
  tile.output={'iron-ore':2999};assert.equal(depotAccepts(tile,'copper-ore'),false);
  Object.assign(ports[1].belt,{cargo:'iron-ore',travel:1});runSplitter({tile,ports},STEP);assert.equal(tile.output['iron-ore'],3000);
  Object.assign(ports[1].belt,{cargo:'iron-ore',travel:1});ports[2].belt.cargo=null;runSplitter({tile,ports},STEP);
  assert.equal(ports[1].belt.cargo,'iron-ore');assert.equal(ports[2].belt.cargo,null);
  ports[0].belt.cargo=null;runSplitter({tile,ports},1);assert.equal(tile.output['iron-ore'],3000);
  ports[0].belt.cargo=null;runSplitter({tile,ports},1);assert.equal(tile.output['iron-ore'],2999);
});

test('双矿共享主带后进入各自仓，满带存读档保留货物、轮询和时钟',()=>{
  const game=newGame(747183,'sorting');advance(game,710);
  const restored=decode(JSON.stringify(game));advance(restored,932);advance(game,932);
  assert.deepEqual(restored,game);
  const t=game.planet.tiles;assert.deepEqual(Object.keys(t['-2,-2'].output),['iron-ore']);assert.deepEqual(Object.keys(t['2,-2'].output),['copper-ore']);
  assert.ok(t['-2,-2'].output['iron-ore']>75&&t['2,-2'].output['copper-ore']>75);
  for(const id of ['iron-ore','copper-ore']){
    let present=0;for(const tile of Object.values(t))present+=(tile.input[id]||0)+(tile.output[id]||0)+Number(tile.cargo===id);
    const inArms=game.planet.links.reduce((n,l)=>n+(l.hand?.item===id?l.hand.size:0),0);
    assert.equal(present+inArms,game.stats.mined[id]);
  }
  const separator=t['0,-1'];assert.equal(beltPorts(game.planet,separator)[1].inward,true);
  assert.throws(()=>setPriority(game.planet,separator,3),/连接传送带/);
  const bad=structuredClone(game);bad.planet.tiles['0,-1'].split.nextIn=4;
  assert.throws(()=>decode(JSON.stringify(bad)),/调度状态/);
});

test('图纸随镜像转动优先口，顶仓完整领件退款，搬迁时不复制货物',()=>{
  const game=newGame(747183,'sorting'),t=game.planet.tiles['0,-1'];t.output={'iron-ore':18};
  const pattern=readBlueprint(JSON.stringify(captureBlueprint(game,t,t)));
  assert.deepEqual(blueprintBill(pattern),{splitter:1,'storage-1':1});
  const anchor={x:3,y:-3};assert.equal(stampLayout(pattern,anchor,1,true)[0].split.outFirst,1);
  const units=game.bag.splitter;delete game.bag['storage-1'];scheduleBlueprint(game,pattern,anchor,1,true);
  for(let i=0;i<10;i++)runConstruction(game,STEP);assert.equal(game.bag.splitter,units);
  game.bag['storage-1']=1;
  for(let i=0;i<30&&!game.planet.construction.drones.length;i++)runConstruction(game,STEP);
  assert.equal(game.bag.splitter,units-1);assert.equal(game.bag['storage-1'],undefined);
  const loaded=decode(JSON.stringify(game));cancelWorks(loaded);assert.equal(loaded.bag['storage-1'],1);assert.equal(loaded.bag.splitter,units);
  for(let i=0;i<450;i++)runConstruction(game,STEP);
  const dest=game.planet.tiles['3,-3'];assert.equal(dest.split.outFirst,1);assert.equal(dest.split.filter,'iron-ore');assert.deepEqual(dest.output,{});
  remove(game,t);assert.equal(t.split.depot,false);assert.equal(game.bag['iron-ore'],18);
  mountDepot(game,t);assert.equal(t.split.depot,true);assert.throws(()=>mountDepot(game,t),/已安装/);
});
