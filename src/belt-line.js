import {recoverSorter} from './sorter-motion.js';
import {beltNetwork} from './belt-flow.js';
import {cellKey} from './belt-level.js';
import {belts} from './catalog.js';
import {inReach} from './actions.js';
import {add,count,moveAll} from './stock.js';
import {cargoSize,unloadBelt} from './belt-cargo.js';
import {coaterType,upperDirection} from './coater.js';
import {monitorType} from './traffic.js';
import {cancelWorks} from './construction-orders.js';

const indexes=new WeakMap();
function indexOf(flow){
  let index=indexes.get(flow);
  if(index)return index;
  const count=flow.byKey.size;
  const before=new Int32Array(count).fill(-1),after=new Int32Array(count).fill(-1);
  // T 字接点采用输送模拟的直行优先序。从支路点反转不应把整条主干一并翻转。
  // 喷涂机横向补剂孔属于附属设备，在孔处结束维护区间，避免从上孔误改车间主带。
  for(const from of flow.order){
    const to=flow.exits[from];
    if(from>=count||to>=count||before[to]!==-1)continue;
    before[to]=from;after[from]=to;
  }
  index={before,after,lines:new Array(count)};indexes.set(flow,index);return index;
}
/** 返回所点物理带节所在的一条有序线路。闭环每节只返回一次，索引沿用本次工厂拓扑。 */
export function beltLine(planet,tile){
  const flow=beltNetwork(planet),start=tile&&flow.byKey.get(cellKey(tile));
  if(start===undefined||flow.tiles[start]!==tile)throw new Error('请选择一节完好的传送带');
  const index=indexOf(flow);
  if(index.lines[start])return index.lines[start];
  let head=start,previous=index.before[head];
  while(previous!==-1&&previous!==start){head=previous;previous=index.before[head];}
  const circular=previous===start;
  if(circular)head=start;
  const members=[];
  const result={members,circular};
  let pos=head;
  do{members.push(flow.tiles[pos]);index.lines[pos]=result;pos=index.after[pos];}while(pos!==-1&&pos!==head);
  return result;
}
function requireNear(game,tile){
  if(!tile||!inReach(game,tile))throw new Error('请先靠近要改造的带节');
}
function scopeOf(game,tile,whole){
  requireNear(game,tile);
  const line=beltLine(game.planet,tile);
  return whole?line.members.filter(t=>inReach(game,t)):[tile];
}
/** 原位替换所选型号。先确认实际新件总量，再统一扣件与回收旧件，保留货物、行程、喷点及全部连接。 */
export function replaceBelts(game,tile,type,whole){
  if(!belts.includes(type))throw new Error('请选择传送带型号');
  const selected=scopeOf(game,tile,whole).filter(t=>t.type!==type);
  if(!selected.length)throw new Error('所选带节均已是此型号');
  if(count(game.bag,type)<selected.length)throw new Error('背包替换件不足，需要 '+selected.length+' 节');
  add(game.bag,type,-selected.length);
  for(const part of selected){
    add(game.bag,part.type,1);part.type=type;
    if(part.coater)part.coater.feed.type=type;
  }
  game.planet.revision++;return selected.length;
}
function setSlope(tile,field,value){if(value)tile[field]=value;else delete tile[field];}
/** 反转整段的出向与坡形，保留原带节的货垛。先快照原方向，避免弯道取到已经翻转过的上游方向。 */
export function reverseLine(game,tile){
  requireNear(game,tile);
  const {members,circular}=beltLine(game.planet,tile),last=members.length-1;
  const changes=members.map((part,i)=>{
    const before=i?members[i-1]:circular?members[last]:null;
    const after=i<last?members[i+1]:circular?members[0]:null;
    return {dir:((before||part).dir+2)%4,rise:before?(before.h||0)-(part.h||0):-(part.entryRise||0),entry:after?(part.h||0)-(after.h||0):-(part.rise||0)};
  });
  for(const [i,part] of members.entries()){
    const {dir,rise,entry}=changes[i];
    part.dir=dir;setSlope(part,'rise',rise);setSlope(part,'entryRise',entry);
    if(part.cargo)part.travel=1-part.travel;
    // 喷涂机所在带节反向时，尽量维持既有上层补剂口的地理朝向，让剂桶继续从原支线进站。
    if(part.coater){
      const c=part.coater;
      if(upperDirection(part,!c.reverse)===c.feed.dir)c.reverse=!c.reverse;
      c.feed.dir=upperDirection(part,c.reverse);
    }
  }
  game.planet.revision++;return members.length;
}
/** 在建造半径内连锁拆带。一次回收所有关联分拣器、预建领件及上下货位，对整条线只扫描一次连接表。 */
export function removeBeltLine(game,tile){
  const selected=scopeOf(game,tile,true),ids=new Set(selected.map(cellKey)),p=game.planet;
  cancelWorks(game,ids);
  p.links=p.links.filter(link=>{
    if(!ids.has(link.from)&&!ids.has(link.to))return true;
    recoverSorter(game,link);return false;
  });
  for(const part of selected){
    if(part.coater){const feed=part.coater.feed;unloadBelt(feed,game,'bag',cargoSize(feed),false);add(game.bag,coaterType,1);}
    if(part.monitor)add(game.bag,monitorType,1);
    unloadBelt(part,game,'bag',cargoSize(part),false);
    moveAll(part.input,game,'bag');moveAll(part.output,game,'bag');
    add(game.bag,part.type,1);delete p.tiles[cellKey(part)];
  }
  p.revision++;return selected.length;
}
