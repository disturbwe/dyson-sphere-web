import {flow,recordFlow,recordBatch} from './production-log.js';
import {sorterDemand,runSorter} from './sorter-motion.js';
import {receiveStock} from './stock.js';
import {gradeOf,extraRate,speedRate,loadRate,ingredientGrade,recipeSpeed,finishBatch} from './proliferation.js';
import {runCoater,willSpray} from './coater.js';
import {cargoSize} from './belt-cargo.js';
import {pilerPorts,pilerType,runPiler} from './piler.js';
import {chargeDistributor,botChargeRate} from './depot.js';
import {runDistribution} from './distribution.js';
import {sampleMonitor} from './traffic.js';
import {settled,markGround} from './reform.js';
import {advanceHives} from './space-hive.js';
import {defenseDemand,prepareCombat,settleCombat} from './ground-combat.js';
import {runConstruction} from './construction.js';
import {items,recipes,research,belts,sorters,stores,extractors,machines,poles,generators,launchers} from './catalog.js';
import {advanceSphere} from './sphere.js';
import {launcherReady,runLauncher,shareRays} from './orbital-machines.js';
import {runSplitter,splitter} from './splitter.js';
import {beltPorts,connectLiquid,fractionActive,fractionGrade,runTank,runFraction} from './liquid-ports.js';
import {workTimber} from './forest.js';
import {handResearch,researchGrade} from './research.js';
import {workingLabs,runLab,isLab} from './lab.js';
import {sampleMatrices} from './matrix-meter.js';
import {drawOil} from './oil.js';
import {largeMiner,mineCapacity,mineRoom,mineDuty,mineLoad,minePorts,receiveMineBelts,feedMineBelts} from './advanced-miner.js';
import {collector,runCollector,workGas} from './gas.js';
import {advanceFlight,sphereOf} from './navigation.js';
import {bodyOf,homeSystemOf} from './cluster.js';
import {photovoltaicFactor,skyAt,sunCosine} from './ephemeris.js';
import {capabilitiesOf} from './upgrades.js';
import {key,wrap,clamp,dirs,delta,distance,ANGLE,environments} from './world.js';
import {count,add,total,enough,merge,insert} from './actions.js';

import {connectGrid} from './grid-index.js';
import {signal} from './defense-equipment.js';
import {wireless,prepareCharge,towerLoad,deliverCharge} from './tower-power.js';
import {beaconDemand} from './beacons.js';
import {groupPower,solveGrid} from './grid-power.js';
import {emptyCell,fullCell,exchanger,runExchangePorts} from './energy.js';
import {tickFreight} from './freight.js';
import {chargeRate,chargeStation,runPorts} from './stations.js';
import {beltNetwork,prepareBelts,moveBelts} from './belt-flow.js';

export const STEP=1/30;
const topologyCache=new WeakMap();
const relayRadius={[signal]:14/6,'geothermal-power-station':3,'energy-exchanger':3,'ray-receiver':3,'tesla-tower':5,'wireless-power-tower':7,'satellite-substation':12,'wind-turbine':3,'solar-panel':2,'thermal-power-plant':3,'mini-fusion-power-plant':4,'artificial-star':4};
/** 电塔和发电节点的连通关系只随建拆变化；不同电网须各算各的，远处的风机不能隔空供电。 */
function topology(p){
  let cached=topologyCache.get(p);if(cached?.revision===p.revision)return cached;
  const tiles=Object.values(p.tiles).filter(t=>t.hull!==0),relays=tiles.filter(t=>relayRadius[t.type]);
  const network=connectGrid(relays,relayRadius,{[signal]:60/6});
  const consumers=tiles.filter(t=>t.type!==collector&&t.type!==splitter&&(!belts.includes(t.type)||t.monitor||t.coater)&&(!stores.includes(t.type)||t.distributor));
  const assignments=new Map(consumers.map(t=>[t,network(t)]));
  for(const l of p.links){if(p.tiles[l.from].hull===0||p.tiles[l.to].hull===0){l.power=0;continue;}assignments.set(l,network(p.tiles[l.to]));}
  const tanks=[],exchanges=[],splitters=[],pilers=new Map(),monitors=[],fractionators=new Map();
  for(const tile of tiles){
    if(tile.monitor)monitors.push(tile);
    if(tile.type===pilerType)pilers.set(tile,pilerPorts(p,tile));
    if(tile.type===splitter)splitters.push({tile,ports:beltPorts(p,tile)});
    if(tile.type===exchanger)exchanges.push(connectLiquid(p,tile));
    if(tile.type==='storage-tank')tanks.push(connectLiquid(p,tile));
    if(tile.type==='fractionator')fractionators.set(tile,connectLiquid(p,tile));
  }
  cached={revision:p.revision,needsSky:tiles.some(t=>['solar-panel','ray-receiver','em-rail-ejector'].includes(t.type)),tiles,consumers,chargeTowers:relays.filter(t=>t.type===signal||t.type===wireless),towerRequests:new Map(),coaters:consumers.filter(t=>t.coater),power:groupPower(assignments),depots:consumers.filter(t=>t.distributor),tanks,exchanges,splitters,pilers,monitors,fractionators,receivers:tiles.filter(t=>t.type==='ray-receiver'),collectors:tiles.filter(t=>t.type===collector),stations:consumers.filter(t=>t.station&&t.type!==largeMiner),mines:consumers.filter(t=>t.type===largeMiner).map(t=>minePorts(p,t)),beltFlow:beltNetwork(p,tiles)};topologyCache.set(p,cached);return cached;
}
function active(t,s,planet){
  if(t.type==='water-pump'&&settled(planet,t.x,t.y))return false;
  if(t.type==='oil-extractor'&&planet.veins[t.seep]?.buried)return false;
  if(extractors.includes(t.type))return (t.type===largeMiner?mineRoom(t)>0:total(t.output)<50) && (!t.veins||t.veins.some(i=>!planet.veins[i].buried&&planet.veins[i].amount>0));
  const r=recipes[t.recipe];return !!r&&enough(t.input,r.in)&&total(t.output)<60;
}
function demand(t,s,planet,top){
  if(t.distributor)return 18+1000*botChargeRate(t);
  if(t.beacon)return beaconDemand(t.beacon);
  if(t.type===signal||t.type===wireless)return towerLoad(top,t);
  if(t.defense)return defenseDemand(t);
  if(t.coater)return willSpray(t)?90*cargoSize(t):4.5;
  if(t.monitor)return t.cargo||t.monitor.sum?36:9;
  if(t.type===pilerType)return t.piler.item||top.pilers.get(t).inlet?.cargo?144:9;
  if(t.type==='fractionator')return fractionActive(top.fractionators.get(t))?720*loadRate[fractionGrade(top.fractionators.get(t))]:18;
  if(t.type===largeMiner){
    const slot=t.station.slots[0];if(slot)slot.limit=mineCapacity(s);
    return mineLoad(t,active(t,s,planet));
  }
  if(t.station)return 60+chargeRate(t)*1000;
  const m=items[t.type]?.machine||{};
  if(isLab(t.type)){
    const working=workingLabs(s,t);
    const grade=working&&t.recipe==='research'?researchGrade(s.research,t.input,true):ingredientGrade(t,recipes[t.recipe]?.in);
    return m.usage*working*loadRate[grade]+m.drain*(t.layers-working);
  }
  if(sorters.includes(t.type))return sorterDemand(s,t,planet,capabilitiesOf(s));
  if(poles.includes(t.type)||generators.includes(t.type)||t.type==='ray-receiver')return 0;
  if(launchers.includes(t.type)) return launcherReady(s,t,top.sphere,top.sky)?m.drain:m.usage*loadRate[gradeOf(t.input,t.type==='vertical-launching-silo'?'small-carrier-rocket':'solar-sail')];
  if(t.type==='mining-machine')return active(t,s,planet)?420:24;
  return active(t,s,planet)?Math.max(0,m.usage||0)*loadRate[ingredientGrade(t,recipes[t.recipe]?.in)]:m.drain||0;
}
function supply(t,s,planet,dt,top){
  if(t.type==='geothermal-power-station')return 4800*t.efficiency;
  if(t.type==='ray-receiver')return t.mode==='power'?t.received:0;
  if(t.type==='wind-turbine')return 300*environments[planet.biome].wind;
  if(t.type==='solar-panel')return 360*environments[planet.biome].solar*photovoltaicFactor(sunCosine(t,top.sky));
  const capacity={'thermal-power-plant':2160,'mini-fusion-power-plant':15000,'artificial-star':72000}[t.type]||0;
  if(capacity && !(t.fuelMJ>0)){const fuel=Object.keys(t.input).find(id=>items[id]?.fuel);if(fuel){const grade=add(t.input,fuel,-1);recordFlow(planet,s.elapsed,fuel,flow.used);
    const exotic=t.type==='artificial-star';
    t.fuelRate=exotic?speedRate[grade]:1+extraRate[grade];
    t.fuelMJ=items[fuel].fuel.value*(t.type==='thermal-power-plant'?.8:1)*(exotic?1:t.fuelRate);}}
  return t.fuelMJ>0?Math.min(capacity*(t.fuelRate||1),t.fuelMJ*1000/dt):0;
}
function outputOne(s,planet,t,id){
  add(t.output,id,1);add(s.stats.made,id,1);recordFlow(planet,s.elapsed,id,flow.made);
}
function extract(s,planet,t,dt){
  // 采矿机直接向出矿口的皮带送货；冶炼厂等加工设施仍需单独的分拣器。
  const [dx,dy]=dirs[t.dir], belt=planet.tiles[key(t.x+dx,t.y+dy)],id=Object.keys(t.output)[0];
  if(t.type!==largeMiner&&belt&&belts.includes(belt.type)&&!belt.cargo&&id){
    const integrated=t.type==='oil-extractor';
    const qty=Math.min(count(t.output,id),integrated?capabilitiesOf(s).portHeight:1);
    insert(belt,id,qty);add(t.output,id,-qty);
  }
  const free=t.type===largeMiner?mineRoom(t):50-total(t.output);
  if(!active(t,s,planet)){
    if(free<=0)t.status='输出堆积';
    else if(t.type==='water-pump')t.status='取水口已填平';
    else if(planet.veins[t.seep]?.buried||t.veins?.some(i=>planet.veins[i].buried))t.status='资源点已掩埋';
    else t.status='矿脉耗尽';
    return;
  }
  if(!t.power){t.status='未供电';return;}
  if(t.type==='oil-extractor'){
    // 油泉按流量出油，断电和满仓会在前面的分支返回，停机时油田产能保持原值。
    const seep=planet.veins[t.seep];
    t.progress+=drawOil(seep,dt*t.power,capabilitiesOf(s),s.resource);
    const n=Math.min(Math.floor(t.progress),50-total(t.output));
    if(n>0){add(t.output,'crude-oil',n);add(s.stats.made,'crude-oil',n);add(s.stats.mined,'crude-oil',n);recordFlow(planet,s.elapsed,'crude-oil',flow.made,n);t.progress-=n;}
    t.status='萃取原油';return;
  }
  const veins=t.veins?.filter(i=>!planet.veins[i].buried&&planet.veins[i].amount>0);
  const perVein=t.type===largeMiner?t.miner.speed/100*mineDuty(t):.5;
  const speed=veins?veins.length*perVein:1/1.2;
  const upgrade=capabilitiesOf(s);
  t.progress+=dt*speed*t.power*upgrade.miningRate;t.status='采集中';
  // 同步限制库存与矿耗。供需塔已封存的在途预约量也计入大型矿仓的实际占用。
  let remaining=free;
  while(t.progress>=1&&remaining-->0){
    if(veins){const available=veins.filter(i=>planet.veins[i].amount>0);if(!available.length)break;
      const current=planet.veins[available[(t.cursor||0)%available.length]];// 按累计消耗结算整单位矿石。利用率提升时产量可高于消耗，余数随设备存档保留。
      const debt=s.resource==='infinite'?0:(t.oreDebt||0)+upgrade.orePerItem;
      const charge=Math.floor(debt+1e-10);current.amount-=charge;if(current.amount===0)markGround(planet,current.x,current.y);t.oreDebt=Math.max(0,debt-charge);t.cursor=(t.cursor||0)+1;outputOne(s,planet,t,current.item);add(s.stats.mined,current.item,1);
    }else outputOne(s,planet,t,environments[planet.biome].ocean);t.progress--;
  }
}
function processMachine(s,planet,t,dt){
  if(!t.power){t.status='未供电';return;}
  const r=recipes[t.recipe];if(!r){t.status='等待配方';return;}if(!enough(t.input,r.in)){t.status='等待原料';return;}
  if(total(t.output)>=60){t.status='输出堆积';return;}t.status='生产中';t.progress+=dt*(items[t.type]?.machine?.speed||1)*t.power*recipeSpeed(t,r)/r.time;
  if(t.progress+1e-10>=1){t.progress=Math.max(0,t.progress-1);finishBatch(s,t,r,planet);}
}
function transport(s,planet,top,dt){
  moveBelts(top.beltFlow);
  const cap=capabilitiesOf(s);
  for(const link of planet.links)runSorter(s,planet,link,dt,cap);
}
export function walk(s,dx,dy,dt){
  const m=s.mecha,length=Math.hypot(dx,dy);if(!length||s.space.flight)return;
  // 地表网格与米使用固定比例，机械骨骼与低空飞行的增益相乘，失去供能后只能缓慢移动。
  const speed=m.energy>0?.45*capabilitiesOf(s).walkingMS*(m.flying?2.5:1):.75;
  m.x=wrap(m.x+dx/length*speed*dt/Math.max(.13,Math.cos(m.y*ANGLE)));
  m.y=clamp(m.y+dy/length*speed*dt,-44.5,44.5);m.heading=Math.atan2(dx,dy);m.energy=Math.max(0,m.energy-(m.flying?.52:.07)*dt);
}
function tickMecha(s,dt){
  const m=s.mecha,limits=capabilitiesOf(s);if(m.energy<limits.coreMJ&&m.burn<=0){const fuel=Object.keys(m.fuel).find(k=>items[k]?.fuel);if(fuel){const grade=add(m.fuel,fuel,-1);recordFlow(s.planet,s.elapsed,fuel,flow.used);m.cellFuel=fuel===fullCell;
    const special=m.cellFuel||fuel==='antimatter-fuel-rod'||fuel==='df-strange-annihilation-fuel-rod';
    m.burnRate=special?speedRate[grade]:1+extraRate[grade];
    m.cellInc=m.cellFuel?grade:0;m.burn=items[fuel].fuel.value*(special?1:m.burnRate);}}
  const recharge=Math.min(m.burn,dt*(m.cellFuel?18.8:limits.fuelMW)*(m.burnRate||1),limits.coreMJ-m.energy);
  m.burn-=recharge;m.energy=Math.min(limits.coreMJ,m.energy+recharge+dt*.08);
  // 满电蓄电器放尽才能回收外壳，中途读档仍属于同一次充电。
  if(m.cellFuel&&m.burn<=1e-9){m.burn=0;m.cellFuel=false;receiveStock(s,'bag',emptyCell,1,m.cellInc||0);recordFlow(s.planet,s.elapsed,emptyCell,flow.made);m.cellInc=0;}
  if(m.flying){m.energy=Math.max(0,m.energy-dt*.14);if(!m.energy&&s.planet.biome!=='gas')m.flying=false;}
  if(m.target){const [dx,dy]=delta(m,m.target);if(distance(m,m.target)<.14)m.target=null;else walk(s,dx*Math.cos(m.y*ANGLE),dy,dt);}
  workTimber(s,dt);
  if(m.intake)workGas(s,dt);
  if(m.mining!==null){const v=s.planet.veins[m.mining];if(!v?.amount||v.buried){m.mining=null;m.progress=0;return;}
    if(distance(m,v)>1.9)m.target={x:v.x,y:v.y};else {m.target=null;m.progress+=dt*(m.energy>0?1:.25);m.energy=Math.max(0,m.energy-dt*.16);if(m.progress>=1){m.progress--;if(s.resource!=='infinite')v.amount--;if(!v.amount)markGround(s.planet,v.x,v.y);add(s.bag,v.item,1);add(s.stats.mined,v.item,1);recordFlow(s.planet,s.elapsed,v.item,flow.made);}}}
  const job=s.queue[0];if(job){job.progress+=dt*(m.energy>0?1:.25);m.energy=Math.max(0,m.energy-dt*.08);if(job.progress+1e-9>=job.time){merge(s.bag,job.produced);merge(s.stats.made,job.produced);
      // 递归手搓在整单交付时才消耗预留。逐配方计入中间件的产消，取消的订单没有统计事件。
      if(job.steps){
        for(const step of job.steps){
          const r=recipes[step.id];
          for(const item in r.in)recordFlow(s.planet,s.elapsed,item,flow.used,r.in[item]*step.count);
          for(const item in r.out)recordFlow(s.planet,s.elapsed,item,flow.made,r.out[item]*step.count);
        }
      }else recordBatch(s.planet,s.elapsed,job.reserved,job.produced);
      s.queue.shift();}}
  handResearch(s,dt);
}
/** 按恒星一次分配射线，再分别结算每颗行星的电网。停留地点变化不能暂停远程工厂，也不能复制恒星发电。 */
export function tick(s,dt=STEP){
  s.elapsed+=dt;tickMecha(s,dt);runConstruction(s,dt);advanceFlight(s,dt);
  const addresses=[[s.space.current,s.planet],...Object.entries(s.space.parked)];
  if(addresses.length>1)addresses.sort((a,b)=>a[0].localeCompare(b[0]));
  const groups=new Map(),factories=[];
  for(const [id,planet] of addresses){
    // 先结算本步来袭造成的损毁再取拓扑，射线、供电和设施端口才能看到同一个可用设备集合。
    prepareCombat(s,planet,dt,id);
    const sphere=sphereOf(s,homeSystemOf(id)),top=topology(planet);
    top.sphere=sphere;top.planet=planet;
    if(!groups.has(sphere))groups.set(sphere,[]);
    // 只为用到日照的行星求一次星历，整颗行星的太阳能板与接收器共享结果。
    if(top.needsSky)top.sky=skyAt(s,bodyOf(s,id));
    if(top.receivers.length)groups.get(sphere).push(top);
    factories.push({planet,top,id});
  }
  // 同一星系的行星共享一组射线预算和建设订单。远方恒星单独推进，也单独承担射线损耗。
  for(const [sphere,receivers] of groups){advanceSphere(s,dt,sphere);shareRays(s,receivers,dt,sphere);}
  for(const {planet,top,id} of factories){
    prepareCharge(s,planet,top,dt);
    const grid=solveGrid(s,planet,top,dt,demand,supply);
    if(planet===s.planet)s.grid=grid;
    for(const t of top.consumers){
      if(t.type===signal||t.type===wireless)deliverCharge(s,t,top,dt);
      else if(t.beacon)t.status=t.beacon.scope==='off'?'离线':t.power?'投影中':'未供电';
      else if(t.distributor)chargeDistributor(t,dt);
      else if(t.station&&t.type!==largeMiner)chargeStation(t,dt);
      else if(launchers.includes(t.type))runLauncher(s,t,dt,top.sphere,top.sky,planet);
      else if(extractors.includes(t.type))extract(s,planet,t,dt);
      else if(isLab(t.type))runLab(s,t,dt,planet);
      else if(machines.includes(t.type))processMachine(s,planet,t,dt);
      else if(generators.includes(t.type))t.status=t.power?'并网':'待机';
    }
    // 入库、皮带整体交接、出库依次结算。两端都满载时，本步腾出的末格能立即接住前一格的货。
    prepareBelts(top.beltFlow,dt,s.elapsed);
    for(const belt of top.coaters)runCoater(belt,s,planet);
    for(const ports of top.tanks)runTank(ports,'in');
    for(const ports of top.exchanges)runExchangePorts(ports,'in');
    for(const station of top.stations)runPorts(planet,station,1,'in');
    for(const mine of top.mines)receiveMineBelts(mine);
    transport(s,planet,top,dt);
    for(const mine of top.mines)feedMineBelts(s,mine);
    for(const ports of top.splitters)runSplitter(ports,dt);
    for(const ports of top.pilers.values())runPiler(ports,dt);
    for(const ports of top.tanks)runTank(ports,'out');
    for(const ports of top.exchanges)runExchangePorts(ports,'out');
    for(const ports of top.fractionators.values())runFraction(s,ports,dt,planet);
    for(const t of top.collectors)runCollector(s,planet,t,dt);
    for(const t of top.stations)runPorts(planet,t,capabilitiesOf(s).portHeight,'out');
    // 所有出带方式都已经结算，最后封存本步读数。全星区告警复用拓扑中的测点清单。
    let alertCount=0,firstAlert=null,speakerTile=null;
    for(const belt of top.monitors){
      sampleMonitor(belt,dt);
      if(belt.monitor.alert){alertCount++;firstAlert??=key(belt.x,belt.y);if(belt.monitor.speaker)speakerTile??=key(belt.x,belt.y);}
    }
    if(alertCount||planet.flowAlert)planet.flowAlert=alertCount?{count:alertCount,first:firstAlert,speaker:speakerTile}:null;
    runDistribution(s,planet,top.depots,dt);
    settleCombat(s,planet,grid,dt,id);
  }
  advanceHives(s,addresses,dt);
  tickFreight(s,dt);
  sampleMatrices(s);
}
