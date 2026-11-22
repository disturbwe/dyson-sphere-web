import {sorters,belts,name} from './catalog.js';
import {key,wrap,delta,ANGLE} from './world.js';
import {capabilitiesOf} from './upgrades.js';
import {facilityConfig,integer,insist,allowedItem} from './blueprint-config.js';

import {cellKey,beltsAbove,overlapsHeight} from './belt-level.js';
const format='DSP-WEB-FACTORY/1';
import {accountParts,partCount} from './construction-orders.js';
const directPorts=new Set(['splitter','automatic-piler','fractionator','storage-tank','energy-exchanger','orbital-collector']);
export const blueprintSize=pattern=>pattern.tiles.reduce((n,t)=>n+partCount(t),pattern.links.length);
export function blueprintBill(pattern){
  const bill={};
  for(const t of [...pattern.tiles,...pattern.links])accountParts(bill,t,1);
  return bill;
}
export function checkLimit(game,pattern){
  const limit=capabilitiesOf(game).blueprintLimit;
  insist(limit,'需要研究批量建造 I');
  insist(blueprintSize(pattern)<=limit,'超出本级蓝图设施上限 '+limit);
}
export function validLink(type,a,b,filter){
  insist(sorters.includes(type)&&a&&b&&!directPorts.has(a.type)&&!directPorts.has(b.type),'蓝图分拣器端口有误');
  insist((a.h||0)===(b.h||0),'蓝图分拣器两端高度不一致');
  const [dx,dy]=delta(a,b),span=Math.abs(dx)+Math.abs(dy);
  insist((!dx||!dy)&&integer(span,1,3),'蓝图分拣器需要直线连接一至三格');
  insist(filter===null||allowedItem(filter),'分拣过滤物品有误');
  return span;
}
/** 校验网页蓝图文件并只保留可施工字段。坐标数受真实地表网格约束，坏文件在进入本地图纸库之前报错。 */
export function readBlueprint(raw){
  insist(typeof raw==='string'&&raw.length<=4000000,'蓝图文件过大或格式有误');
  const p=JSON.parse(raw);
  insist(p?.format===format&&typeof p.title==='string'&&p.title.trim()&&p.title.length<=80&&typeof p.description==='string'&&p.description.length<=600,'请选择本网页版的工厂蓝图');
  insist(integer(p.width,1,180)&&integer(p.height,1,87)&&integer(p.latitude,-43,44-p.height),'蓝图尺寸或纬度有误');
  insist(Array.isArray(p.tiles)&&p.tiles.length&&p.tiles.length<=p.width*p.height*49&&Array.isArray(p.links)&&p.links.length<=p.tiles.length*12,'蓝图设施记录有误');
  const occupied=new Map(),edges=new Set();
  const tiles=p.tiles.map(t=>{
    insist(integer(t?.x,0,p.width-1)&&integer(t.y,0,p.height-1),'蓝图坐标越界');
    const node={...facilityConfig(t),x:t.x,y:t.y},k=key(t.x,t.y);
    const column=occupied.get(k)||[];
    insist(!column.some(other=>overlapsHeight(node,other)),'蓝图格点重复或高度冲突');
    column.push(node);occupied.set(k,column);return node;
  });
  const links=p.links.map(arm=>{
    const {type,from,to,filter=null}=arm||{};
    insist(integer(from,0,tiles.length-1)&&integer(to,0,tiles.length-1)&&!edges.has(from+'>'+to),'蓝图连接索引有误');
    validLink(type,tiles[from],tiles[to],filter);edges.add(from+'>'+to);
    return {type,from,to,filter};
  });
  return {format,title:p.title.trim(),description:p.description,width:p.width,height:p.height,latitude:p.latitude,tiles,links};
}
/** 取两个角之间的短经弧。跨越日期线的工厂仍是相邻设备，只有两个端点均被选中的分拣器才会进入图纸。 */
export function captureBlueprint(game,a,b,excluded=new Set()){
  insist(!game.space.flight,'航行中无法框选地面工厂');
  const [dx]=delta(a,b),west=wrap(a.x+Math.min(0,dx)),south=Math.max(-43,Math.min(a.y,b.y));
  const north=Math.min(43,Math.max(a.y,b.y)),w=Math.abs(dx)+1;
  const tiles=[],index=new Map(),planet=game.planet,c=planet.construction;
  for(let y=south;y<=north;y++)for(let x=0;x<w;x++){
    const k=key(west+x,y);
    for(const t of [planet.tiles[k]||c?.sites[k],...beltsAbove(planet,west+x,y)]){
      if(!t||excluded.has(cellKey(t)))continue;
      index.set(cellKey(t),tiles.length);tiles.push({...facilityConfig(t),x,y:y-south});
    }
  }
  insist(tiles.length,'选区内没有设施');
  // 移除选框空边，使预览的锚点随设施轮廓移动，框选留白不会给以后粘贴添加无意偏移。
  let minX=w,minY=87,maxX=0,maxY=0;
  for(const t of tiles){minX=Math.min(t.x,minX);minY=Math.min(t.y,minY);maxX=Math.max(t.x,maxX);maxY=Math.max(t.y,maxY);}
  for(const t of tiles){t.x-=minX;t.y-=minY;}
  const links=[];
  for(const l of [...planet.links,...Object.values(c?.arms||{})]){
    if(index.has(l.from)&&index.has(l.to))links.push({type:l.type,from:index.get(l.from),to:index.get(l.to),filter:l.filter||null});
  }
  const main=tiles.find(t=>t.recipe)||tiles.find(t=>!belts.includes(t.type))||tiles[0];
  const pattern={format,title:name(main.type)+'产线',description:'',width:maxX-minX+1,height:maxY-minY+1,latitude:south+minY,tiles,links};
  checkLimit(game,pattern);return pattern;
}
export function rotated(x,y,turn){
  switch(turn){case 1:return [-y,x];case 2:return [-x,-y];case 3:return [y,-x];default:return [x,y];}
}
const facing=(dir,turn,mirror)=>((mirror?(2-dir+4)%4:dir)+turn)%4;
/** 锚点位于图纸中心附近的整数格。镜像和旋转一起变换朝向和塔的四个出口，避免输送带调头后仍沿旧端口出货。 */
export function stampLayout(pattern,anchor,turn=0,mirror=false){
  const midX=Math.floor((pattern.width-1)/2),midY=Math.floor((pattern.height-1)/2);
  return pattern.tiles.map(t=>{
    const [u,v]=rotated((t.x-midX)*(mirror?-1:1),t.y-midY,turn);
    const node={...t,x:wrap(anchor.x+u),y:anchor.y+v,dir:facing(t.dir,turn,mirror)};
    // 镜像会对调横向的补剂入口；相对主带只旋转时保持原手性。
    if(t.coater&&mirror)node.coater={reverse:!t.coater.reverse};
    if(t.split){
      // 优先口绑定地理方向，同一图纸翻转后筛选物品应跟着对应的出带走。
      const rotatePort=side=>side===null?null:facing(side,turn,mirror);
      node.split={...t.split,inFirst:rotatePort(t.split.inFirst),outFirst:rotatePort(t.split.outFirst)};
    }
    if(t.station){
      const ports=[null,null,null,null];t.station.exitItems.forEach((id,i)=>ports[facing(i,turn,mirror)]=id);
      node.station={...t.station,exitItems:ports};
    }
    return node;
  });
}
// 网页行星采用等角格，以东西弧长限制过度扭曲的整排设备；单列、单格的图纸可在更广纬区复用。
export function fitsLatitude(pattern,nodes,turn){
  if(pattern.width===1&&pattern.height===1)return true;
  const sourceMid=pattern.latitude+(pattern.height-1)/2;
  const mean=nodes.reduce((v,t)=>v+t.y,0)/nodes.length;
  const ratio=Math.cos(mean*ANGLE)/Math.cos(sourceMid*ANGLE);
  const span=turn%2?pattern.height:pattern.width;
  return span<3||(ratio>=.76&&ratio<=1.32);
}
