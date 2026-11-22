import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame, layBelt, put, place, remove, beltQuote} from '../src/actions.js';
import {count, stockPoints} from '../src/stock.js';
import {cargoSize, putCargo} from '../src/belt-cargo.js';
import {beltLine,replaceBelts,reverseLine,removeBeltLine} from '../src/belt-line.js';
import {cellKey, exitKey} from '../src/belt-level.js';
import {STEP, tick} from '../src/simulation.js';
import {connectBridge} from '../src/bridge-lesson.js';
import {captureBlueprint, readBlueprint, blueprintBill} from '../src/blueprint.js';
import {scheduleBlueprint} from '../src/construction.js';
import {decode} from '../src/save.js';

const yellow='conveyor-belt-1',green='conveyor-belt-2';
const save=game=>decode(JSON.stringify(game));
function run(game, seconds){for(let i=0;i<Math.round(seconds/STEP);i++)tick(game);}
function empty(){const game=newGame(747183,'landing',32,'off');Object.assign(game.bag,{[yellow]:100,[green]:100});return game;}

test('两端复用五件新带，跨线的矿物、货垛和喷点独立通过与回收',()=>{
  const game=newGame(747183,'bridge');run(game,4);
  assert.ok(game.planet.tiles['0,5'].output['iron-ore']>0);assert.deepEqual(game.planet.tiles['5,0'].output,{});
  const first=game.planet.tiles['-3,0'],before=game.bag[green];
  connectBridge(game,layBelt);assert.equal(game.bag[green],before-5);assert.equal(game.planet.tiles['-3,0'],first);
  run(game,22);const continued=save(game);run(game,5);run(continued,5);assert.deepEqual(save(game),continued);
  const tiles=game.planet.tiles;
  assert.deepEqual(Object.keys(tiles['5,0'].output),['copper-ore']);assert.deepEqual(Object.keys(tiles['0,5'].output),['iron-ore']);
  assert.ok(tiles['5,0'].output['copper-ore']>100);
  for(const ore of ['iron-ore','copper-ore']){
    const amount=Object.values(tiles).reduce((sum,t)=>sum+count(t.output,ore)+count(t.input,ore)+(t.cargo===ore?cargoSize(t):0),0);
    // 已离开皮带、尚未进仓的实物仍属于分拣器。
    const held=game.planet.links.reduce((sum,l)=>sum+(l.hand?.item===ore?l.hand.size:0),0);
    assert.equal(amount+held,1200);
  }
  // 单独检查一个四层有喷点的桥面货垛。回收恰好一节绿带，地面黄带及货位对象保持原状。
  const top=tiles['0,0@1'],bottom=structuredClone(tiles['0,0']);putCargo(top,'copper-ore',4,13);
  remove(game,top);assert.deepEqual(tiles['0,0'],bottom);assert.equal(game.bag[green],before-4);
  assert.equal(game.bag['copper-ore'],4);assert.equal(stockPoints(game.bag,'copper-ore'),13);
  assert.ok(!save(game).planet.tiles['0,0@1']);
});

test('不足坡长与超限不扣件，高空平带、经线接缝与旧零层能接续',()=>{
  const game=empty();game.mecha.x=89;game.mecha.y=1;
  const at=(x,y=1,h=0)=>({x,y,h});
  const path=layBelt(game,green,at(87,1,2),at(-87,1,2));
  assert.ok(path.every(n=>n.h===2));assert.equal(exitKey(game.planet.tiles['89,1@2']),'-90,1@2');
  const before=JSON.stringify(game);
  assert.throws(()=>layBelt(game,yellow,at(89,3),at(-90,3,2)),/距离不足/);
  assert.throws(()=>layBelt(game,yellow,at(89,3,13),at(-87,3,13)),/垂直建造/);
  assert.equal(JSON.stringify(game),before);
  // 平带下方另一层独立交叉；第一次垂直科技把可用上限从十二层提高到十八层。
  game.techs.push('vertical-construction-1');layBelt(game,yellow,at(89,3,18),at(-87,3,18));
  layBelt(game,yellow,at(89,-2),at(89,3));assert.deepEqual(save(game).planet.tiles,game.planet.tiles);
  const old=empty();old.version=11;layBelt(old,yellow,{x:0,y:0},{x:4,y:0});
  assert.deepEqual(save(old).planet.tiles,old.planet.tiles);
  const bad=structuredClone(game);bad.planet.tiles['89,1@2'].h=1.5;assert.throws(()=>save(bad));
});

test('旋转镜像桥带图纸，建设机跨读档逐层扣件，坏图纸拒绝高度重叠',()=>{
  const source=newGame(747183,'bridge');connectBridge(source,layBelt);
  const pattern=captureBlueprint(source,{x:-2,y:-1},{x:2,y:1});
  assert.deepEqual(readBlueprint(JSON.stringify(pattern)),pattern);
  assert.deepEqual(blueprintBill(pattern),{[yellow]:3,[green]:5});
  const destination=empty();destination.techs.push('mass-construction-1');
  scheduleBlueprint(destination,pattern,{x:0,y:0},1,true);
  assert.ok(destination.planet.construction.sites['0,0@1']);assert.ok(destination.planet.construction.sites['0,0']);
  assert.match(beltQuote(destination,yellow,{x:-1,y:0},{x:1,y:0}).error,/预建|待建|高度|距离/);
  run(destination,.4);const copy=save(destination);run(destination,30);run(copy,30);
  assert.deepEqual(save(destination),copy);const tiles=destination.planet.tiles;
  assert.equal(tiles['0,0'].type,yellow);assert.equal(tiles['0,0@1'].type,green);
  assert.equal(tiles['0,0@1'].dir,3);assert.equal(destination.bag[green],95);assert.equal(destination.bag[yellow],97);
  const malformed=structuredClone(pattern);malformed.tiles.find(t=>t.h===1).h=.5;
  assert.throws(()=>readBlueprint(JSON.stringify(malformed)),/冲突/);
});

test('合流直行优先与建造净空不依赖设施插入次序',()=>{
  const game=empty();const node=(x,y,dir,h=0)=>put(game,yellow,{x,y,h},dir);
  const side=node(0,-1,1),straight=node(-1,0,0),merge=node(0,0,0);
  putCargo(side,'copper-ore');putCargo(straight,'iron-ore');side.travel=straight.travel=1;tick(game);
  assert.equal(merge.cargo,'iron-ore');assert.equal(side.cargo,'copper-ore');
  const fly=node(1,1,0,1),point={x:1,y:1};game.bag['storage-1']=1;
  assert.throws(()=>place(game,'storage-1',point),/高度|净空/);assert.ok(game.planet.tiles[cellKey(fly)]);
  remove(game,fly);assert.equal(place(game,'storage-1',point).type,'storage-1');
});

test('桥面整线反转两次还原坡形，换件不足与折返不挪用桥下库存',()=>{
  const game=newGame(747183,'bridge');connectBridge(game,layBelt);
  const top=game.planet.tiles['0,0@1'],other=game.planet.tiles['0,0'];
  putCargo(top,'copper-ore',3,11);top.travel=.25;
  const line=beltLine(game.planet,top);assert.equal(line.members.length,9);assert.equal(line.circular,false);
  const shape=members=>members.map(t=>[cellKey(t),t.dir,t.rise||0,t.entryRise||0]);
  const old=shape(line.members);
  assert.equal(reverseLine(game,top),9);assert.equal(top.travel,.75);assert.equal(other.dir,1);
  assert.equal(beltLine(game.planet,top).members[0].x,4);assert.deepEqual(save(game).planet.tiles,game.planet.tiles);
  reverseLine(game,top);assert.deepEqual(shape(beltLine(game.planet,top).members),old);
  game.bag[yellow]=8;const before=JSON.stringify(game);assert.throws(()=>replaceBelts(game,top,yellow,true),/需要 9/);
  assert.equal(JSON.stringify(game),before);
  game.bag[yellow]=9;const oldGreen=game.bag[green];assert.equal(replaceBelts(game,top,yellow,true),9);
  assert.equal(game.bag[green],oldGreen+9);assert.equal(top.inc,11);assert.equal(cargoSize(top),3);
  assert.equal(removeBeltLine(game,top),9);assert.equal(game.planet.tiles['0,0'],other);
  assert.equal(game.planet.links.length,2);assert.equal(game.bag['copper-ore'],3);assert.equal(stockPoints(game.bag,'copper-ore'),11);
});

test('闭环反转只遍历一圈，T 形支路在主带前结束，范围外的带节不换件',()=>{
  const game=empty();const node=(x,y,dir)=>put(game,yellow,{x,y},dir);
  const a=node(0,0,0);node(1,0,1);node(1,1,2);node(0,1,3);
  const loop=beltLine(game.planet,a);assert.ok(loop.circular);assert.equal(loop.members.length,4);
  reverseLine(game,a);assert.equal(a.dir,1);assert.ok(beltLine(game.planet,a).circular);
  const side=node(1,4,1);for(let x=-1;x<=15;x++)node(x,5,0);
  assert.equal(beltLine(game.planet,side).members.length,1);
  const count=replaceBelts(game,game.planet.tiles['0,5'],green,true);assert.ok(count>1&&count<17);
  assert.equal(side.type,yellow);assert.equal(game.planet.tiles['15,5'].type,yellow);
});

