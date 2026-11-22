import {recordBatch} from './production-log.js';
import { ANGLE, distance, elevation, key, rng, wrap } from './world.js';
import { merge } from './stock.js';

const forests = new WeakMap();

/** 同一颗星的树木 ID 同时用于渲染、点选和掉落。存档只保存移除顺序，换星时可释放树林和空间索引。 */
export function forestOf(planet) {
  if (forests.has(planet)) return forests.get(planet);
  const trees = [], cells = new Map(), removed = new Set(planet.felled);
  const forest = { trees, cells, removed };
  forests.set(planet, forest);
  if (!['mediterranean','tropicana'].includes(planet.biome)) return forest;
  const random = rng(planet.seed + 443);
  function grove(x, y, count, spread) {
    const hue = random();
    for (let i = 0; i < count; i++) {
      const lon = x + (random() - .5) * spread, lat = y + (random() - .5) * spread;
      if (Math.hypot(lon, lat) <= 8 || Math.abs(lat) >= 37 || elevation(lon, lat, planet.seed, planet.biome) <= .27) continue;
      const tree = { x: wrap(lon), y: lat, h: .67 + random() * .72, color: hue * .7 + random() * .3, angle: random() * 6.28 };
      const cell = key(tree.x, tree.y);
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(trees.length);
      trees.push(tree);
    }
  }
  // 沿用已有树林的放样次序，旧存档换版本后仍可在原位置找到之前看到的树林。
  for (let i = 0; i < 980; i++) grove(random() * 180 - 90, Math.asin(2 * random() - 1) / ANGLE, 4 + Math.floor(random() * 5), 5);
  for (const [x, y] of [[-8,6],[6,9],[-10,-4],[10,-3],[-4,12]]) grove(x,y,15,4);
  return forest;
}

/** 悬停只查询相邻格；打开勘探面板时才允许查询整颗星。极区按纬度放宽经度搜索范围。 */
export function nearestTree(planet, point, radius = Infinity) {
  const { trees, removed, cells } = forestOf(planet);
  let best = -1, range = radius;
  function consider(i) {
    if (removed.has(i)) return;
    const d = distance(point, trees[i]);
    if (d < range) { range = d; best = i; }
  }
  if (Number.isFinite(radius)) {
    const dx = Math.ceil(radius / Math.max(.19, Math.cos((Math.abs(point.y)+radius)*ANGLE)));
    const dy = Math.ceil(radius);
    for (let x = -dx; x <= dx; x++) for (let y = -dy; y <= dy; y++) {
      const entries = cells.get(key(Math.round(point.x)+x, Math.round(point.y)+y));
      if (entries) entries.forEach(consider);
    }
  } else trees.forEach((_, i) => consider(i));
  return best;
}

function fell(planet, id) {
  const { trees, removed } = forestOf(planet);
  if (!trees[id] || removed.has(id)) return false;
  planet.felled.push(id); removed.add(id);
  return true;
}

/** 建造占用树木的格点时清场，物品仅由机甲主动采伐获得，拆掉设施不会让树林重新长出。 */
export function clearFootprint(planet, point) {
  // 两种有林地貌共用同一格点索引，建筑落地时都要清掉占位树。
  if (!['mediterranean','tropicana'].includes(planet.biome) || Math.hypot(point.x,point.y)<7) return;
  for (const id of forestOf(planet).cells.get(key(point.x,point.y)) || []) fell(planet, id);
}

export function startFelling(game, id) {
  const { trees, removed } = forestOf(game.planet);
  if (game.space.flight || !trees[id] || removed.has(id)) throw new Error('当前没有可采伐的树木');
  const {x,y} = trees[id];
  Object.assign(game.mecha, { timber:id, mining:null, progress:0, target:{x,y} });
}

/** 机甲到达树旁再开始计时，目标在途中被建造清除时直接取消。产物由种子与单棵树决定，重读进度不会重抽掉落。 */
export function workTimber(game, dt) {
  const m = game.mecha;
  if (m.timber === null) return;
  const {trees, removed} = forestOf(game.planet), id = m.timber, tree = trees[id];
  if (!tree || removed.has(id)) { m.timber=null; m.progress=0; m.target=null; return; }
  if (distance(m,tree)>1.35) { m.target={x:tree.x,y:tree.y}; return; }
  m.target=null; m.progress+=dt*(m.energy>0?1:.25); m.energy=Math.max(0,m.energy-.16*dt);
  if (m.progress<1.6) return;
  if (fell(game.planet,id)) {
    const random=rng(game.planet.seed^Math.imul(id+1,2654435761));
    // 网页采用固定种子近似不同树种的木材、植物燃料及稀有有机晶体产量。
    const loot={log:2+Math.floor(4*random())};
    if (random()<.64) loot['plant-fuel']=1+Math.floor(3*random());
    if (random()<.035) loot['organic-crystal']=1;
    merge(game.bag,loot); merge(game.stats.mined,loot);recordBatch(game.planet,game.elapsed,{},loot);
  }
  m.timber=null; m.progress=0;
}
