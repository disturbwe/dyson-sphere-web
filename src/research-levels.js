import ranges from '../data/repeatable.json' with { type: 'json' };
import {items, name, research} from './catalog.js';

// 系列首级保留目录 ID。续级沿用同一图谱位置，@ 后的等级唯一标识队列和暂停进度。
export const levelRanges = ranges;
const rangeOf = id => Object.hasOwn(ranges, id) ? ranges[id] : null;
export function baseTopic(id) {
  if (typeof id !== 'string') return '';
  const marker = id.indexOf('@');
  return marker < 0 ? id : id.slice(0, marker);
}
export function keyAt(base, rank) {
  const range = rangeOf(base);
  if (!range || !Number.isInteger(rank) || rank < range.first || rank > range.limit) return null;
  return rank === range.first ? base : base + '@' + rank;
}
export function rankOf(id) {
  const base = baseTopic(id), range = rangeOf(base);
  if (!range) return 0;
  if (base === id) return range.first;
  const rank = Number(id.slice(base.length + 1));
  return keyAt(base, rank) === id ? rank : 0;
}
const derived = new Map();
/** 返回一个确切等级的哈希和材料。非法编号返回 null。按需缓存，最高万级的系列不会预建万个节点。 */
export function studySpec(id) {
  if (Object.hasOwn(research, id)) return research[id];
  if (derived.has(id)) return derived.get(id);
  const level = rankOf(id);
  if (!level) return null;
  const range = ranges[baseTopic(id)], [constant, linear, quadratic] = range.hash;
  const hashes = constant + level * (linear + level * quadratic);
  // ItemPoints 是每 3600 哈希用量。先除后乘，使高阶资源账目仍为精确整数。
  const cost = Object.fromEntries(Object.entries(range.points).map(([material, points]) => [material, hashes / 3600 * points]));
  const spec = {hashes, cost};
  if (derived.size >= 128) derived.delete(derived.keys().next().value);
  derived.set(id, spec);
  return spec;
}
const oldHashes = {'dyson-sphere-stress-system-1':180000,'mecha-core-6':7200000,'energy-circuit-6':14400000};
export const legacyPrice = id => Object.hasOwn(oldHashes, id);
/** 第九版存档中已开工的三种课题按开工时价格完结，暂停与读档仍保持同一笔预付款。 */
export function jobSpec(job) {
  const spec = studySpec(job.id);
  if (!job.legacyPrice || !legacyPrice(job.id)) return spec;
  const hashes = oldHashes[job.id];
  return {hashes, cost:Object.fromEntries(Object.entries(spec.cost).map(([id, n]) => [id, n * (hashes / spec.hashes)]))};
}
export function studyParents(id) {
  const base = baseTopic(id);
  if (id !== base) return [keyAt(base, rankOf(id)-1)];
  // 运载量 XII 的前一原型覆盖 IX–XI，游戏数据 PreTechsMax 指向该段的最后一级。
  if (base === 'logistics-carrier-capacity-12') return ['logistics-carrier-capacity-9@11'];
  return items[id]?.technology?.prerequisites || [];
}
export function studyName(id) {
  const base = baseTopic(id);
  if (id === base) return name(id);
  return name(base).replace(/\s*\(Lv\d+\)\s*$/, '') + ' (Lv' + rankOf(id) + ')';
}
export function studyDone(game, id, known) {
  const base = baseTopic(id);
  if (id === base) return known ? known.has(id) : game.techs.includes(id);
  const rank = rankOf(id);
  return rank > 0 && (game.science.ranks?.[base] || 0) >= rank;
}
export function finishStudy(game, id) {
  const base = baseTopic(id);
  if (base === id) { game.techs.push(id); return; }
  // 每个原型只记最高已付等级。替换引用可使能力与图谱缓存准确失效，存档大小与等级无关。
  game.science.ranks = {...game.science.ranks, [base]:rankOf(id)};
}
/** 图谱固定一个格子，优先打开该系列正在研究或已排队的确切等级。到顶后显示最后的完工状态。 */
export function currentLevelKey(game, base) {
  const range = rangeOf(base);
  if (!range || !game.techs.includes(base)) return base;
  const active = game.research?.id;
  if (active && baseTopic(active) === base) return active;
  const pending = game.science.queue.find(id => baseTopic(id) === base);
  if (pending) return pending;
  const completed = game.science.ranks?.[base] || range.first;
  return keyAt(base, Math.min(completed + 1, range.limit));
}
