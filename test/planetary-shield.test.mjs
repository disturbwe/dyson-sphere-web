import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame, remove, put} from '../src/actions.js';
import {STEP, tick} from '../src/simulation.js';
import {decode} from '../src/save.js';
import {axis} from '../src/world.js';
import {advanceHives, hiveHere, newHive} from '../src/space-hive.js';
import {shieldType, shieldMap, shieldStrength, absorbOrbital} from '../src/planet-shield.js';
import {groupPower, solveGrid} from '../src/grid-power.js';
import {hurtStructure, maxHull} from '../src/fog-rules.js';

const restored = game => decode(JSON.stringify(game));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, actual+' ≠ '+expected);
function advance(game, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) tick(game);
}

test('同一在途落点按抵达时的护盾决定返航或建立基地', () => {
  const source = newGame(747183, 'shield');
  const spot = hiveHere(source).flight;
  const normal = axis(spot.x, spot.y);
  // 配平到还有十二秒维持能量，抵达需要二十四秒，断电前后的两条航线完全一致。
  for (const t of Object.values(source.planet.tiles)) if (t.type === shieldType) t.capacitorMJ = 1584;
  const powered = restored(source), offline = restored(source);
  remove(offline, {x:21, y:18});
  advance(offline, 13);
  close(offline.planet.tiles['22,18'].capacitorMJ, 1428);
  assert.equal(shieldStrength(shieldMap(offline.planet).sources, normal), 0);
  const half = restored(offline);
  advance(offline, 11); advance(half, 11); advance(powered, 24);
  assert.deepEqual(offline, half);
  assert.equal(hiveHere(powered).flight.leg, 'return');
  assert.equal(hiveHere(powered).flight.cargo, 6000);
  assert.equal(powered.planet.shield.repelled, 1);
  assert.equal(powered.planet.fog.base.hp, 0);
  const field = offline.planet.fog;
  assert.equal(hiveHere(offline).landed, 1); assert.equal(hiveHere(offline).flight, null);
  assert.deepEqual([field.base.x, field.base.y], [spot.x, spot.y]);
  assert.equal(field.relayMatter, 5696);
  assert.equal(field.relayMatter + field.matter + field.ready * 16, 6000);
  advance(powered, 24);
  assert.equal(hiveHere(powered).docked, 1);
  assert.equal(powered.planet.shield.absorbed, 900);
  assert.deepEqual(restored(powered), powered);
});

test('发生器先支付维持功耗，偏远设施、轨道命中与地面命中分开结算', () => {
  const game = newGame(747183,'landing',32,'off'), planet = game.planet;
  const tower = put(game, shieldType, {x:0,y:0}, 0), plant = {type:'thermal-power-plant',fuelMJ:20000};
  const assignment = {power:groupPower(new Map([[tower,0],[plant,0]]))};
  const gridStep = kw => solveGrid(game, planet, assignment, 1, () => 0, t => t === plant ? kw : 0);
  for (let i=0;i<119;i++) gridStep(24000);
  close(tower.capacitorMJ,1428); assert.equal(shieldMap(planet).sources[0].band,0);
  gridStep(24000); close(tower.capacitorMJ,1440); close(shieldStrength(shieldMap(planet).sources,axis(0,0)),1);
  gridStep(12000); close(tower.capacitorMJ,1440); close(plant.fuelMJ,20000-120*24-12);
  gridStep(6000); close(tower.capacitorMJ,1434); assert.equal(shieldMap(planet).sources[0].band,0);
  tower.capacitorMJ=3500;planet.shield.fieldMJ=60;
  close(absorbOrbital(planet,{x:82,y:0},100),100);
  close(absorbOrbital(planet,tower,300,1),0);close(planet.shield.fieldMJ,0);close(tower.capacitorMJ,3500);
  close(absorbOrbital(planet,tower,300,2),0);close(tower.capacitorMJ,3470);
  // 地表部队即使就在护盾下也能损伤设施本体，轨道池不能代付这次命中。
  hurtStructure(planet,tower,30);close(tower.hull,maxHull(tower)-30);close(tower.capacitorMJ,3470);
});

test('船坞付清骨架和充能后才能出港，驳船往返实物不重复交割', () => {
  const game=newGame(747183,'landing'), p=game.planet;
  const h=newHive(); game.space.fogNet.hives.s0=h;
  // 暂停后续船坞扩产以单独衡量这一艘。持有十二艘枪骑是游戏内可达的舰队上限。
  h.lancers=12;h.matter=10800;const worlds=[['home',p]];
  const seconds=n=>{for(let i=0;i<n;i++)advanceHives(game,worlds,1);};
  seconds(599);assert.equal(h.frame,599);assert.equal(h.matter,0);
  seconds(1);assert.equal(h.frame,600);seconds(299);assert.equal(h.frame,899);assert.equal(h.docked,0);
  seconds(1);assert.equal(h.frame,-1);assert.equal(h.docked,1);
  p.fog.bulk=4897;p.fog.relayMatter=6000;p.fog.relayEnergy=1500;
  seconds(1);assert.equal(h.barges.length,1);assert.equal(h.barges[0].leg,'matter');
  assert.equal(p.fog.bulk+p.fog.relayMatter,4900);
  const saved=restored(game);seconds(24);
  for(let i=0;i<24;i++)advanceHives(saved,[['home',saved.planet]],1);
  assert.deepEqual(restored(game),saved);assert.equal(h.delivered,6000);assert.equal(h.barges[0].energy,1500);
  const beforeReturn=p.fog.relayEnergy;seconds(24);
  close(p.fog.relayEnergy,beforeReturn+1500-24*.3);assert.equal(h.barges.length,0);
  const bad=structuredClone(saved);bad.space.fogNet.hives.s0.barges[0].body='giant';
  assert.throws(()=>restored(bad),/在途货单/);
});
