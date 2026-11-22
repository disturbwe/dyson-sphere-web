import {ANGLE,clamp,distance,elevation,key,wrap} from './world.js';
import {extraRate,gradeOf} from './proliferation.js';
import {add,count} from './stock.js';
import {clearFootprint,forestOf} from './forest.js';

// 工业面略高于可见水面，避免填海后地坪与海面重合。在网页经纬网内按格面积和原始高差换算土方。
export const grade=.10, soilLimit=1_000_000_000, footing=-1;
export const pavingColors=['', '#c4c9c5','#536471','#ac5056','#b77e4d','#adad53','#528359','#449699','#436dba','#7963aa','#a7699a'];
export const pavingNames=['素土','浅灰','岩灰','绯红','赭石','硫黄','草绿','青碧','钴蓝','紫晶','蔷薇'];
const pending=new WeakMap(),deposits=new WeakMap();
export const settled=(p,x,y)=>p.reform?.cells[key(x,y)]!==undefined;
export function cellDeposits(p,x,y){
  let index=deposits.get(p);
  if(!index){index=new Map();p.veins.forEach((v,i)=>{const k=key(v.x,v.y);if(!index.has(k))index.set(k,[]);index.get(k).push(i);});deposits.set(p,index);}
  return index.get(key(x,y))||[];
}
/** 只记发生变化的格。一次铺一百格也只需局部重传地形和矿床。未在显示的行星合并相同格点。 */
export function markGround(planet,x,y){
  let changes=pending.get(planet);if(!changes){changes=new Set();pending.set(planet,changes);}
  changes.add(key(x,y));planet.reform.revision++;
}
export function takeGroundChanges(planet){const cells=pending.get(planet);pending.delete(planet);return cells||new Set();}

/** 地坪内保持平面，边缘用不到半格向未改造山坡过渡。建造和土方仍以本格是否已整平为准。 */
export function groundHeight(p,x,y,base=elevation(x,y,p.seed,p.biome)){
  if(!p.reform?.revision)return base;
  if(settled(p,x,y))return grade;
  const ix=Math.round(x),iy=Math.round(y),dx=x-ix,dy=y-iy;
  const sx=Math.sign(dx),sy=Math.sign(dy),weight=d=>clamp((Math.abs(d)-.12)/.38,0,1);
  const wx=weight(dx),wy=weight(dy);
  const factor=Math.max(wx&&settled(p,ix+sx,iy)?wx:0,wy&&settled(p,ix,iy+sy)?wy:0,wx&&wy&&settled(p,ix+sx,iy+sy)?Math.min(wx,wy):0);
  return base+(grade-base)*factor*factor*(3-2*factor);
}
const soilVolume=(p,x,y)=>Math.round((elevation(x,y,p.seed,p.biome)-grade)*1200*Math.cos(y*ANGLE));
const validBrush=(size,style)=>Number.isInteger(size)&&size>=1&&size<=10&&Number.isInteger(style)&&style>=0&&style<pavingColors.length;

/** 返回笔刷命中的格点、应付地基、净土方和可显示的错误，不预扣库存。中心点沿短经线回绕。 */
export function surveyGround(game,center,size=1,style=1,bury=false){
  const plan={tiles:[],cost:0,soil:0,veins:0,changes:0,error:''},p=game.planet;
  if(!center||!Number.isInteger(center.x)||!Number.isInteger(center.y)||!validBrush(size,style)||typeof bury!=='boolean'){plan.error='笔刷设置无效';return plan;}
  if(game.space.flight||p.biome==='gas'){plan.error='地基需要固态行星表面';return plan;}
  if(!game.techs.includes('environment-modification'))plan.error='需要研究移山填海工程';
  const offset=Math.floor((size-1)/2);
  for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){
    const x=wrap(center.x+dx-offset),y=center.y+dy-offset,k=key(x,y);
    if(Math.abs(y)>44){plan.error||='笔刷超出极区网格';continue;}
    if(distance(game.mecha,{x,y})>12)plan.error||='超出建造范围，请靠近作业区';
    if(p.fog?.base.hp>0&&distance(p.fog.base,{x,y})<2.2)plan.error||='黑雾基地占据了此处';
    const previous=p.reform.cells[k],veins=cellDeposits(p,x,y).filter(i=>Boolean(p.veins[i].buried)!==bury);
    if(previous===undefined||previous===footing)plan.cost++;
    // 工业建筑已平整过的土地只需补地基物件，不能通过拆除重建反复领取同一地块的沙土。
    if(previous===undefined){
      const dirt=soilVolume(p,x,y),multiplier=1+extraRate[gradeOf(game.bag,'foundation')];
      // 每格独立结算挖方和填方，跨海岸的一笔笔刷不能先把两种土方互相抵销再套增益。
      plan.soil+=Math.round(dirt>=0?dirt*multiplier:dirt/multiplier);
    }
    if(previous!==style||veins.length)plan.changes++;
    plan.veins+=veins.length; plan.tiles.push({x,y,k,veins});
    if(p.construction?.sites[k]&&['geothermal-power-station','water-pump'].includes(p.construction.sites[k].type))plan.error||='此处有待建的取水或地热设施';
  }
  if(count(game.bag,'foundation')<plan.cost)plan.error||='地基不足，需要 '+plan.cost+' 个';
  if(game.mecha.soil+plan.soil<0)plan.error||='沙土不足，还需 '+(-plan.soil-game.mecha.soil).toLocaleString();
  return plan;
}
/** 一次笔刷整体验证并支付。变色、露矿或埋矿只改变地面状态，原始矿量和油泉流量一直归原资源点。 */
export function applyGround(game,center,size=1,style=1,bury=false){
  const p=game.planet,plan=surveyGround(game,center,size,style,bury);
  if(plan.error)throw new Error(plan.error);if(!plan.changes)return plan;
  add(game.bag,'foundation',-plan.cost);game.mecha.soil=Math.min(soilLimit,game.mecha.soil+plan.soil);
  for(const {x,y,k,veins} of plan.tiles){
    if(p.reform.cells[k]===style&&!veins.length)continue;
    p.reform.cells[k]=style;clearFootprint(p,{x,y});
    const f=p.fog;
    if(f&&f.base.hp===0&&f.base.x===x&&f.base.y===y){f.sealed=true;delete f.well;}
    // 已弃用钻井再次铺平后热源一起消失，拆建地热站不能恢复已填掉的井。
    if(f?.oldWells)delete f.oldWells[k];
    const tile=p.tiles[k];if(tile?.type==='geothermal-power-station')tile.efficiency=0;
    for(const i of veins){if(bury)p.veins[i].buried=true;else delete p.veins[i].buried;}
    markGround(p,x,y);
  }
  const m=game.mecha;
  if(m.mining!==null&&p.veins[m.mining]?.buried){m.mining=null;m.target=null;m.progress=0;}
  if(m.timber!==null&&forestOf(p).removed.has(m.timber)){m.timber=null;m.target=null;m.progress=0;}
  return plan;
}
/** 普通建筑占用一格并先整平土方。架空皮带和取水、地热及水面风机保留天然地形。 */
export function footingWork(game,type,p){
  const planet=game.planet;
  if(planet.biome==='gas'||settled(planet,p.x,p.y)||type.startsWith('conveyor-belt-')||['water-pump','geothermal-power-station'].includes(type))return null;
  if(type==='wind-turbine'&&elevation(p.x,p.y,planet.seed,planet.biome)<0)return null;
  const volume=soilVolume(planet,p.x,p.y);return volume>0?Math.round(volume*.48):volume;
}
export function gradeFooting(game,tile,soil){
  if(soil===null)return;
  const p=game.planet;
  game.mecha.soil=clamp(game.mecha.soil+soil,0,soilLimit);p.reform.cells[key(tile.x,tile.y)]=footing;markGround(p,tile.x,tile.y);
}

/** 存档稀疏表达只接受规范化的格地址，巨星没有可整平的地壳。 */
export function validReform(p){
  const r=p.reform;
  if(!r||!Number.isSafeInteger(r.revision)||r.revision<0||!r.cells||typeof r.cells!=='object'||Array.isArray(r.cells))return false;
  const entries=Object.entries(r.cells);
  if(entries.length>r.revision||p.biome==='gas'&&entries.length)return false;
  return entries.every(([k,style])=>{const [x,y]=k.split(',').map(Number);return Number.isInteger(x)&&Number.isInteger(y)&&Math.abs(y)<=44&&k===key(x,y)&&Number.isInteger(style)&&style>=footing&&style<pavingColors.length;});
}
