import {distance} from './world.js';
import {oilHours} from './sector-rules.js';

export const isSeep = vein => vein.item === 'crude-oil';
export const availableSite = vein => !vein.buried && (isSeep(vein) || vein.amount > 0);
const minimum = .1;

/** 同一油泉限设一台萃取站。勘探时可点选已有油井，建造时传入占用表排除已绑定的泉眼。 */
export function nearestSeep(planet, point, occupied) {
  let nearest=-1, limit=1.5;
  planet.veins.forEach((vein,i)=>{
    if (vein.buried || !isSeep(vein) || occupied?.has(i)) return;
    const d=distance(point,vein);
    if (d<limit) {nearest=i; limit=d;}
  });
  return nearest;
}
/** 蓝图预占的油泉也不能被第二座油井先行绑定。取消工地后会随下一次查询自然释放。 */
export const occupiedSeeps = planet => new Set([...Object.values(planet.tiles),...Object.values(planet.construction?.sites||{})].filter(t=>t.type==='oil-extractor').map(t=>t.seep));

/** 只累计实际开工量，低电按通电比例衰减。把半衰期曲线积分到产量，跨越每秒 0.1 的下限后按保底速率继续。 */
export function drawOil(seep, dt, upgrade, resource='1') {
  const work=dt*upgrade.miningRate;
  if (!work || seep.rate<=minimum || resource==='infinite') return work*seep.rate;
  const k=Math.LN2/(oilHours(resource)*3600)*upgrade.orePerItem;
  const falling=Math.min(work,Math.log(seep.rate/minimum)/k);
  const extracted=seep.rate*(-Math.expm1(-k*falling))/k + minimum*(work-falling);
  seep.rate=Math.max(minimum,seep.rate*Math.exp(-k*falling));
  return extracted;
}

/** 旧档的萃取站固定产油 1.5/s，可能数台共享一个矿点。逐台分配旧泉，在必要的旧站脚下补泉以保留生产线。 */
export function restoreOldSeeps(planet) {
  const used=new Set();
  for (const vein of planet.veins) if (isSeep(vein)) {delete vein.amount; vein.rate??=1.5;}
  for (const t of Object.values(planet.tiles)) {
    if (t.type!=='oil-extractor') continue;
    let i=nearestSeep(planet,t,used);
    if (i<0) i=planet.veins.push({x:t.x,y:t.y,item:'crude-oil',rate:1.5})-1;
    used.add(i); t.seep=i;
  }
}
