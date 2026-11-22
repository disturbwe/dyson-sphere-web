import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, place, remove, count } from '../src/actions.js';
import { STEP, tick } from '../src/simulation.js';
import { decode } from '../src/save.js';
import { restoreRuin, gauss, laser, analysisBase, coreHealth } from '../src/fog-rules.js';
import { fogCommand } from '../src/fog-panel.js';
import { applyGround } from '../src/reform.js';
import { total } from '../src/stock.js';
import { heatAt } from '../src/energy.js';

const lesson = () => newGame(747183, 'defense');
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) tick(game); };
// 分拣器待料时只取待机功率，首波时刻会随真实电耗略变。等待业务事件且限定最长模拟时间。
function until(game,predicate,seconds){
  for(let i=0;i<Math.ceil(seconds/STEP)&&!predicate();i++)tick(game);
  assert.ok(predicate(),'未在 '+seconds+' 模拟秒内达到预期战况');
}
const resume = game => decode(JSON.stringify(game));
const setOrder = (game, action, id = '') => fogCommand(game, {}, action, id, () => {});

test('波次中断后继续时，弹箱余量、单位、掉落和运至仓储的产物一致', () => {
  const game = lesson();
  const field = game.planet.fog;
  until(game,()=>field.kills>0&&field.units.length>0,28);
  assert.ok(field.kills > 0 && field.units.length > 0);
  const turret = game.planet.tiles['-2,2'];
  assert.ok(turret.defense.rounds > 0 && turret.defense.rounds < 30);
  const saved = resume(game);
  advance(game, 24); advance(saved, 24);
  assert.deepEqual(saved, game);
  const stored = game.planet.tiles['-3,-1'].output;
  assert.equal(field.wave, 1); assert.equal(field.kills, 7);
  assert.equal(field.units.length, 0); assert.equal(total(stored), 8);
  assert.deepEqual(stored, field.loot);
  assert.equal(turret.defense.shots + turret.defense.rounds, (2 - count(turret.input, 'df-magnum-ammo-box')) * 30);
});

test('设施战损立即断电，分析基站只用一份同型备件恢复原址设施', () => {
  const game = lesson(), planet = game.planet;
  const gun = planet.tiles['-2,2'], beam = planet.tiles['2,1'], base = planet.tiles['-1,-1'];
  for (const tower of [gun, beam, base]) tower.defense.enabled = false;
  until(game,()=>gun.hull===0&&beam.hull===0,50);
  assert.equal(gun.hull, 0); assert.equal(gun.power, 0); assert.equal(beam.hull, 0);
  // 分析站只存了一份机枪塔，激光塔残骸必须继续等待自己的备件。
  base.defense.enabled = true;
  advance(game, .8);
  assert.equal(count(base.input, gauss), 0); assert.notEqual(gun.hull, 0);
  assert.equal(planet.fog.repaired, 1); assert.equal(beam.hull, 0);
  assert.throws(() => restoreRuin(planet, beam, {}), /同型设施/);
  const before = count(game.bag, laser);
  restoreRuin(planet, beam, game.bag); assert.equal(planet.fog.repaired, 2);
  assert.equal(count(game.bag, laser), before - 1);
  assert.throws(() => restoreRuin(planet, beam, game.bag), /无需重建/);
  assert.deepEqual(resume(game), game);
});

test('钻孔三条分支互斥：自然重建、地热接管、永久铺平', () => {
  const game = lesson(); advance(game, 26);
  setOrder(game, 'fog-approach'); setOrder(game, 'fog-order', 'base');
  // 必须经过实际接近与能量消耗，不将基地耐久直接写成零。
  let steps = 0;
  while (game.planet.fog.base.hp > 0 && steps++ < 4500) tick(game);
  const field = game.planet.fog;
  assert.equal(field.base.hp, 0); assert.ok(game.mecha.energy < 120);
  setOrder(game, 'fog-order', 'off');
  const reoccupy = resume(game), covered = resume(game), oldSite = {...field.base}, reserve = field.relayMatter;
  assert.throws(() => place(game, 'storage-1', field.base), /钻井/);
  setOrder(game, 'fog-well'); const well = game.planet.tiles['3,8'];
  assert.equal(well.efficiency, 3 + field.base.level * .1); assert.ok(field.well && field.sealed);
  assert.equal(count(game.bag, 'geothermal-power-station'), 0);
  // 封孔永久作用于原格。巢穴的中继撤走后可以另择地点，不能把新井计为旧井复生。
  advance(game, 76); assert.ok(!field.base.hp || field.base.x!==oldSite.x || field.base.y!==oldSite.y);
  assert.equal(heatAt(resume(game).planet, oldSite), well.efficiency);
  const bill = count(covered.bag, 'foundation');
  applyGround(covered, oldSite);
  assert.equal(count(covered.bag, 'foundation'), bill - 1);
  advance(covered, 76); const next=covered.planet.fog.base;assert.ok(!next.hp || next.x!==oldSite.x || next.y!==oldSite.y);
  assert.equal(heatAt(covered.planet, oldSite), 0);
  advance(reoccupy, 76);
  assert.equal(reoccupy.planet.fog.base.hp, coreHealth(reoccupy.planet.fog.base.level));
  assert.equal(reoccupy.planet.fog.relayMatter, reserve - 600);
});

test('旧厂和平迁移，被动基地忽略日常用电，读档拒绝重复单位编号', () => {
  const old = newGame(17, 'foundry'); old.version = 8; delete old.fogMode; delete old.planet.fog;
  const peaceful = resume(old);
  assert.equal(peaceful.fogMode, 'off'); assert.equal(peaceful.planet.fog, null);
  const passive = lesson(); passive.fogMode = 'passive';
  const threat = passive.planet.fog.threat; advance(passive, 22);
  assert.equal(passive.planet.fog.threat, threat); assert.equal(passive.planet.fog.wave, 0);
  const bad = lesson(); until(bad,()=>bad.planet.fog.units.length>=2,26);
  bad.planet.fog.units[1].id = bad.planet.fog.units[0].id;
  assert.throws(() => resume(bad), /黑雾战场存档无效/);
});
