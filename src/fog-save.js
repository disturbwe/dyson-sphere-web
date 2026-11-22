import {maxHull,defenses,battleCap,coreHealth,lootTiers} from './fog-rules.js';
import {equipment,acceptsAmmo,ammoStats,missile,jammer} from './defense-equipment.js';
import {flightLimit} from './defense-fire.js';
import {incomingRelay,fleetTarget} from './defense-orbit.js';
const allowedLoot=new Set(lootTiers.flatMap(t=>t.items));
const finite=(v,min=0,max=Infinity)=>Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const point=p=>p&&finite(p.x,-90,90)&&finite(p.y,-45,45);
function valid(ok){if(!ok)throw new Error('黑雾战场存档无效');}
/** 校验存档边界的耐久、弹箱余量、基地成长及可领取残骸。残骸与在场单位不能共享编号，否则同一掉落可领两次。 */
export function validateBattlefield(game,planet){
  for(const t of Object.values(planet.tiles)){
    if(t.hull!==undefined)valid(maxHull(t)>0&&finite(t.hull,0,maxHull(t)));
    const d=t.defense;
    if(!defenses.includes(t.type)){valid(d===undefined);continue;}
    valid(d&&typeof d.enabled==='boolean'&&typeof d.collect==='boolean'&&typeof d.mend==='boolean'&&integer(d.target,equipment[t.type]?.orbital?incomingRelay:-2)&&finite(d.shots)&&finite(d.work,0,1.01)&&integer(d.rounds,0));
    valid((d.ammo===null||acceptsAmmo(t.type,d.ammo))&&(!d.rounds||d.ammo&&d.rounds<=Math.floor(ammoStats[d.ammo].rounds*1.25)));
    for(const setting of ['ground','high','space'])if(d[setting]!==undefined)valid(typeof d[setting]==='boolean');
    if(d.contacts!==undefined)valid(t.type===jammer&&integer(d.contacts));
  }
  const f=planet.fog;
  if(game.fogMode==='off'||planet.biome==='gas'){valid(f==null);return;}
  valid(f&&point(f.base)&&integer(f.base.x,-89,89)&&integer(f.base.y,-43,43)&&integer(f.base.level,0,30)&&finite(f.base.hp,0,coreHealth(f.base.level))&&finite(f.base.xp));
  valid(typeof f.sealed==='boolean'&&(!f.sealed||f.base.hp===0)&&(!f.well||f.sealed&&f.well===true));
  valid(integer(f.relayMatter,0,6000)&&finite(f.rebuild,0,75)&&finite(f.threat,0,100)&&finite(f.ready,0,battleCap+1e-7)&&finite(f.matter,0,15000)&&finite(f.clock,0,.201));
  valid(integer(f.seed,0,0xffffffff)&&finite(f.spent)&&integer(f.nextId,1));
  for(const key of ['wave','kills','fallen','repaired','expired','soil','unitCount','lastWave'])valid(integer(f[key]));
  valid(f.loot&&typeof f.loot==='object'&&Object.entries(f.loot).every(([id,v])=>allowedLoot.has(id)&&integer(v)));
  valid(Array.isArray(f.units)&&f.units.length<=battleCap&&Array.isArray(f.debris)&&f.unitCount===f.kills+f.units.length&&f.nextId===f.unitCount+1);
  // 在途保存的是已经支付的游戏弹体。目标可以先一步离场，读档后一律仍按原发射批次结算。
  if(f.missiles!==undefined){
    valid(Array.isArray(f.missiles)&&f.missiles.length<=flightLimit);
    for(const m of f.missiles){
      valid(point(m)&&point({x:m.originX,y:m.originY})&&acceptsAmmo(missile,m.ammo)&&finite(m.height,0,32));
      valid(integer(m.target,incomingRelay,f.nextId-1)&&(m.target>0||m.target===-1||m.target<=fleetTarget)&&integer(m.stamp));
      valid(finite(m.damage)&&m.damage>0&&finite(m.born,0,game.elapsed)&&finite(m.due,game.elapsed,m.born+32)&&m.due>m.born);
    }
  }
  for(const u of f.units)for(const prop of ['jammedUntil','suppressedUntil'])if(u[prop]!==undefined)valid(finite(u[prop],0,game.elapsed+1.601));
  const ids=new Set();
  for(const entity of [...f.units,...f.debris]){valid(point(entity)&&integer(entity.id,1,f.nextId-1)&&!ids.has(entity.id));ids.add(entity.id);}
  for(const u of f.units)valid(['raider','ranger'].includes(u.kind)&&integer(u.level,0,30)&&finite(u.hp,0,205)&&u.hp>0&&Number.isFinite(u.angle)&&typeof u.goal==='string');
  for(const d of f.debris)valid(allowedLoot.has(d.item)&&integer(d.count,1)&&integer(d.soil)&&finite(d.until));
}
