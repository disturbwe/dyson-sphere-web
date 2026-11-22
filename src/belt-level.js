import {belts} from './catalog.js';
import {dirs, key} from './world.js';
import {capabilitiesOf} from './upgrades.js';

// 零层沿用原有地址，使旧档、地面设备的直连接口和分拣器仍精确指向同一实体。
export const levelKey=(x,y,h=0)=>h?key(x,y)+'@'+h:key(x,y);
export const cellKey=p=>levelKey(p.x,p.y,p.h);
export const levelRise=1.36;
export const maxBeltLevel=game=>Math.min(48,12+6*(capabilitiesOf(game).levels['vertical-construction']||0));
export function exitKey(tile){
  const [dx,dy]=dirs[tile.dir];
  return levelKey(tile.x+dx,tile.y+dy,(tile.h||0)+(tile.rise||0));
}
export function validTrackShape(t,limit=48){
  const h=t.h??0,up=t.rise??0,entry=t.entryRise??0;
  if(![h,up,entry].every(Number.isFinite)||!Number.isInteger(h*2)||h<0||h>limit)return false;
  if(Math.abs(up)>.5||Math.abs(entry)>.5||!Number.isInteger(up*2)||!Number.isInteger(entry*2))return false;
  if(h+up<0||h+up>limit||h-entry<0||h-entry>limit)return false;
  return (!h&&!up&&!entry||belts.includes(t.type))&&(!(up||entry)||!t.monitor&&!t.coater);
}
const columns=new WeakMap();
/** 建拆或预建变化后才重建列索引。指针预览与规划同用这份索引，普通地面检索仍是常数时间。 */
export function beltsAbove(planet,x,y){
  const work=planet.construction;
  let index=columns.get(planet);
  if(!index||index.revision!==planet.revision||index.work!==work||index.jobs!==work?.revision){
    const map=new Map();
    for(const rows of [planet.tiles,work?.sites||{}])for(const tile of Object.values(rows)){
      if(!tile.h)continue;
      const k=key(tile.x,tile.y);
      if(!map.has(k))map.set(k,[]);
      map.get(k).push(tile);
    }
    index={map,revision:planet.revision,work,jobs:work?.revision};columns.set(planet,index);
  }
  return index.map.get(key(x,y))||empty;
}
const empty=Object.freeze([]);
// 层高按网页模型的实际占用留出货物净空。仓罐与研究站后续加层也要检查其上已有桥带。
function headroom(t){
  if(belts.includes(t.type))return t.coater?2:1;
  if(t.station||t.type.includes('logistics-station'))return t.type==='interstellar-logistics-station'?7:5;
  if(t.type.includes('lab'))return Math.ceil((t.layers||1)*1.64/levelRise)+1;
  if(t.type.startsWith('storage-'))return Math.ceil((t.layers||1)*1.4/levelRise)+(t.distributor?2:0);
  if(t.type.includes('tower')||t.type.includes('silo')||t.type==='wind-turbine')return 4;
  return 3;
}
/** 比较同一列的两座设施。只看低处设备需要的净高，顶层加装与先铺桥再补建筑适用同一规则。 */
export function overlapsHeight(a,b){
  const low=(a.h||0)<=(b.h||0)?a:b,high=low===a?b:a;
  return (high.h||0)-(low.h||0)<headroom(low);
}
export function clearanceError(planet,node,replaced=null){
  const groundKey=key(node.x,node.y),ground=planet.tiles[groundKey]||planet.construction?.sites[groundKey];
  if(node.h&&ground&&ground!==replaced&&overlapsHeight(node,ground))return '下方设施与桥面净空不足';
  for(const other of beltsAbove(planet,node.x,node.y)){
    if(other!==node&&other!==replaced&&overlapsHeight(node,other))return '此高度有输送带或预建占位';
  }
  return '';
}
/** 对既有二维短弧折线求最低可行高度。首尾固定，转弯格保持水平，两次线性传播使每相邻格最多升降半层。
 * 自动架桥只越过横向带，纵向重叠和端点净空不足由调用方整段拒绝，不产生收费半成品。 */
export function profileRoute(planet,path,from=0,to=0){
  const last=path.length-1,heights=Array(path.length).fill(Math.min(from,to)),steps=[];
  const turn=i=>i>0&&i<last&&path[i-1].dir!==path[i].dir;
  heights[0]=from;heights[last]=to;
  for(let i=0;i<last;i++)steps.push(turn(i)||turn(i+1)?0:.5);
  const spread=()=>{
    for(let i=1;i<=last;i++)heights[i]=Math.max(heights[i],heights[i-1]-steps[i-1]);
    for(let i=last-1;i>=0;i--)heights[i]=Math.max(heights[i],heights[i+1]-steps[i]);
  };
  spread();
  for(let i=1;i<last;i++){
    const n=path[i],k=key(n.x,n.y),ground=planet.tiles[k]||planet.construction?.sites[k];
    const cross=[ground,...beltsAbove(planet,n.x,n.y)].filter(t=>t&&belts.includes(t.type)&&t.dir%2!==n.dir%2).sort((a,b)=>(a.h||0)-(b.h||0));
    for(const t of cross){if(Math.abs(heights[i]-(t.h||0))<1)heights[i]=(t.h||0)+headroom(t);}
  }
  spread();
  if(heights[0]!==from||heights[last]!==to)throw new Error('坡道距离不足，请延长路线或调整端点高度');
  for(let i=0;i<=last;i++){
    const n=path[i];delete n.h;delete n.rise;delete n.entryRise;
    if(heights[i])n.h=heights[i];
    if(i<last&&heights[i+1]!==heights[i])n.rise=heights[i+1]-heights[i];
    if(i&&heights[i]!==heights[i-1])n.entryRise=heights[i]-heights[i-1];
  }
  return path;
}
