import {shieldType,upkeepKW,shieldMap,shieldRoom,chargeShield} from './planet-shield.js';
import {emptyCell,exchanger,cellCapacity,flowCell} from './energy.js';

// 光伏读数是本步电网的观测结果，随设备回收释放。存档只保留生成这些读数所需的世界状态。
const panelReadings=new WeakMap();
export const panelReading=tile=>panelReadings.get(tile);

/** 用已经连通的节点划出每个电网。浮点数组随建拆更新，常规帧只覆写负载与额定功率。 */
export function groupPower(assignments){
  const nets=new Map(),detached=[];
  for(const [tile,id] of assignments){
    if(id<0){detached.push(tile);continue;}
    if(!nets.has(id))nets.set(id,{ordinary:[],fixed:[],exchangers:[],shields:[]});
    const net=nets.get(id);
    if(tile.type===emptyCell)net.fixed.push(tile);
    else if(tile.type===exchanger)net.exchangers.push(tile);
    else if(tile.type===shieldType)net.shields.push(tile);
    else net.ordinary.push(tile);
  }
  for(const net of nets.values()){
    net.capacity=new Float64Array(net.ordinary.length);
    net.shieldNeeds=new Float64Array(net.shields.length);
  }
  return {nets:[...nets.values()],detached};
}
function headroom(list,dt,output){
  let sum=0;
  for(const tile of list)sum+=cellCapacity(tile,dt,output);
  return sum;
}
function transfer(game,planet,list,dt,chargeFraction,releaseFraction){
  for(const tile of list){
    const current=releaseFraction*cellCapacity(tile,dt,true)-chargeFraction*cellCapacity(tile,dt,false);
    flowCell(game,tile,current,dt,planet);
  }
}
/** 电网依次分配放电枢纽、常规机组和固定蓄电器。只有常规供电余量可参与充电，避免电池间空转。
 * 输入设备需求与发电能力均为 kW，存储为 MJ。返回当前行星的总需求、可用功率及储能流量。 */
export function solveGrid(game,planet,top,dt,demand,supply){
  const result={demand:0,supply:0,delivered:0,charging:0,discharging:0,stored:0,capacity:0,networks:top.power.nets.length};
  const field=shieldMap(planet);
  if(planet.shield)planet.shield.fieldMJ=Math.min(planet.shield.fieldMJ,field.capacity);
  for(const tile of top.power.detached){
    tile.power=0;
    if(tile.type===emptyCell||tile.type===exchanger){tile.flowKW=0;tile.status='未接入电网';}
    else if(tile.type===shieldType){chargeShield(tile,planet.shield,field.capacity,dt,0,0);result.demand+=upkeepKW;}
    else result.demand+=demand(tile,game,planet,top);
  }
  for(const net of top.power.nets){
    let load=net.shields.length*upkeepKW,regular=0;
    for(let i=0;i<net.ordinary.length;i++){
      const tile=net.ordinary[i];
      load+=demand(tile,game,planet,top);
      net.capacity[i]=supply(tile,game,planet,dt,top);regular+=net.capacity[i];
    }
    const primary=headroom(net.exchangers,dt,true),backup=headroom(net.fixed,dt,true);
    const released=Math.min(load,primary),rest=load-released;
    const backupUsed=Math.min(backup,Math.max(0,rest-regular));
    const delivered=released+Math.min(regular,rest)+backupUsed;
    const fraction=load?delivered/load:Number(regular+primary+backup>0);
    // 工厂与护盾维持先用电。护盾可接收放电枢纽的剩余输出，普通电池只接收剩余发电，防止电池间空转。
    const remainingPlant=Math.max(0,regular-rest),remainingExchange=primary-released;
    let wanted=0,fieldCharge=0;
    for(let i=0;i<net.shields.length;i++){
      net.shieldNeeds[i]=shieldRoom(net.shields[i],planet.shield,field.capacity,dt);
      wanted+=net.shieldNeeds[i];
    }
    const share=Math.min(1,(remainingPlant+remainingExchange)/(wanted||1));
    for(let i=0;i<net.shields.length;i++){
      fieldCharge+=chargeShield(net.shields[i],planet.shield,field.capacity,dt,fraction,share*net.shieldNeeds[i]);
    }
    const extraExchange=Math.min(remainingExchange,fieldCharge),extraPlant=fieldCharge-extraExchange;
    const spare=Math.max(0,remainingPlant-extraPlant);
    const exchangeRoom=headroom(net.exchangers,dt,false),fixedRoom=headroom(net.fixed,dt,false);
    const charging=Math.min(spare,exchangeRoom+fixedRoom);
    const fillFraction=charging/(exchangeRoom+fixedRoom||1);
    transfer(game,planet,net.exchangers,dt,fillFraction,(released+extraExchange)/(primary||1));
    transfer(game,planet,net.fixed,dt,fillFraction,backupUsed/(backup||1));
    // 火电只对实际输出扣燃料。优先放电的枢纽能让同网的燃料机组降载。
    const utilization=regular?(Math.min(regular,rest)+extraPlant+charging)/regular:0;
    for(let i=0;i<net.ordinary.length;i++){
      const tile=net.ordinary[i];tile.power=fraction;
      if(tile.type==='solar-panel'){
        let reading=panelReadings.get(tile);
        if(!reading){reading={};panelReadings.set(tile,reading);}
        reading.available=net.capacity[i];reading.delivered=net.capacity[i]*utilization;
      }
      if(tile.fuelMJ>0&&net.capacity[i])tile.fuelMJ=Math.max(0,tile.fuelMJ-net.capacity[i]*utilization*dt/1000);
    }
    for(const tile of net.fixed){tile.power=fraction;result.stored+=tile.energyMJ;result.capacity+=540;}
    for(const tile of net.exchangers)tile.power=fraction;
    result.demand+=load+fieldCharge;result.supply+=regular+primary+backup;result.delivered+=delivered+fieldCharge;
    result.charging+=charging;result.discharging+=released+extraExchange+backupUsed;
  }
  return result;
}
