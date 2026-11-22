import {assemblers,belts,smelters,sorters,name,recipes} from './catalog.js';
import {maxHull} from './fog-rules.js';
import {count,add} from './stock.js';

// 来自 ItemProtoSet 的 Upgrades 顺序。大矿机与普通矿机的占位、储仓和提货端口不同，原型也未将它们编在同一组。
const families=[belts,sorters,assemblers,smelters,['chemical-plant','quantum-chemical-plant'],['matrix-lab','df-self-evolution-lab']];
const familyByType=new Map(families.flatMap(group=>group.map(type=>[type,group])));
export const gradeFamily=type=>familyByType.get(type);
export const canRefit=(part,type)=>!!part&&part.type!==type&&!!gradeFamily(part.type)?.includes(type);
export const refitQuantity=part=>part.layers||1;

/** 报价只读，返还空串表示可以换装。当前实验楼各层共用型号，整塔一次领齐相应层数的备件。 */
export function refitError(game,part,type){
  if(!canRefit(part,type))return '请选择同系列的其他型号';
  if(part.hull===0)return '设施已损毁，需要先重建';
  if(part.recipe&&part.recipe!=='research'&&!recipes[part.recipe]?.producers.includes(type))return '该型号不能执行当前配方，请先更换配方';
  const quantity=refitQuantity(part);
  return count(game.bag,type)<quantity?'替换件不足，需要 '+name(type)+' ×'+quantity:'';
}
/** 替换已经核实位置与距离的实体或同向分拣连接。先确认全额备件，再原位交换型号，失败时背包与工厂均保持原状。 */
export function refitPart(game,part,type){
  const error=refitError(game,part,type);if(error)throw new Error(error);
  const quantity=refitQuantity(part),old=part.type;
  // 受损设备换型后沿用耐久比例，否则可通过反复升降级免费修复。
  const condition=part.hull===undefined?null:part.hull/maxHull(part);
  add(game.bag,type,-quantity);add(game.bag,old,quantity);
  part.type=type;
  if(condition!==null)part.hull=maxHull(part)*condition;
  if(part.coater)part.coater.feed.type=type;
  game.planet.revision++;
  return part;
}
