import {flow,recordFlow} from './production-log.js';
import {homeSystemOf} from './cluster.js';
import {receiveStock} from './stock.js';
import {largeMiner} from './advanced-miner.js';
import {collector} from './gas.js';
import {stationTypes,slotFor,freeSpace} from './stations.js';
import {capabilitiesOf} from './upgrades.js';
import {AU,bodyOf,positionAt,separation} from './navigation.js';
import {axis,key} from './world.js';
import {add,count} from './stock.js';

export const newFreight=()=>({serial:0,untilDispatch:0,trips:[],delivered:{}});
export const portKey=(body,tile)=>body+'/'+key(tile.x,tile.y);
export function freightPort(game,address){
  const [body,cell]=address.split('/');
  return (body===game.space.current?game.planet:game.space.parked[body])?.tiles[cell];
}
const heldKey=kind=>kind==='drone'?'awayDrone':'awayVessel';
const cache=new WeakMap();
function terminals(game,planet,id){
  const old=cache.get(planet);if(old?.revision===planet.revision)return old.entries;
  const entries=Object.values(planet.tiles).filter(t=>!!t.station&&t.hull!==0).map(t=>({id,t,address:portKey(id,t),normal:axis(t.x,t.y)}));
  cache.set(planet,{revision:planet.revision,entries});return entries;
}
function logisticsRoute(game,from,to,kind){
  if(kind==='vessel')return separation(positionAt(game,bodyOf(game,from.id)),positionAt(game,bodyOf(game,to.id)));
  const [x,y,z]=from.normal,n=to.normal;
  return 200*Math.acos(Math.max(-1,Math.min(1,x*n[0]+y*n[1]+z*n[2])));
}

function planetAt(game,id){return id===game.space.current?game.planet:game.space.parked[id];}
/** 只在货物实际跨出或抵达星球时登记。取货船空载前往供应塔，其起飞时封存的物品仍在供应星球。 */
function recordPassage(game,trip,departing){
  if(trip.kind!=='vessel')return;
  const source=trip.source.split('/',1)[0],destination=trip.destination.split('/',1)[0];
  const planet=planetAt(game,departing?source:destination);
  recordFlow(planet,game.elapsed,trip.item,departing?flow.departure:flow.arrival,trip.amount);
  if(homeSystemOf(source)!==homeSystemOf(destination)){
    recordFlow(planet,game.elapsed,trip.item,departing?flow.starDeparture:flow.starArrival,trip.amount);
  }
}
function launch(game,supply,demand,item,kind,collect,distance){
  const origin=collect?demand:supply,station=origin.t.station;
  const away=heldKey(kind),interplanetary=kind==='vessel';
  // 采集器只有固定气仓，需求塔的船须明确允许到巨星提货。
  if(supply.t.type===collector && (!collect||kind!=='vessel'||station.collectGas===false))return false;
  // 大矿机只接待同一星球需求塔的运输机，不能外派、跨星提矿或从塔端重复记货。
  if(supply.t.type===largeMiner&&(!collect||kind!=='drone'))return false;
  if(station[kind+'s']<=station[away])return false;
  if(!interplanetary&&distance>200*station.range*Math.PI/180+1e-8)return false;
  const dest=slotFor(demand.t,item),source=slotFor(supply.t,item),limits=capabilitiesOf(game);
  const capacity=interplanetary?limits.vesselLoad:limits.droneLoad;
  const threshold=interplanetary?station.minVessel:station.minDrone;
  const available=count(supply.t.output,item),size=Math.min(capacity,available,freeSpace(demand.t,dest));
  // 满仓供应或目的仓容量较小时，允许不足一舱的货物出发，避免两端永远等不到最低装载量。
  if(size<=0||(size<Math.min(dest.limit,Math.ceil(capacity*threshold/100))&&available<source.limit))return false;
  const longJump=interplanetary&&distance>station.warpAU*AU&&limits.warpVessels;
  if(longJump&&station.requireWarp&&station.warpers<2)return false;
  const warped=longJump&&station.warpers>=2;
  const speed=interplanetary?limits.vesselMS:limits.droneMS;
  // 游戏内分别核算起降、常规航段与跃迁；此处采用网页尺度的耗能近似，双程能量在离港时一次扣清。
  // 跃迁只在两个端点附近常规巡航。深空航段按跃迁里程计费，否则即便充满 12 GJ 也无法到远端恒星。
  const approach=warped?Math.min(distance,5000):distance;
  const energy=interplanetary?25+approach*.0007+(warped?120+(distance-approach)*.000085:0):.35+distance*.0015;
  if(station.energy<energy)return false;
  const leg=3+approach/speed+(distance-approach)/(speed*200);
  const trip={id:++game.freight.serial,source:supply.address,destination:demand.address,item,amount:size,kind,collect,warped,leg,remaining:leg,back:false};
  station.energy-=energy;station[away]++;
  if(warped){station.warpers-=2;recordFlow(planetAt(game,origin.id),game.elapsed,'space-warper',flow.used,2);}
  const points=add(supply.t.output,item,-size);if(points)trip.inc=points;dest.incoming+=size;
  // 需求方派船取货时，货单封存的实物仍占供应塔仓位。取货返航后才腾出这段容量。
  if(collect)source.held+=size;else recordPassage(game,trip,true);
  game.freight.trips.push(trip);return true;
}
function deliver(game,t,trip){
  const slot=slotFor(t,trip.item);slot.incoming-=trip.amount;recordPassage(game,trip,false);
  receiveStock(t,'output',trip.item,trip.amount,trip.inc||0);if(trip.inc)trip.inc=0;add(game.freight.delivered,trip.item,trip.amount);
}
function advanceTrips(game,dt){
  const list=game.freight.trips;
  let keep=0;
  for(const trip of list){
    trip.remaining-=dt;
    if(trip.remaining<=0){
      const source=freightPort(game,trip.source),destination=freightPort(game,trip.destination);
      if(!trip.back){
        if(trip.collect){slotFor(source,trip.item).held-=trip.amount;recordPassage(game,trip,true);}
        else deliver(game,destination,trip);
        trip.back=true;trip.remaining+=trip.leg;
      }
      if(trip.remaining<=0){
        if(trip.collect)deliver(game,destination,trip);
        (trip.collect?destination:source).station[heldKey(trip.kind)]--;
        continue;
      }
    }
    list[keep++]=trip;
  }
  list.length=keep;
}
function addTo(map,item,port){if(!map.has(item))map.set(item,[]);map.get(item).push(port);}
/** 同一物料、对应作用域的供需才参与配对。每秒调度一次，每塔每种运力最多派一架，空闲工厂不做逐帧两两搜索。 */
export function tickFreight(game,dt){
  const fleet=game.freight;
  if(fleet.trips.length)advanceTrips(game,dt);
  fleet.untilDispatch-=dt;if(fleet.untilDispatch>0)return;
  fleet.untilDispatch+=1;
  const ports=[...terminals(game,game.planet,game.space.current)];
  for(const [id,planet] of Object.entries(game.space.parked))ports.push(...terminals(game,planet,id));
  if(ports.length<2)return;
  // 固定地址排序使交换活动行星或读档不改变同一组供需的竞争结果。
  ports.sort((a,b)=>a.address.localeCompare(b.address));
  for(const kind of ['drone','vessel']){
    const field=kind==='drone'?'local':'remote',suppliers=new Map(),demanders=[],used=new Set();
    for(const port of ports){
      if(port.t.type===collector){if(kind!=='vessel')continue;}
      else if(kind==='vessel'&&!stationTypes[port.t.type]?.vessels)continue;
      for(const slot of port.t.station.slots){
        if(!slot)continue;
        if(slot[field]==='supply'&&count(port.t.output,slot.item)>0)addTo(suppliers,slot.item,port);
        else if(slot[field]==='demand'&&freeSpace(port.t,slot)>0)demanders.push([port,slot.item]);
      }
    }
    for(const [dest,item] of demanders){
      const candidates=(suppliers.get(item)||[]).filter(src=>kind==='drone'?src.id===dest.id:src.id!==dest.id)
        .map(src=>({src,meters:logisticsRoute(game,src,dest,kind)})).sort((a,b)=>a.meters-b.meters);
      for(const {src,meters} of candidates){
        if(!used.has(src)&&launch(game,src,dest,item,kind,false,meters)){used.add(src);break;}
        if(!used.has(dest)&&launch(game,src,dest,item,kind,true,meters)){used.add(dest);break;}
      }
    }
  }
}
