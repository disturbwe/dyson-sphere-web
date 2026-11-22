import {flow,recordFlow} from './production-log.js';
import {add} from './stock.js';
import {distance} from './world.js';
import {extraRate} from './proliferation.js';
import {capabilitiesOf} from './upgrades.js';
import {ammoFor,ammoStats,equipment,gauss,missile,jammer,plasma,shortPlasma} from './defense-equipment.js';
import {damageOrbit,orbitContact,fleetTarget} from './defense-orbit.js';

export const flightLimit=1024;
export const groundContact=(field,id)=>id===-1?field.base:field.units.find(unit=>unit.id===id);
/** 统一登记实际扣除的耐久和基地经验。已出生单位保留原等级，基地被摧毁时重新开始重建计时。 */
export function damageGround(field,unit,amount){
  if(!unit?.hp)return;
  const hit=Math.min(unit.hp,amount);unit.hp-=hit;field.base.xp+=hit;
  if(unit===field.base){
    field.grievance=(field.grievance||0)+hit*.002;
    field.threat=Math.min(100,field.threat+hit*.13);
    if(!unit.hp){field.ready=0;field.rebuild=75;field.threat=0;}
  }
  while(field.base.level<30&&field.base.xp>=900*(field.base.level+1)){
    field.base.xp-=900*(field.base.level+1);field.base.level++;if(field.base.hp>0)field.base.hp+=120;
  }
}
function splash(field,center,damage,radius){
  for(const obj of field.units)if(distance(center,obj)<=radius)damageGround(field,obj,damage);
  if(distance(center,field.base)<=radius)damageGround(field,field.base,damage);
}
/** 每次开包都从进料槽移除一件实物，增产点只作用于这一个弹匣。干扰胶囊的余量按接触单位扣减。 */
function spend(game,planet,tile){
  const gun=tile.defense;
  if(!gun.rounds){
    const ammo=ammoFor(tile);if(!ammo)return null;
    const grade=add(tile.input,ammo,-1);gun.ammo=ammo;recordFlow(planet,game.elapsed,ammo,flow.used);
    gun.rounds=Math.floor(ammoStats[ammo].rounds*(1+extraRate[grade]));
  }
  gun.rounds--;return ammoStats[gun.ammo];
}
function pulse(game,planet,tile){
  const field=planet.fog;
  const gun=tile.defense;
  let touched=0;
  for(const unit of field.units){
    if(!unit.hp||distance(tile,unit)>equipment[jammer].far)continue;
    const round=spend(game,planet,tile);if(!round)break;
    const factor=round.tier?.2:.5,duration=round.tier?1.6:1;
    // 两档脉冲分别计时；弱脉冲续期不会替高档效果延长持续时间。
    const prop=factor===.2?'suppressedUntil':'jammedUntil';unit[prop]=Math.max(unit[prop]||0,game.elapsed+duration);
    touched++;
  }
  gun.contacts=(gun.contacts||0)+touched;if(touched)gun.shots++;
  return touched>0;
}
export function moveFactor(unit,now){
  if(unit.suppressedUntil>now)return .2;
  return unit.jammedUntil>now?.5:1;
}
/** 在已供电的射击周期支付物品并处理本次命中。导弹把伤害和目标编号封在在途记录里，断电或拆除发射塔不撤销已经发射的弹体。 */
export function fireRound(game,planet,body,hive,tile,dt,record){
  const gun=tile.defense,rule=equipment[tile.type],field=planet.fog;
  if(!tile.power){tile.status='未供电';return;}
  const orbital=gun.target<=fleetTarget;
  const target=orbital?orbitContact(hive,body,field,gun.target,game.space.fogNet.clock):groundContact(field,gun.target);
  if(!target||(!orbital&&!target.hp)){gun.target=0;tile.status='警戒';return;}
  gun.work=Math.min(1,gun.work+dt*tile.power*rule.rate);if(gun.work+1e-9<1)return;
  if(tile.type===jammer){
    if(pulse(game,planet,tile)){record(game,planet,tile,target,0x648fff);tile.status='干扰脉冲';}
    gun.work=0;return;
  }
  // 仅极端饱和时保留本次发射进度，已有弹体继续结算，库存留在发射器中。
  if(tile.type===missile&&field.missiles?.length>=flightLimit){tile.status='等待发射通道';return;}
  const round=spend(game,planet,tile);if(!round){gun.target=0;tile.status='等待装填';return;}
  const cap=capabilitiesOf(game);
  const bonus=tile.type===gauss?cap.kineticDamage:[plasma,shortPlasma].includes(tile.type)?cap.energyDamage:cap.explosiveDamage;
  const damage=round.damage*bonus;
  gun.work=0;gun.shots++;tile.status=orbital?'轨道拦截':'交战';
  if(tile.type===missile){
    const duration=Math.max(.22,Math.hypot(distance(tile,target),target.height||0)/(8+round.tier*4));
    (field.missiles??=[]).push({originX:tile.x,originY:tile.y,x:target.x,y:target.y,height:target.height||0,
      target:gun.target,stamp:target.stamp||0,ammo:gun.ammo,damage,born:game.elapsed,due:game.elapsed+duration});return;
  }
  if(orbital)damageOrbit(hive,field,gun.target,damage);
  else if(round.radius)splash(field,target,damage,round.radius);
  else damageGround(field,target,damage);
  const color=tile.type===gauss?0xffcc61:tile.type===plasma||tile.type===shortPlasma?0xd0a4ff:0xff8461;
  record(game,planet,tile,target,color,target.height??.43);
}
/** 只在命中时查询当前战场。地面单位离场后在末次记录处结算范围伤害，太空目标按船次校验，避免误伤后继舰队。 */
export function resolveMissiles(game,planet,body,hive){
  const field=planet.fog,flights=field.missiles;if(!flights?.length)return;
  let keep=0;
  for(const shot of flights){
    if(shot.due>game.elapsed){flights[keep++]=shot;continue;}
    if(shot.target<=fleetTarget){
      const contact=orbitContact(hive,body,field,shot.target);
      if(contact&&contact.stamp===shot.stamp)damageOrbit(hive,field,shot.target,shot.damage);
    }else{
      const contact=groundContact(field,shot.target);
      splash(field,contact?.hp?contact:shot,shot.damage,ammoStats[shot.ammo].radius);
    }
  }
  flights.length=keep;
}
