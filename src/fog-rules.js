import tiers from '../data/fog-loot.json' with {type:'json'};
import {distance,elevation,rng,wrap} from './world.js';
import {count} from './stock.js';

import {gauss,extraDefenses,missile,cannon,plasma,shortPlasma,jammer,signal,acceptsAmmo} from './defense-equipment.js';
export {gauss} from './defense-equipment.js';
export const laser='df-laser-turret', analysisBase='df-battlefield-analysis-base';
export const defenses=[gauss,laser,analysisBase,...extraDefenses];
export const fogModes={off:'和平模式',passive:'被动',normal:'正常',sharp:'好战'};
export const coreHealth=level=>2000+level*120;
export const battleCap=48;
export const lootTiers=tiers;
const hulls={ 'holo-beacon':160,'df-planetary-shield-generator':1500,[gauss]:420,[laser]:500,[analysisBase]:750,[missile]:560,[cannon]:600,[plasma]:800,[shortPlasma]:380,[jammer]:450,[signal]:3000,'wind-turbine':300,'solar-panel':250,'thermal-power-plant':500,'mining-machine':420,'arc-smelter':360,'assembling-machine-1':400,'tesla-tower':240 };
// 低阶炉与制造台沿用旧档耐久，高阶按原型 ModelProtoSet 的同系列耐久比延续，升级后的设备仍能受击和重建。
Object.assign(hulls,{'plane-smelter':396,'df-negentropy-smelter':432,'assembling-machine-2':433,'assembling-machine-3':467,'df-recomposing-assembler':500});
export const maxHull=tile=>hulls[tile?.type]||0;
export const coreOpen=(planet,p)=>!!planet.fog&&!planet.fog.sealed&&planet.fog.base.hp===0&&distance(planet.fog.base,p)<.25;
export const nearCore=(planet,p)=>!!planet.fog&&!planet.fog.sealed&&planet.fog.base.hp>0&&distance(planet.fog.base,p)<2.2;

/** 独立生成每颗固态行星的巢址。初始着陆保留安全距离，其他教学场景由创建方选择是否有黑雾。 */
export function createField(planet,mode,site=null,level=0){
  if(mode==='off'||planet.biome==='gas')return null;
  const random=rng(planet.seed^0x61f379b);
  if(!site){
    for(let i=0;i<100;i++){
      const angle=random()*Math.PI*2,r=24+12*random();
      const point={x:Math.round(Math.cos(angle)*r),y:Math.round(Math.sin(angle)*r*.65)};
      if(elevation(point.x,point.y,planet.seed,planet.biome)>.13){site=point;break;}
    }
    site??={x:9,y:0};
  }
  return {base:{...site,hp:coreHealth(level),level,xp:0},relayMatter:6000,rebuild:0,sealed:false,threat:0,ready:8,matter:800,
    units:[],debris:[],wave:0,nextId:1,seed:(planet.seed^0x7de8fd73)>>>0,clock:0,spent:0,kills:0,fallen:0,repaired:0,expired:0,soil:0,loot:{},unitCount:0,lastWave:0};
}
/** 残骸种类按出生等级决定，概率采用本地种子抽样。将游标随档保存，途中读档不能改变掉落。 */
export function randomRoll(field){field.seed=(Math.imul(field.seed,1664525)+1013904223)>>>0;return field.seed/4294967296;}
export function spawnDebris(field,unit,now){
  const tiersAvailable=Math.min(tiers.length-1,Math.floor(unit.level/3));
  const tier=tiers[Math.floor(randomRoll(field)*(tiersAvailable+1))];
  const item=tier.items[Math.floor(randomRoll(field)*tier.items.length)];
  const pile={id:unit.id,x:wrap(unit.x),y:unit.y,item,count:1+Math.floor(randomRoll(field)*2),soil:8+unit.level*2,until:now+90};
  // 单位阵亡和可见实例彼此独立。满额时只合并同种实物，不用删除旧残骸腾位置。
  const stack=field.debris.find(p=>p.item===item&&distance(p,pile)<.85);
  if(stack){stack.count+=pile.count;stack.soil+=pile.soil;stack.until=pile.until;}else field.debris.push(pile);
}
export function setDefense(tile){
  if(defenses.includes(tile.type))tile.defense={enabled:true,target:0,shots:0,work:0,rounds:0,ammo:null,collect:true,mend:true};
}
export function defenseInput(t,id){
  if(acceptsAmmo(t.type,id))return count(t.input,id)<40;
  return t.type===analysisBase&&Object.hasOwn(hulls,id)&&count(t.input,id)<20;
}
/** 结算到达设施本体的伤害。耐久归零时停用设施、刷新电网和防御索引，由分析站或机甲消耗备件重建。 */
export function hurtStructure(p,target,damage){
  const hp=target.hull??maxHull(target);if(hp<=0)return;
  target.hull=Math.max(0,hp-damage);
  if(target.hull===0){target.status='已损毁 · 待重建';target.power=0;if(target.defense)target.defense.target=0;p.fog.fallen++;p.revision++;}
}
/** 旧设施在受击前隐含满耐久。复建必须消耗同型备件，原位置与接线保留，避免拆建时重复退还机件。 */
export function restoreRuin(planet,tile,bag){
  if(!maxHull(tile)||tile.hull!==0)throw new Error('所选设施无需重建');
  if(!count(bag,tile.type))throw new Error('重建需要一个同型设施');
  if(--bag[tile.type]===0)delete bag[tile.type];
  delete tile.hull;tile.status='待机';planet.revision++;
  if(planet.fog)planet.fog.repaired++;
}
