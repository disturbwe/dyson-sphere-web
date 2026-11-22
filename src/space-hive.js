import {axis,elevation,environments,key,rng} from './world.js';
import {homeSystemOf,starOf} from './cluster.js';
import {coreHealth,maxHull,hurtStructure} from './fog-rules.js';
import {settled} from './reform.js';
import {shieldMap,shieldStrength,absorbOrbital} from './planet-shield.js';
import {capabilitiesOf} from './upgrades.js';

export const relayTripSeconds=24;
export const relayHealth=level=>9000+300*level;
export const stationed=f=>!!f&&!f.sealed&&(f.relayHP??relayHealth(f.base.level))>0;
export const newHiveNetwork=()=>({clock:0,hives:{}});
export function newHive(){
  // 初始储备属于恒星系。地面基地封孔、切换行星或机甲离开都不重置这笔资源。
  return {matter:14400,energyMJ:3600,frame:-1,docked:0,flight:null,retry:0,attempts:0,landed:0,repelled:0,
    withdrawals:[],barges:[],delivered:0,threat:0,lancers:2,keel:-1,raid:null,waves:0,volleys:0};
}
export const hiveHere=game=>game.space.fogNet?.hives[homeSystemOf(game.space.current)];
const isDry=(p,spot)=>!environments[p.biome]?.ocean||elevation(spot.x,spot.y,p.seed,p.biome)>.12;
function freeSite(p,spot){
  const k=key(spot.x,spot.y);
  return !p.tiles[k]&&!p.construction?.sites[k]&&!settled(p,spot.x,spot.y)&&!Object.hasOwn(p.fog.oldWells||{},k)&&isDry(p,spot);
}
/** 新进驻的中继选择独立的干燥地表。只在到达时检查护盾，飞行期间改变供电或占用落点均会影响结果。 */
function landingSite(p,attempt){
  const f=p.fog;
  if(!f.sealed)return {x:f.base.x,y:f.base.y};
  const random=rng(p.seed+Math.imul(attempt,27011));
  for(let n=0;n<64;n++){
    const spot={x:Math.floor(random()*179)-89,y:Math.floor(Math.asin(random()*1.96-.98)*90/Math.PI)};
    if(freeSite(p,spot))return spot;
  }
  return null;
}
function occupy(p,spot,cargo,energy){
  let remaining=cargo;
  const f=p.fog;
  if(f.sealed){
    // 旧地热站的井温和已经入账的战利品随行星保留，换址只初始化新钻机及其建兵库存。
    if(f.well){f.oldWells??={};f.oldWells[key(f.base.x,f.base.y)]=f.base.level;}
    delete f.well;delete f.vacant;
    Object.assign(f,{base:{...spot,hp:coreHealth(0),level:0,xp:0},sealed:false,ready:4,matter:240,rebuild:0,threat:0});
    remaining-=240+4*16;p.revision++;
  }
  f.relaySerial=(f.relaySerial||0)+1;f.relayHP=relayHealth(f.base.level);f.relayMatter=remaining;f.bulk=0;f.relayEnergy=energy;
}
function advanceRelay(h,worlds){
  const flight=h.flight;
  if(flight){
    if(--flight.left>0)return;
    if(flight.leg==='return'){h.docked++;h.matter+=flight.cargo;h.energyMJ+=flight.energy;h.flight=null;h.retry=30;return;}
    const p=worlds.get(flight.body),f=p?.fog;
    if(f&&!stationed(f)&&freeSite(p,flight)){
      if(shieldStrength(shieldMap(p).sources,axis(flight.x,flight.y))>0){p.shield.repelled++;h.repelled++;}
      else{occupy(p,{x:flight.x,y:flight.y},flight.cargo,flight.energy);
        // 在途受损的船体保留剩余耐久，落地补给不修复中继。
        if(flight.hp!==undefined)p.fog.relayHP=Math.min(flight.hp,p.fog.relayHP);
        h.landed++;h.flight=null;return;}
    }
    flight.leg='return';flight.left=relayTripSeconds;return;
  }
  if(!h.docked){
    if(h.frame<0){if(h.matter<10800)return;h.matter-=10800;h.frame=0;}
    // 六百秒加工骨架，三百秒每秒注入 5 MJ。供能短缺时留在船坞，读档不会重新扣建材。
    if(h.frame>=600){if(h.energyMJ<5)return;h.energyMJ-=5;}
    if(++h.frame>=900){h.frame=-1;h.docked++;}return;
  }
  if(h.retry>0){h.retry--;return;}
  let berth=null,occupation=Infinity;
  for(const [body,p] of worlds){
    if(stationed(p.fog)||p.fog.units.length||h.withdrawals.some(ship=>ship.body===body))continue;
    const count=Object.keys(p.tiles).length;
    if(count>=occupation)continue;
    const site=landingSite(p,h.attempts+1);
    if(site){berth={body,...site};occupation=count;}
  }
  if(!berth||h.matter<6000||h.energyMJ<1500){h.retry=30;return;}
  // 降落物资与建设船体分账。遭到拒降时原船带货返航，只有成功落地的货物进入钻机库存。
  h.matter-=6000;h.energyMJ-=1500;h.attempts++;h.docked--;
  h.flight={...berth,cargo:6000,energy:1500,leg:'approach',left:relayTripSeconds};
}
function transferMatter(h,worlds){
  // 驳船分两段交割。航行期间的库存只在货单中，由到达方签收，原基地撤离后剩余能量带回巢穴。
  for(let i=h.barges.length-1;i>=0;i--){
    const trip=h.barges[i];if(--trip.left>0)continue;
    if(trip.leg==='matter'){
      h.matter+=6000;h.delivered+=6000;trip.leg='energy';trip.energy=Math.min(1500,h.energyMJ);h.energyMJ-=trip.energy;trip.left=relayTripSeconds;
    }else{
      const f=worlds.get(trip.body)?.fog;
      if(stationed(f)&&f.base.x===trip.x&&f.base.y===trip.y)f.relayEnergy=(f.relayEnergy??1500)+trip.energy;
      else h.energyMJ+=trip.energy;
      h.barges.splice(i,1);
    }
  }
  for(let i=h.withdrawals.length-1;i>=0;i--){
    const t=h.withdrawals[i];if(--t.left>0)continue;
    h.docked++;h.matter+=t.cargo;h.energyMJ+=t.energy;h.withdrawals.splice(i,1);
  }
  for(const [body,p] of worlds){
    const f=p.fog;
    h.threat=Math.min(100,h.threat+(f.grievance||0));f.grievance=0;
    if(f.sealed&&(f.relayHP??(f.vacant?0:1))>0){
      h.withdrawals.push({body,x:f.base.x,y:f.base.y,left:relayTripSeconds,cargo:f.relayMatter+(f.bulk||0),energy:f.relayEnergy??1500});
      f.relayHP=0;f.relayMatter=0;f.relayEnergy=0;f.bulk=0;
    }
    if(!stationed(f)||!f.base.hp)continue;
    const energy=f.relayEnergy??1500,spent=Math.min(.30,energy);
    f.relayEnergy=energy-spent;f.bulk=(f.bulk||0)+Math.round(10*spent);
    if(f.bulk+f.relayMatter<10900||h.barges.some(t=>t.body===body))continue;
    const fromBulk=Math.min(f.bulk,6000);f.bulk-=fromBulk;f.relayMatter-=6000-fromBulk;
    h.barges.push({body,x:f.base.x,y:f.base.y,leg:'matter',left:relayTripSeconds,energy:0});
  }
}
function buildLancers(h){
  if(h.lancers+(h.raid?.ships||0)>=12)return;
  if(h.keel<0){if(h.matter<1800||h.energyMJ<324)return;h.matter-=1800;h.energyMJ-=324;h.keel=0;}
  if(++h.keel>=180){h.keel=-1;h.lancers++;}
}
function targetStructure(p,round){
  // 一轮齐射才筛一次存活建筑，地面单位独立寻路。设施档位和护盾命中都按被击中的经纬度结算。
  const candidates=Object.values(p.tiles).filter(t=>maxHull(t)>0&&t.hull!==0);
  return candidates.length?candidates[round%candidates.length]:null;
}
function advanceRaid(game,star,h,worlds){
  if(!h.raid){
    if(h.threat<100||!h.lancers||game.space.flight||homeSystemOf(game.space.current)!==star||!worlds.has(game.space.current))return;
    const ships=Math.min(h.lancers,2+Math.min(4,h.waves));
    h.lancers-=ships;h.threat=0;h.waves++;
    h.raid={body:game.space.current,ships,leg:'approach',left:18,round:0,mark:null};return;
  }
  const a=h.raid;if(--a.left>0)return;
  if(a.leg==='return'){h.lancers+=a.ships;h.raid=null;return;}
  const p=worlds.get(a.body),target=p&&targetStructure(p,a.round);
  if(!target||a.round>=3){a.leg='return';a.left=18;return;}
  a.leg='fire';a.left=8;a.round++;h.volleys++;a.mark={x:target.x,y:target.y};
  const upgrades=capabilitiesOf(game),damage=a.ships*(150+10*p.fog.base.level);
  const spill=absorbOrbital(p,target,damage,upgrades.shieldEfficiency);
  if(spill>0)hurtStructure(p,target,spill/upgrades.durability);
}
/** 从固定步长累计一秒再结算已模拟星系。每个星系共享船坞和舰队，后台行星同样可接货、拒降或受击。 */
export function advanceHives(game,addresses,dt){
  if(game.fogMode==='off')return;
  const net=game.space.fogNet;
  net.clock+=dt;if(net.clock+1e-8<1)return;net.clock=Math.max(0,net.clock-1);
  const stars=new Map();
  for(const [id,p] of addresses){if(!p.fog)continue;const star=homeSystemOf(id);
    if(!stars.has(star))stars.set(star,new Map());stars.get(star).set(id,p);}
  for(const [star,worlds] of stars){
    const h=net.hives[star]??=newHive();h.energyMJ=Math.min(60000,h.energyMJ+6*starOf(game,star).luminosity);
    transferMatter(h,worlds);advanceRelay(h,worlds);buildLancers(h);advanceRaid(game,star,h,worlds);
  }
}
