import {wrap,clamp} from './world.js';
import {relayHealth,stationed,relayTripSeconds} from './space-hive.js';

export const fleetTarget=-3,stationaryRelay=-4,incomingRelay=-5;
export const lancerHealth=level=>2500+level*150;
/** 来袭船队与驻空、进场中继分属三类目标。默认只拦截来袭舰，高空选项由玩家显式启用。 */
export function selectOrbit(hive,body,field,settings){
  if(settings.space!==false&&hive?.raid?.body===body&&hive.raid.leg!=='return')return fleetTarget;
  if(!settings.high)return 0;
  if(hive?.flight?.body===body&&hive.flight.leg==='approach')return incomingRelay;
  return stationed(field)?stationaryRelay:0;
}
/** 从实际航段算出面向行星的投影位置。编队编号阻止上一波尚在飞行的导弹误伤下一波。 */
export function orbitContact(hive,body,field,id,clock=0){
  if(id===fleetTarget){
    const a=hive?.raid;if(!a||a.body!==body||a.leg==='return')return null;
    const site=a.mark||field.base,offset=a.leg==='approach'?(a.left-clock)/18:0;
    return {x:wrap(site.x-6+offset*17),y:clamp(site.y+4+offset*7,-43,43),height:13+offset*15,stamp:hive.waves};
  }
  if(id===incomingRelay){
    const flight=hive?.flight;if(!flight||flight.body!==body||flight.leg!=='approach')return null;
    const t=(flight.left-clock)/relayTripSeconds;
    return {x:wrap(flight.x+t*9),y:clamp(flight.y+t*3,-43,43),height:5.4+t*22,stamp:hive.attempts};
  }
  return id===stationaryRelay&&stationed(field)?{x:field.base.x,y:field.base.y,height:5.4,stamp:field.relaySerial||0}:null;
}
/** 只允许当前交战船体承伤。航行中失去的载荷随船消失，驻空时挨打才把敌意记入恒星巢穴。 */
export function damageOrbit(hive,field,target,amount){
  if(target===stationaryRelay){
    const before=field.relayHP??relayHealth(field.base.level),hit=Math.min(before,amount);
    field.relayHP=before-hit;field.grievance=(field.grievance||0)+hit*.24;
    if(field.relayHP===0){field.relayMatter=0;field.relayEnergy=0;field.bulk=0;}
    return;
  }
  if(target===incomingRelay){
    const ship=hive.flight;ship.hp=Math.max(0,(ship.hp??relayHealth(field.base.level))-amount);
    if(!ship.hp){hive.flight=null;hive.retry=30;hive.lostRelays=(hive.lostRelays||0)+1;}
    return;
  }
  const raid=hive.raid;
  raid.maxHP??=lancerHealth(field.base.level);
  raid.frontHP=Math.max(0,(raid.frontHP??raid.maxHP)-amount);
  if(!raid.frontHP){
    raid.ships--;hive.lostLancers=(hive.lostLancers||0)+1;
    if(!raid.ships)hive.raid=null;else raid.frontHP=raid.maxHP;
  }
}
