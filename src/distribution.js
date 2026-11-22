import {receiveStock,sharePoints} from './stock.js';
import {add,count} from './stock.js';
import {ANGLE,clamp,key} from './world.js';
import {capabilitiesOf} from './upgrades.js';
import {botType,deliveryItem,depotRoom,deliverDepot,clearOverflow} from './depot.js';

export const icarusPort='icarus';
export const addressOf=t=>key(t.x,t.y);
const emptyPlan=()=>({enabled:true,rules:{}});
const newService=()=>({serial:0,cursor:0,clock:0,trips:[],toPlayer:0,fromPlayer:0,between:0});
export const ordersOf=planet=>planet.distribution?.trips||[];
export const personalPlan=game=>game.mecha.logistics||emptyPlan();
const integerLimit=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e8;
export function validLimits(low,high){return integerLimit(low)&&(high===null||integerLimit(high)&&high>=low);}
/** 收货下限和回收上限之间是保留区。未设上限记 null，避免 JSON 将 Infinity 隐式改写。 */
export function setPersonalRule(game,item,low,high){
  if(!game.techs.includes('distribution-logistics-system'))throw new Error('需要研究配送物流系统');
  if(!deliveryItem(item)||!validLimits(low,high))throw new Error('补货量与保留量须为整数，保留量至少等于补货量');
  const plan=game.mecha.logistics??=emptyPlan();
  plan.rules[item]={low,high};
}
export function togglePersonal(game){const plan=game.mecha.logistics??=emptyPlan();plan.enabled=!plan.enabled;}
export function botsAway(planet,tile){
  const home=addressOf(tile);
  return ordersOf(planet).reduce((n,t)=>n+Number(t.home===home),0);
}
/** 调入、调回都使用背包中的实物。出勤中的机体属于母港，在它落地前不能回收该机。 */
export function transferBot(game,tile,remove){
  const dock=tile?.distributor;
  if(!dock)throw new Error('请选择物流配送器');
  if(remove){
    if(dock.bots<=botsAway(game.planet,tile))throw new Error('没有停靠的配送运输机');
    dock.bots--;add(game.bag,botType,1);
  }else{
    if(dock.bots>=10||!count(game.bag,botType))throw new Error('机库已满或背包缺少配送运输机');
    add(game.bag,botType,-1);dock.bots++;
  }
}
// 两度对应一格，原作普通行星半径取 200 米。用半正矢求短弧，跨经线或靠近极点仍连续。
export function routeMetres(a,b){
  const halfLat=(a.y-b.y)*ANGLE/2,halfLon=(a.x-b.x)*ANGLE/2;
  const h=Math.sin(halfLat)**2+Math.cos(a.y*ANGLE)*Math.cos(b.y*ANGLE)*Math.sin(halfLon)**2;
  return 400*Math.asin(Math.sqrt(clamp(h,0,1)));
}
function mechaOnPlanet(game,planet){return planet===game.planet&&!game.space.flight;}
function planFor(game,item){return game.mecha.logistics?.enabled&&game.mecha.logistics.rules[item];}
function playerNeeds(game,item){const r=planFor(game,item);return r?Math.max(0,r.low-count(game.bag,item)):0;}
function playerSurplus(game,item){const r=planFor(game,item);return r&&r.high!==null?Math.max(0,count(game.bag,item)-r.high):0;}
function accepting(tile,item){
  const temporary=tile.distributor.overflow;
  if(temporary[item]||Object.keys(temporary).length>=2)return 0;
  return depotRoom(tile,item);
}
// 去程空机锁定待取货数，已装机的实物只计在机腹。按航单重建预约，手动取货或切换前后台都没有第二份账本。
function booking(service){
  const held=new Map(),incoming=new Map(),away=new Map();
  const reserve=(map,port,item,n)=>{const k=port+'/'+item;map.set(k,(map.get(k)||0)+n);};
  function record(trip){
    away.set(trip.home,(away.get(trip.home)||0)+1);
    if(trip.pick&&!trip.back)reserve(held,trip.peer,trip.item,trip.amount);
    if(trip.pick||!trip.back)reserve(incoming,trip.pick?trip.home:trip.peer,trip.item,trip.back?trip.load:trip.amount);
  }
  for(const trip of service.trips)record(trip);
  return {away,record,available:(port,item,n)=>Math.max(0,n-(held.get(port+'/'+item)||0)),room:(port,item,n)=>Math.max(0,n-(incoming.get(port+'/'+item)||0))};
}
function setLeg(trip,start,end,speed){
  trip.ax=start.x;trip.ay=start.y;trip.bx=end.x;trip.by=end.y;
  trip.leg=.65+routeMetres(start,end)/speed;trip.remaining=trip.leg;
}
function launch(game,planet,service,book,tile,peer,peerId,item,pick){
  const home=addressOf(tile),dock=tile.distributor,limit=capabilitiesOf(game);
  const personal=peerId===icarusPort,source=pick?peerId:home,dest=pick?home:peerId;
  const stock=pick?(personal?playerSurplus(game,item):count(peer.output,item)):count(tile.output,item);
  const room=pick?accepting(tile,item):(personal?playerNeeds(game,item):accepting(peer,item));
  const amount=Math.min(limit.botLoad,book.available(source,item,stock),book.room(dest,item,room));
  if(amount<=0)return false;
  const metres=routeMetres(tile,peer),energy=.1+.02*metres;
  if(metres>200*limit.botRange*Math.PI/180+1e-8||dock.energy+1e-9<energy)return false;
  const trip={id:++service.serial,home,peer:peerId,item,pick,back:false,amount,load:pick?0:amount};
  setLeg(trip,tile,peer,limit.botMS);
  if(!pick){const points=add(tile.output,item,-amount);if(points)trip.inc=points;}
  dock.energy=Math.max(0,dock.energy-energy);service.trips.push(trip);book.record(trip);
  return true;
}
function requestPersonal(game,planet,service,book,tile){
  const dock=tile.distributor,policy=game.mecha.logistics;
  if(dock.player==='off'||!policy?.enabled||!mechaOnPlanet(game,planet))return false;
  const attempt=(item,pick)=>launch(game,planet,service,book,tile,game.mecha,icarusPort,item,pick);
  if(dock.all){
    for(const item of Object.keys(policy.rules))if(playerSurplus(game,item)&&attempt(item,true))return true;
    return false;
  }
  if(!dock.item||!policy.rules[dock.item])return false;
  if(dock.player!=='demand'&&playerNeeds(game,dock.item)&&attempt(dock.item,false))return true;
  return dock.player!=='supply'&&playerSurplus(game,dock.item)&&attempt(dock.item,true);
}
function dispatch(game,planet,service,ports){
  if(!ports.length)return;
  const book=booking(service),groups=new Map();
  for(const t of ports){
    clearOverflow(t);
    const {peers,item}=t.distributor;
    if(peers==='off'||!item)continue;
    const k=peers+'/'+item;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);
  }
  // 大工厂分批轮转母港和同货物的候选仓。未装机的一端仍可收发，避免逐帧比较所有仓库的平方次配对。
  const budget=Math.min(64,ports.length),start=service.cursor;
  for(let i=0;i<budget;i++){
    const tile=ports[(start+i)%ports.length],d=tile.distributor;
    if(d.bots<=(book.away.get(addressOf(tile))||0)||d.energy<.1)continue;
    if(requestPersonal(game,planet,service,book,tile))continue;
    if(d.peers==='off'||!d.item)continue;
    const pick=d.peers==='demand',others=groups.get((pick?'supply':'demand')+'/'+d.item)||[];
    // 母港自行记住上次检查到的仓。全局轮转步幅若与候选数有公因数，会让远处可达仓永远轮不到。
    for(let j=0;j<Math.min(16,others.length);j++){
      const index=(d.nextPeer||0)%others.length;
      const peer=others[index];
      d.nextPeer=(index+1)%others.length;
      if(launch(game,planet,service,book,tile,peer,addressOf(peer),d.item,pick))break;
    }
  }
  service.cursor=(start+budget+(ports.length<=64?1:0))%2147483647;
}
function handoff(game,planet,service,trip,owner){
  const item=trip.item,personal=trip.peer===icarusPort;
  if(personal){
    if(!mechaOnPlanet(game,planet)||!game.mecha.logistics?.enabled)return;
    const dock=owner.distributor;
    if(trip.pick){
      if(dock.player==='off'||dock.player==='supply'||!dock.all&&dock.item!==item)return;
      trip.load=Math.min(trip.amount,playerSurplus(game,item));trip.inc=add(game.bag,item,-trip.load);
    }else{
      if(dock.player==='off'||dock.player==='demand'||dock.item!==item)return;
      const qty=Math.min(trip.load,playerNeeds(game,item));const points=sharePoints(trip.inc||0,trip.load,qty);
      receiveStock(game,'bag',item,qty,points);if(points)trip.inc-=points;trip.load-=qty;service.toPlayer+=qty;
    }
  }else{
    const peer=planet.tiles[trip.peer];
    if(peer.hull===0)return;
    if(trip.pick){trip.load=Math.min(trip.amount,count(peer.output,item));trip.inc=add(peer.output,item,-trip.load);}
    else {deliverDepot(peer,item,trip.load,trip.inc||0);service.between+=trip.load;trip.load=0;if(trip.inc)trip.inc=0;}
  }
}
function reach(game,planet,service,trip){
  const owner=planet.tiles[trip.home];
  if(trip.back){
    if(trip.load){deliverDepot(owner,trip.item,trip.load,trip.inc||0);if(trip.pick){if(trip.peer===icarusPort)service.fromPlayer+=trip.load;else service.between+=trip.load;}}
    return true;
  }
  const arrived={x:trip.bx,y:trip.by},limits=capabilitiesOf(game);
  const personal=trip.peer===icarusPort;
  const reachable=!personal||game.mecha.logistics?.enabled&&mechaOnPlanet(game,planet)&&routeMetres(owner,game.mecha)<=200*limits.botRange*Math.PI/180+1e-8;
  if(reachable&&personal&&routeMetres(arrived,game.mecha)>2){
    // 伊卡洛斯仍在本星但已走开，配送机续飞到他当前的位置。只有真正追到或返仓时才交付货物。
    setLeg(trip,arrived,game.mecha,limits.botMS);return false;
  }
  if(reachable&&owner.hull!==0)handoff(game,planet,service,trip,owner);
  trip.back=true;setLeg(trip,arrived,owner,limits.botMS);return false;
}
/** 所有已访问行星都结算在途机和仓间配送。只有机甲所在且未离地的星球参与背包供需，时钟和机腹一并存档。 */
export function runDistribution(game,planet,ports,dt){
  if(!ports.length&&!planet.distribution?.trips.length)return;
  const service=planet.distribution??=newService();
  let write=0;
  for(const trip of service.trips){
    trip.remaining-=dt;
    if(trip.remaining<=1e-8&&reach(game,planet,service,trip))continue;
    service.trips[write++]=trip;
  }
  service.trips.length=write;service.clock-=dt;
  if(service.clock<=1e-8){service.clock+=.4;dispatch(game,planet,service,ports);}
}
