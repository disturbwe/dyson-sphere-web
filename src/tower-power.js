import {signal} from './defense-equipment.js';
import {distance} from './world.js';
import {capabilitiesOf} from './upgrades.js';

export const wireless='wireless-power-tower';
const chargeSpec={
  [wireless]:{reach:6/6,idle:90,charge:4710},
  [signal]:{reach:14/6,idle:1350,charge:8250}
};
/** 一次算出本步各塔要从电网提取的充电功率（kW）。共用剩余容量可防止多塔同时给即将充满的核心多计用电。 */
export function prepareCharge(game,planet,top,dt){
  const request=top.towerRequests;
  request.clear();
  if(planet!==game.planet||game.space.flight||!top.chargeTowers.length)return;
  const room=Math.max(0,capabilitiesOf(game).coreMJ-game.mecha.energy)*1000/dt;
  if(!room)return;
  let total=0;
  for(const tower of top.chargeTowers){
    const spec=chargeSpec[tower.type];
    if(tower.defense?.enabled===false||distance(tower,game.mecha)>spec.reach)continue;
    total+=spec.charge;request.set(tower,spec.charge);
  }
  if(total>room)for(const [tower,kw] of request)request.set(tower,kw*room/total);
}
export const towerLoad=(top,tower)=>chargeSpec[tower.type].idle+(top.towerRequests.get(tower)||0);
/** 电网解算后再交付核心能量，掉电、后台行星与离开范围都不会留下上一步的充电流。 */
export function deliverCharge(game,tower,top,dt){
  const kw=(top.towerRequests.get(tower)||0)*tower.power;
  if(kw>0)game.mecha.energy=Math.min(capabilitiesOf(game).coreMJ,game.mecha.energy+kw*dt/1000);
  tower.chargeKW=kw;
  if(!tower.power)tower.status='未供电';
  else if(tower.defense?.enabled===false)tower.status='已停用';
  else if(kw>0)tower.status='机甲充电';
  else tower.status=tower.type===signal?'信号覆盖':'待机';
}
