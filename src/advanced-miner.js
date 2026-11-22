import {belts,stations} from './catalog.js';
import {putCargo,unloadBelt} from './belt-cargo.js';
import {add,count} from './stock.js';
import {capabilitiesOf} from './upgrades.js';
import {delta,dirs,distance,key} from './world.js';

export const largeMiner='advanced-mining-machine';
export const mineCapacity=game=>5000+capabilitiesOf(game).storageBonus;
const terminals=new WeakMap();

/** 网页地表以两度为一格。以机头为锚，后方矩形罩住整个矿簇，转向同时改变矿场位置和带口朝向。 */
export function insideMine(forward,side){
  return forward>=-5 && forward<=.5 && Math.abs(side)<=2.1;
}
function fieldBox(t){
  const [x,y]=dirs[t.dir];
  return {x:t.x-2.25*x,y:t.y-2.25*y,w:x?2.75:2.1,h:y?2.75:2.1};
}
export const isMiningTerminal=type=>type===largeMiner||stations.includes(type);
/** 比较单对占位，已建、蓝图预建与同一份蓝图使用相同规则。网格间距是网页行星尺度。 */
export function mineConflict(a,b){
  if(a.type!==largeMiner&&b.type!==largeMiner)return '';
  if(a.type!==b.type)return distance(a,b)<5?'采矿机与物流塔之间需留出运输机起降空间':'';
  const u=fieldBox(a),v=fieldBox(b),[dx,dy]=delta(u,v);
  return Math.abs(dx)<u.w+v.w && Math.abs(dy)<u.h+v.h?'两台大型采矿机的开采区不能重叠':'';
}
export function mineSiteError(planet,node){
  if(!isMiningTerminal(node.type))return '';
  const works=planet.construction;
  let previous=terminals.get(planet);
  if(!previous||previous.revision!==planet.revision||previous.works!==works||previous.layout!==works?.layout){
    const sites=[...Object.values(planet.tiles),...Object.values(works?.sites||{})].filter(t=>isMiningTerminal(t.type));
    previous={sites,revision:planet.revision,works,layout:works?.layout};terminals.set(planet,previous);
  }
  for(const other of previous.sites){const error=mineConflict(node,other);if(error)return error;}
  return '';
}
/** 设立一个只供本地运输机取货的矿仓。矿种绑定到实际矿脉，旧工地已采空时仍保留仓内原矿。 */
export function installMine(game,planet,tile){
  const item=planet.veins[tile.veins?.[0]]?.item??Object.keys(tile.output)[0];
  const slot=item?{item,limit:mineCapacity(game),local:'supply',remote:'storage',incoming:0,held:0}:null;
  tile.station={slots:[slot],drones:0,vessels:0,awayDrone:0,awayVessel:0,warpers:0};
  tile.miner={speed:100,stack:0,nextPort:0};
}
/** 只复制可配置的三个参数。0 层表示自动随科技升高，货物、预留与轮询位置属于当前工厂。 */
export function mineConfig(source){
  const speed=source?.speed??100, stack=source?.stack??0, mode=source?.mode??'supply';
  if(!Number.isInteger(speed)||speed<100||speed>300||speed%10||!Number.isInteger(stack)||stack<0||stack>4||!['supply','storage'].includes(mode))throw new Error('大型采矿机参数无效');
  return {speed,stack,mode};
}
export function applyMineConfig(game,tile,options){
  const config=mineConfig(options);
  tile.miner.speed=config.speed;tile.miner.stack=Math.min(config.stack,capabilitiesOf(game).portHeight);
  const slot=tile.station.slots[0];if(slot)slot.local=config.mode;
}
export const mineRoom=t=>{const slot=t.station.slots[0];return slot?slot.limit-count(t.output,slot.item)-slot.held:0;};
/** 仓满六成后按剩余空间缩短工作占空比。仍在等无人机来取的实物占仓，不能用同一空间再产一份。 */
export function mineDuty(t){
  const slot=t.station.slots[0];return slot?Math.max(0,Math.min(1,mineRoom(t)/(.4*slot.limit))):0;
}
export const minePeak=t=>2940*(t.miner.speed/100)**2;
export const mineLoad=(t,active)=>active?168+(minePeak(t)-168)*mineDuty(t):168;

// 机头正面三口，罩棚左右各三口。局部带位与可见罩棚同向旋转，中央正面口兼容旧档的单带接法。
const sockets=[[1,-1,0],[1,0,0],[1,1,0],[0,1,1],[-1,1,1],[-2,1,1],[-2,-1,3],[-1,-1,3],[0,-1,3]];
/** 拓扑变更时绑定九条带。每步只访问已经接通的带格，断头带的背压由各自的实物货垛决定。 */
export function minePorts(planet,tile){
  const [fx,fy]=dirs[tile.dir],inputs=[],outputs=[];
  for(const [along,side,localDir] of sockets){
    const belt=planet.tiles[key(tile.x+along*fx-side*fy,tile.y+along*fy+side*fx)];
    if(!belt||!belts.includes(belt.type)||belt.hull===0)continue;
    const out=(localDir+tile.dir)%4;
    if(belt.dir===out)outputs.push(belt);
    else if(belt.dir===(out+2)%4&&!belt.rise)inputs.push(belt);
  }
  return {tile,inputs,outputs};
}
export function receiveMineBelts(ports){
  const t=ports.tile,slot=t.station.slots[0];if(!slot)return;
  for(const b of ports.inputs)if(b.cargo===slot.item&&b.travel>=1)unloadBelt(b,t,'output',mineRoom(t));
}
export function feedMineBelts(game,{tile:t,outputs}){
  const slot=t.station.slots[0];if(!slot||!outputs.length)return;
  const max=capabilitiesOf(game).portHeight,stack=t.miner.stack?Math.min(t.miner.stack,max):max;
  const first=t.miner.nextPort%outputs.length;
  for(let i=0;i<outputs.length;i++){
    const n=(first+i)%outputs.length,belt=outputs[n],qty=Math.min(stack,count(t.output,slot.item));
    if(!qty)break;
    if(belt.cargo)continue;
    putCargo(belt,slot.item,qty,add(t.output,slot.item,-qty));
    // 低产量时从上次成功的下一口继续，九条支线都能分到货；堵塞出口直接跳过。
    t.miner.nextPort=(n+1)%outputs.length;
  }
}
