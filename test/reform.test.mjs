import assert from 'node:assert/strict';
import test from 'node:test';
import {newGame,place,placeError,remove} from '../src/actions.js';
import {applyGround,surveyGround,groundHeight,settled,grade,soilLimit} from '../src/reform.js';
import {coastSurvey} from '../src/coast-lesson.js';
import {tick} from '../src/simulation.js';
import {availableSite} from '../src/oil.js';
import {key} from '../src/world.js';
import {decode} from '../src/save.js';

const backup=game=>decode(JSON.stringify(game));

test('沿真实海岸取土再填海，已铺地块可免费重涂，重载后支持建造',()=>{
  const game=newGame(747183,'coast');
  const {cut,fill}=coastSurvey(game.seed);
  assert.match(placeError(game,'storage-1',fill,0),/水下/);
  const before=JSON.stringify(game);
  assert.throws(()=>applyGround(game,fill,3),/沙土不足/);
  assert.equal(JSON.stringify(game),before);
  const excavation=applyGround(game,cut,3),reclaimed=applyGround(game,fill,3,7);
  assert.equal(excavation.cost,9);
  assert.equal(reclaimed.soil,-2196);
  assert.equal(game.mecha.soil,excavation.soil+reclaimed.soil);
  assert.equal(game.bag.foundation,102);
  assert.equal(groundHeight(game.planet,fill.x,fill.y),grade);
  const painted=applyGround(game,fill,3,3);
  assert.equal(painted.changes,9);
  assert.equal(painted.cost,0);
  assert.equal(painted.soil,0);
  const copy=backup(game);
  assert.deepEqual(copy.planet.reform,game.planet.reform);
  place(copy,'storage-1',fill);
  assert.equal(copy.mecha.soil,game.mecha.soil);
  assert.equal(copy.planet.tiles[key(fill.x,fill.y)].type,'storage-1');
});

test('掩埋油泉保留实时流量并停止生产，露出时沿用同一眼油井',()=>{
  const game=newGame(747183,'refinery');
  game.techs.push('environment-modification');game.bag.foundation=4;
  const pump=Object.values(game.planet.tiles).find(tile=>tile.type==='oil-extractor');
  const seep=game.planet.veins[pump.seep];
  Object.assign(game.mecha,{x:seep.x,y:seep.y});
  // 掩埋时的流量就是复工的起点，不允许重置为新泉的原始产能。
  const original=seep.rate;
  applyGround(game,seep,1,1,true);
  assert.equal(availableSite(seep),false);
  for(let frame=0;frame<180;frame++)tick(game);
  assert.equal(seep.rate,original);
  assert.match(pump.status,/掩埋/);
  const copy=backup(game),vein=copy.planet.veins[pump.seep];
  const exposed=applyGround(copy,vein,1,1,false);
  assert.equal(exposed.cost,0);
  assert.equal(availableSite(vein),true);
  for(let frame=0;frame<180;frame++)tick(copy);
  assert.ok(vein.rate<original);
});

test('水泵进水口填平后停机，拆装和重铺地基不会重复取土',()=>{
  const game=newGame(747183,'coast'),{cut,fill}=coastSurvey(game.seed);
  const pump=place(game,'water-pump',fill);
  place(game,'wind-turbine',{x:fill.x+1,y:fill.y});
  for(let frame=0;frame<120;frame++)tick(game);
  assert.ok(pump.output.water>0);
  const stock=pump.output.water;
  applyGround(game,cut,3);
  applyGround(game,fill,3);
  for(let frame=0;frame<120;frame++)tick(game);
  assert.match(pump.status,/填平/);assert.equal(pump.output.water,stock);
  remove(game,fill);
  assert.match(placeError(game,'water-pump',fill,0),/水面/);
  const balance=game.mecha.soil;
  place(game,'storage-1',cut);remove(game,cut);applyGround(game,cut,3,8);
  assert.equal(game.mecha.soil,balance);
});

test('笔刷跨经线仍按唯一地块结算，极区、越距和旧档迁移边界有效',()=>{
  const game=newGame(747183,'coast');
  Object.assign(game.mecha,{x:89,y:0,soil:soilLimit});
  applyGround(game,{x:89,y:0},3);
  assert.equal(Object.keys(game.planet.reform.cells).length,9);
  assert.ok(settled(game.planet,-90,0));
  assert.ok(game.mecha.soil<=soilLimit);
  assert.match(surveyGround(game,{x:0,y:0}).error,/范围/);
  game.mecha.x=0;game.mecha.y=44;
  assert.match(surveyGround(game,{x:0,y:44},3).error,/极区/);
  const bad=structuredClone(game);bad.planet.reform.cells['180,0']=9;
  assert.throws(()=>backup(bad));
  const legacy=newGame(747183,'foundry');legacy.version=7;delete legacy.mecha.soil;delete legacy.planet.reform;
  const migrated=backup(legacy);assert.equal(migrated.version,14);assert.equal(migrated.mecha.soil,0);
  assert.deepEqual(migrated.planet.reform,{revision:0,cells:{}});
  assert.deepEqual(migrated.planet.tiles,legacy.planet.tiles);
});
