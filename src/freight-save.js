import {items} from './catalog.js';
import {stationTypes,modes,maxSlot} from './stations.js';
import {portKey} from './freight.js';
import {capabilitiesOf} from './upgrades.js';
import {largeMiner,mineConfig,mineCapacity} from './advanced-miner.js';
import {collector,gasProfile,collectorCapacity} from './gas.js';
import {count} from './stock.js';

const valid=ok=>{if(!ok)throw new Error('物流存档的货单、仓位或运力不一致');};
const integer=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const range=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const physical=id=>['components','buildings'].includes(items[id]?.category);


/** 轨道站的气体种类由天体决定，只能被需求方提货。在途占仓和船只归属仍由全星系清单复算。 */
function checkCollector(game,planet,t){
  const {station:s}=t, gases=gasProfile(planet).gases;
  valid(planet.biome==='gas'&&s&&Array.isArray(s.slots)&&s.slots.length===2);
  valid(['drones','vessels','awayDrone','awayVessel','warpers'].every(k=>s[k]===0));
  valid(Array.isArray(t.fractions)&&t.fractions.length===2&&t.fractions.every(f=>range(f,0,1)&&f<1));
  const slots=new Map();
  for(const [i,slot] of s.slots.entries()){
    valid(slot&&slot.item===gases[i].item&&slot.local==='storage'&&['supply','storage'].includes(slot.remote));
    valid(integer(slot.limit,collectorCapacity(game))&&slot.limit>0&&slot.incoming===0&&integer(slot.held));
    valid(count(t.output,slot.item)+slot.held<=slot.limit);
    slots.set(slot.item,{slot,incoming:0,held:0});
  }
  valid(Object.keys(t.input).length===0&&Object.keys(t.output).every(item=>slots.has(item)));
  return {tile:t,slots,drone:0,vessel:0};
}
/** 采矿机可接待本星取货。核对单一矿种和封存的现货，再由全局航单复算占仓。 */
function checkMine(game,planet,t){
  const s=t.station,config=t.miner;
  valid(s&&Array.isArray(s.slots)&&s.slots.length===1&&config);
  valid(['drones','vessels','awayDrone','awayVessel','warpers'].every(k=>s[k]===0));
  valid(integer(config.nextPort,8)&&integer(config.stack,capabilitiesOf(game).portHeight)&&Number.isInteger(config.speed));
  mineConfig(config);
  valid(Array.isArray(t.veins)&&new Set(t.veins).size===t.veins.length);
  const slot=s.slots[0],slots=new Map();
  if(slot){
    valid(physical(slot.item)&&slot.item!=='crude-oil'&&planet.veins.some(v=>v.item===slot.item));
    valid(t.veins.every(i=>planet.veins[i].item===slot.item)&&['supply','storage'].includes(slot.local)&&slot.remote==='storage');
    // 同一步中科技可在远端研究站完成，矿仓可在下一次工业结算才扩容。
    valid(integer(slot.limit,mineCapacity(game))&&slot.limit>=5000&&slot.limit%1000===0&&integer(slot.held)&&slot.incoming===0);
    valid(count(t.output,slot.item)+slot.held<=slot.limit);
    slots.set(slot.item,{slot,incoming:0,held:0});
  }else valid(t.veins.length===0);
  valid(Object.keys(t.input).length===0&&Object.keys(t.output).every(id=>slots.has(id)));
  return {tile:t,slots,drone:0,vessel:0};
}
function checkStation(game,t){
  const s=t.station,spec=stationTypes[t.type],max=maxSlot(game,t);
  valid(s&&Array.isArray(s.slots)&&s.slots.length===spec.slots);
  valid(s.collectGas===undefined||spec.vessels&&typeof s.collectGas==='boolean');
  valid(range(s.energy,0,spec.energy)&&range(s.chargeMW,spec.vessels?30:1,spec.maxMW));
  valid(integer(s.drones,spec.drones)&&integer(s.vessels,spec.vessels)&&integer(s.awayDrone,s.drones)&&integer(s.awayVessel,s.vessels));
  valid(integer(s.warpers,spec.vessels?50:0)&&range(s.minDrone,1,100)&&range(s.minVessel,1,100)&&range(s.range,20,180)&&range(s.warpAU,.5,60)&&typeof s.requireWarp==='boolean');
  const slots=new Map();
  for(const slot of s.slots){
    if(slot===null)continue;
    valid(slot&&physical(slot.item)&&!slots.has(slot.item)&&integer(slot.limit,max));
    valid(modes.includes(slot.local)&&modes.includes(slot.remote)&&(spec.vessels||slot.remote==='storage'));
    valid(integer(slot.incoming)&&integer(slot.held)&&count(t.output,slot.item)+slot.incoming+slot.held<=slot.limit);
    slots.set(slot.item,{slot,incoming:0,held:0});
  }
  valid(Object.keys(t.input).length===0&&Object.keys(t.output).every(id=>slots.has(id)));
  valid(Array.isArray(s.exitItems)&&s.exitItems.length===4&&s.exitItems.every(id=>id===null||slots.has(id)));
  return {tile:t,slots,drone:0,vessel:0};
}
/** 导入时用航班清单重算占仓与在途运力，拒绝缺失端点、重复运输或凭空增加货物的存档。 */
export function validateFreight(game){
  const f=game.freight,ports=new Map(),limits=capabilitiesOf(game);
  valid(f&&integer(f.serial)&&range(f.untilDispatch,-.001,1.001)&&Array.isArray(f.trips)&&f.delivered&&typeof f.delivered==='object'&&!Array.isArray(f.delivered));
  valid(Object.entries(f.delivered).every(([item,n])=>physical(item)&&integer(n)));
  const planets=[[game.space.current,game.planet],...Object.entries(game.space.parked)];
  for(const [body,planet] of planets)for(const tile of Object.values(planet.tiles)){
    if(tile.type===collector)ports.set(portKey(body,tile),checkCollector(game,planet,tile));
    else if(tile.type===largeMiner)ports.set(portKey(body,tile),checkMine(game,planet,tile));
    else if(stationTypes[tile.type])ports.set(portKey(body,tile),checkStation(game,tile));else valid(!tile.station);
  }
  const ids=new Set();
  for(const trip of f.trips){
    valid(trip&&integer(trip.id,f.serial)&&trip.id>0&&!ids.has(trip.id));ids.add(trip.id);
    const src=ports.get(trip.source),dst=ports.get(trip.destination);
    valid(src&&dst&&src!==dst&&['drone','vessel'].includes(trip.kind));
    const remote=trip.kind==='vessel',sameBody=trip.source.split('/')[0]===trip.destination.split('/')[0];
    valid(!!stationTypes[dst.tile.type]);
    if(src.tile.type===largeMiner)valid(!remote&&sameBody&&trip.collect);
    else if(src.tile.type===collector)valid(remote&&!sameBody&&trip.collect&&stationTypes[dst.tile.type]?.vessels);
    else valid(dst.tile.type!==collector&&(remote?!sameBody&&stationTypes[src.tile.type].vessels&&stationTypes[dst.tile.type].vessels:sameBody));
    valid(src.slots.has(trip.item)&&dst.slots.has(trip.item)&&integer(trip.amount,remote?limits.vesselLoad:limits.droneLoad)&&trip.amount>0);
    valid(trip.inc===undefined||integer(trip.inc,trip.back&&!trip.collect?0:4*trip.amount));
    valid(typeof trip.collect==='boolean'&&typeof trip.back==='boolean'&&typeof trip.warped==='boolean'&&(!trip.warped||remote&&limits.warpVessels));
    valid(range(trip.leg,3,1e9)&&range(trip.remaining,0,trip.leg));
    (trip.collect?dst:src)[trip.kind]++;
    if(!trip.back||trip.collect)dst.slots.get(trip.item).incoming+=trip.amount;
    if(!trip.back&&trip.collect)src.slots.get(trip.item).held+=trip.amount;
  }
  for(const {tile,slots,drone,vessel} of ports.values()){
    valid(tile.station.awayDrone===drone&&tile.station.awayVessel===vessel);
    for(const {slot,incoming,held} of slots.values())valid(slot.incoming===incoming&&slot.held===held);
  }
}
