import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,count} from '../src/actions.js';
import {tick,STEP} from '../src/simulation.js';
import {decode} from '../src/save.js';
import {facilityConfig,configureFinished} from '../src/blueprint-config.js';
import {moveFactor} from '../src/defense-fire.js';
import {prepareCharge,deliverCharge,towerLoad} from '../src/tower-power.js';
import {capabilitiesOf} from '../src/upgrades.js';
import {equipment} from '../src/defense-equipment.js';
import {items,buildable} from '../src/catalog.js';

const lesson=()=>newGame(747183,'signal');
const advance=(game,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)tick(game);};
const resume=g=>decode(JSON.stringify(g));

test('六种防御设施能从目录建造，远方发射器等到有电的标记再扣弹药',()=>{
  assert.deepEqual(new Set(buildable),new Set(Object.values(items).filter(i=>i.category==='buildings').map(i=>i.id)));
  const game=lesson(),tiles=game.planet.tiles,gun=tiles['-6,-2'];
  advance(game,3);assert.equal(gun.defense.shots,0);
  tiles['4,2'].defense.enabled=true;advance(game,12);
  assert.ok(tiles['4,2'].defense.marked>0&&game.planet.fog.missiles.length>0);
  assert.equal(gun.defense.shots+gun.defense.rounds,(24-count(gun.input,'df-missile-set'))*24);
  const copy=resume(game);
  for(const g of [game,copy]){g.planet.tiles['-3,-1'].defense.high=true;advance(g,18);}
  assert.deepEqual(copy,game);
  assert.equal(game.space.fogNet.hives.s0.lostLancers,2);assert.equal(game.space.fogNet.hives.s0.volleys,0);
  assert.ok(tiles['3,1'].defense.contacts>0);assert.ok(game.planet.fog.kills>0);
});

test('不同强度的干扰分别到期，导弹与电浆塔蓝图只复制警戒设置',()=>{
  const slow={jammedUntil:3,suppressedUntil:1.6};
  assert.equal(moveFactor(slow,1),.2);assert.equal(moveFactor(slow,2),.5);assert.equal(moveFactor(slow,3),1);
  const game=lesson(),src=game.planet.tiles['-6,-2'];
  Object.assign(src.defense,{ground:false,high:true,space:false,shots:99,rounds:11});
  const design=facilityConfig(src),target=lesson().planet.tiles['-6,-2'];
  assert.deepEqual(design.defense,{enabled:true,high:true,space:false,ground:false});
  configureFinished(game,target,design);assert.equal(target.defense.rounds,0);assert.equal(target.defense.shots,0);
  assert.equal(target.defense.high,true);assert.equal(target.defense.ground,false);
  assert.throws(()=>facilityConfig({...src,defense:{enabled:'true'}}),/档位无效/);
  assert.equal(equipment[game.planet.tiles['-3,-1'].type].far,0);
});

test('信号与无线塔共享临界充电余量，失电及离开地表后没有幽灵供能',()=>{
  const game=lesson(),planet=game.planet,tower=planet.tiles['4,2'];
  tower.defense.enabled=true;Object.assign(game.mecha,{x:tower.x,y:tower.y});
  const wireless={type:'wireless-power-tower',x:tower.x,y:tower.y,power:1};tower.power=1;
  const top={towerRequests:new Map(),chargeTowers:[tower,wireless]},full=capabilitiesOf(game).coreMJ;
  game.mecha.energy=full-.003;prepareCharge(game,planet,top,STEP);
  assert.ok(Math.abs(towerLoad(top,tower)+towerLoad(top,wireless)-1530)<1e-6);
  tower.power=0;deliverCharge(game,tower,top,STEP);assert.equal(tower.chargeKW,0);
  deliverCharge(game,wireless,top,STEP);assert.ok(game.mecha.energy<full&&game.mecha.energy>full-.003);
  prepareCharge(game,{},top,STEP);assert.equal(top.towerRequests.size,0);
  game.space.flight={};prepareCharge(game,planet,top,STEP);assert.equal(top.towerRequests.size,0);
});
