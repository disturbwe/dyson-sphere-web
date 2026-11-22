import {flow,recordFlow} from './production-log.js';
import {cargoSize,cargoPoints,takeCargo} from './belt-cargo.js';
import {belts,physical} from './catalog.js';
import {count,add,sharePoints} from './stock.js';
import {extraRate} from './proliferation.js';

export const coaterType='spray-coater';
export const sprays={'proliferator-1':{points:1,uses:12},'proliferator-2':{points:2,uses:24},'proliferator-3':{points:4,uses:60}};
const realCargo=new Set(physical.map(item=>item.id));
export const validInc=(points,size)=>points===undefined||Number.isSafeInteger(points)&&points>=0&&points<=size*4;
/** 校验两条同坐标货道的关系，尤其不允许导入时在上层虚构另一个方向、速度或无限喷剂。 */
export function validateCoater(tile){
  const c=tile.coater,feed=c?.feed;
  const ok=c&&belts.includes(tile.type)&&!tile.monitor&&typeof c.reverse==='boolean'&&Number.isSafeInteger(c.doses)&&c.doses>=0&&c.doses<=600&&
    (c.doses?Object.hasOwn(sprays,c.fluid):c.fluid===null)&&Number.isSafeInteger(c.applied)&&c.applied>=0&&Number.isFinite(c.duty)&&c.duty>=0&&c.duty<1.000001&&
    feed?.type===tile.type&&(feed.h||0)===(tile.h||0)&&!feed.rise&&!feed.entryRise&&feed.x===tile.x&&feed.y===tile.y&&feed.dir===upperDirection(tile,c.reverse)&&Number.isFinite(feed.travel)&&feed.travel>=0&&feed.travel<=1&&
    (feed.cargo===null||realCargo.has(feed.cargo))&&(!Object.hasOwn(feed,'stack')||Number.isInteger(feed.stack)&&(feed.cargo?feed.stack>=1&&feed.stack<=4:feed.stack===0))&&validInc(feed.inc,cargoSize(feed));
  if(!ok)throw new Error('喷涂机剂量或上层货道无效');
}
export const upperDirection=(tile,reverse)=>(tile.dir+(reverse?3:1))%4;
/** 下层保留原带。上层有独立货位及行程，支持相邻喷涂机的侧孔串联。 */
export function newCoater(tile,reverse=false){
  const {type,x,y}=tile;
  return {reverse,fluid:null,doses:0,applied:0,duty:0,feed:{type,x,y,...(tile.h?{h:tile.h}:{}),dir:upperDirection(tile,reverse),cargo:null,travel:0}};
}
function refill(coater,id,grade){
  const liquid=sprays[id];
  if(!liquid||coater.doses&&coater.fluid!==id)return false;
  const uses=Math.floor(liquid.uses*(1+extraRate[grade]));
  if(coater.doses+uses>600)return false;
  coater.fluid=id;coater.doses+=uses;return true;
}
/** 手动加入瓶装喷剂。容量和自喷涂次数与上层输送完全相同，无法整瓶加入时留在背包。 */
export function fillCoater(game,tile,id,limit=10){
  if(!tile.coater||!Object.hasOwn(sprays,id))throw new Error('请选择喷剂和喷涂机');
  let moved=0;
  while(moved<limit&&count(game.bag,id)){
    const grade=sharePoints(game.bagPoints?.[id]||0,count(game.bag,id),1);
    if(!refill(tile.coater,id,grade))break;
    add(game.bag,id,-1);moved++;
  }
  if(!moved)throw new Error('背包缺少喷剂，或罐内类型及余量无法接收整瓶');
  recordFlow(game.planet,game.elapsed,id,flow.used,moved);return moved;
}
export function willSpray(tile){
  const {coater}=tile, n=cargoSize(tile);
  return n>0&&coater.doses>=n&&(tile.inc||0)<sprays[coater.fluid].points*n;
}
/** 入库再喷涂，然后两层皮带同步前移。断电时两条带照常通过，欠电的喷头按供电比例间歇工作。 */
export function runCoater(tile,game,planet=game?.planet){
  const c=tile.coater, feed=c.feed;
  if(feed.travel>=1&&feed.cargo&&Object.hasOwn(sprays,feed.cargo)){
    const item=feed.cargo;let bottles=0;
    while(feed.cargo&&refill(c,item,cargoPoints(feed,1))){takeCargo(feed,1);bottles++;}
    if(game&&bottles)recordFlow(planet,game.elapsed,item,flow.used,bottles);
  }
  if(!willSpray(tile)){tile.status=c.doses?'等待待喷货物':'等待增产剂';return;}
  if(!tile.power){tile.status='断电直通';return;}
  c.duty+=tile.power;
  if(c.duty<1-1e-8){tile.status='供电不足';return;}
  c.duty=Math.max(0,c.duty-1);
  const n=cargoSize(tile);
  tile.inc=sprays[c.fluid].points*n;c.doses-=n;c.applied+=n;
  if(!c.doses)c.fluid=null;
  tile.status='喷涂中';
}
