import {unloadBelt,cargoSize,putCargo,takeCargo} from './belt-cargo.js';
import {items,stations,belts} from './catalog.js';
import {capabilitiesOf} from './upgrades.js';
import {add,count} from './stock.js';
import {dirs,key} from './world.js';

export const stationTypes={
  [stations[0]]:{slots:4,capacity:5000,energy:180,charge:12,maxMW:60,drones:50,vessels:0},
  [stations[1]]:{slots:5,capacity:10000,energy:12000,charge:60,maxMW:300,drones:100,vessels:10}
};
export const modes=['storage','supply','demand'];
export const carrierItem={drone:'logistics-drone',vessel:'logistics-vessel'};
const allowed=(condition,message)=>{if(!condition)throw new Error(message);};
export const slotFor=(t,item)=>t.station.slots.find(slot=>slot?.item===item);
export const maxSlot=(game,t)=>stationTypes[t.type].capacity+capabilitiesOf(game).storageBonus*(t.type===stations[0]?1:2);

/** 新物流站从空仓、空电池和空机队开始。默认本地与星际模式独立设置，可组合成中转站。 */
export function newStation(type){
  const spec=stationTypes[type];
  return {slots:Array(spec.slots).fill(null),exitItems:[null,null,null,null],energy:0,chargeMW:spec.charge,
    drones:0,vessels:0,awayDrone:0,awayVessel:0,warpers:0,minDrone:10,minVessel:100,range:180,warpAU:12,requireWarp:true};
}
export function setSlotItem(game,t,index,item){
  const s=t.station;
  allowed(Number.isInteger(index)&&index>=0&&index<s.slots.length,'无效的物流仓位');
  const old=s.slots[index];
  if(item===old?.item)return;
  if(old){const address=game.space.current+'/'+key(t.x,t.y);
    allowed(!game.freight.trips.some(f=>f.item===old.item&&(f.source===address||f.destination===address)),'等此仓位的运载器返航后再更换物品');
  }
  allowed(!old||(!count(t.output,old.item)&&!old.incoming&&!old.held),'须先取空现货并等待在途货单完成');
  allowed(!item||(['components','buildings'].includes(items[item]?.category)&&!slotFor(t,item)),'请选择尚未设置的实体物品');
  if(old)s.exitItems=s.exitItems.map(id=>id===old.item?null:id);
  s.slots[index]=item?{item,limit:maxSlot(game,t),local:'storage',remote:'storage',incoming:0,held:0}:null;
}
export function setSlotRule(game,t,index,field,value){
  const slot=t.station.slots[index];allowed(slot,'请先选择该仓位的物品');
  if(field==='limit'){
    allowed(Number.isSafeInteger(value)&&value>=0&&value<=maxSlot(game,t),'容量超过仓位上限');
    allowed(value>=slot.incoming+slot.held+count(t.output,slot.item),'请先取走多余现货，或等待航班完成');
  }else{
    allowed((field==='local'||field==='remote'&&stationTypes[t.type].vessels>0)&&modes.includes(value),'无效的供需模式');
  }
  slot[field]=value;
}
export function setPort(t,dir,item){
  allowed(Number.isInteger(dir)&&dir>=0&&dir<4&&(!item||!!slotFor(t,item)),'出口只能分拣已配置的货物');
  t.station.exitItems[dir]=item||null;
}
export function setStationRule(t,field,value){
  const spec=stationTypes[t.type];
  const limits={chargeMW:[spec.vessels?30:1,spec.maxMW],minDrone:[1,100],minVessel:[1,100],range:[20,180],warpAU:[.5,60]};
  if(field==='collectGas'){allowed(spec.vessels&&typeof value==='boolean','请选择星际塔的轨道采集器取货设置');}
  else if(field==='requireWarp'){allowed(typeof value==='boolean','需要选择跃迁策略');}
  else{const bound=limits[field];allowed(bound&&Number.isFinite(value)&&value>=bound[0]&&value<=bound[1],'数值超出物流站的设置范围');}
  t.station[field]=value;
}
/** 飞船始终归属出发站。移出操作只取停靠的运力，防止把在途飞船再派一次。 */
export function exchangeFleet(game,t,kind,amount){
  allowed(Number.isInteger(amount)&&amount!==0,'请选择调配数量');
  const spec=stationTypes[t.type],s=t.station;
  let field,stockId,limit,away=0;
  if(kind==='warper'){allowed(spec.vessels,'行星塔没有翘曲器槽');field='warpers';stockId='space-warper';limit=50;}
  else{allowed(Object.hasOwn(carrierItem,kind),'运载器类型无效');field=kind+'s';stockId=carrierItem[kind];limit=spec[field];away=kind==='drone'?s.awayDrone:s.awayVessel;}
  const n=amount>0?Math.min(amount,count(game.bag,stockId),limit-s[field]):-Math.min(-amount,s[field]-away);
  allowed(n!==0,'没有可调配的库存或停靠位置');add(game.bag,stockId,-n);s[field]+=n;return n;
}
export const freeSpace=(t,slot)=>slot.limit-slot.incoming-slot.held-count(t.output,slot.item);
export const chargeRate=t=>t.station.chargeMW*Math.max(0,1-t.station.energy/stationTypes[t.type].energy);
export function chargeStation(t,dt){
  const station=t.station;
  station.energy=Math.min(stationTypes[t.type].energy,station.energy+chargeRate(t)*t.power*dt);
  t.status=station.awayDrone+station.awayVessel?'运输中':station.energy<1?'等待充电':'待命';
}
/** 物流塔直接接带。指向塔的端口入仓，背向塔的端口必须选择出货过滤，每一格仍遵循皮带自身的速度。 */
export function runPorts(planet,t,outputHeight=1,stage){
  for(let dir=0;dir<4;dir++){
    const [dx,dy]=dirs[dir],belt=planet.tiles[key(t.x+dx,t.y+dy)];
    if(!belt||!belts.includes(belt.type))continue;
    if(stage!=='out'&&belt.dir===(dir+2)%4&&belt.cargo&&belt.travel>=1){
      const slot=slotFor(t,belt.cargo);
      if(slot&&freeSpace(t,slot)>0){unloadBelt(belt,t,'output',freeSpace(t,slot));}
    }else if(stage!=='in'&&belt.dir===dir&&!belt.cargo){
      const item=t.station.exitItems[dir];
      if(item&&count(t.output,item)){
        const qty=Math.min(outputHeight,count(t.output,item));
        putCargo(belt,item,qty,add(t.output,item,-qty));
      }
    }
  }
}
