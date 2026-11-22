import * as T from 'three';
import {levelRise} from './belt-level.js';
import {groundRadius} from './reform-terrain.js';
import {axis} from './world.js';
import {belts,tint} from './catalog.js';

const stretch=new T.Vector3(),offset=new T.Matrix4(),worldMatrix=new T.Matrix4();
const parcel=new T.BoxGeometry(.19,.12,.20),parcelMaterial=new T.MeshStandardMaterial({roughness:.63,metalness:.22});
const tones=new Map();
function port(planet,tile){
  const radius=groundRadius(planet,tile.x,tile.y)+(tile.h||0)*levelRise+(belts.includes(tile.type)?.44:.48);
  return new T.Vector3(...axis(tile.x,tile.y)).multiplyScalar(radius);
}
/** 以两端真实高度确定沿球面切向的取卸货轴，返回机座姿态和滑动距离。高架与地基整平沿用相同的端点计算。 */
export function sorterFrame(planet,arm){
  const src=planet.tiles[arm.from],dst=planet.tiles[arm.to];
  const start=port(planet,src),end=port(planet,dst),across=end.clone().sub(start),distance=across.length();
  across.normalize();const side=across.clone().cross(start).normalize(),up=side.clone().cross(across);
  const inset=t=>Math.min(distance*.28,belts.includes(t.type)?.17:.61);
  const lead=inset(src),length=distance-lead-inset(dst);
  start.addScaledVector(across,lead);
  return {base:new T.Matrix4().makeBasis(across,up,side).setPosition(start),length};
}
/** 分区重建时一次烘焙固定机座。相同型号与部件共用一个实例缓冲，分拣器数量不再逐臂增加绘制调用。 */
export function makeSorterView(group,planet,links,blueprintModel){
  if(!links.length)return null;
  const kinds=new Map(),drives=[];
  for(const arm of links){
    if(!kinds.has(arm.type))kinds.set(arm.type,[]);
    kinds.get(arm.type).push({arm,...sorterFrame(planet,arm),phase:NaN});
  }
  const cargo=new T.InstancedMesh(parcel,parcelMaterial,links.length);
  cargo.count=0;cargo.frustumCulled=false;cargo.instanceMatrix.setUsage(T.DynamicDrawUsage);group.add(cargo);
  for(const [type,entries] of kinds){
    const pieces={entries};
    for(const kind of ['drive','slide','grip']){
      const [part]=blueprintModel('arm/'+kind+'/'+type).parts;
      const batch=new T.InstancedMesh(part.geometry,part.material,entries.length);
      batch.frustumCulled=false;batch.receiveShadow=true;
      if(kind==='drive')entries.forEach((entry,i)=>batch.setMatrixAt(i,entry.base));
      else batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
      group.add(batch);pieces[kind]=batch;
    }
    drives.push(pieces);
  }
  return {cargo,drives};
}
/** 爪位和小件来自同一逻辑步的真实手中货物。阻塞或暂停时不重复上传静止机构的姿态。 */
export function drawSorters(view){
  if(!view)return;
  let loaded=0;
  for(const {entries,slide,grip} of view.drives){
    let changed=false;
    for(let i=0;i<entries.length;i++){
      const entry=entries[i],{base,length,arm}=entry;
      const t=arm.hand?arm.progress:1-arm.progress;
      const x=.11+Math.max(0,length-.11)*t;
      if(t!==entry.phase){
        // 导轨随行程伸缩，钳体单独平移，跨三格时钳口与机座依然保持原宽。
        slide.setMatrixAt(i,worldMatrix.copy(base).scale(stretch.set(x,1,1)));
        grip.setMatrixAt(i,worldMatrix.multiplyMatrices(base,offset.makeTranslation(x,0,0)));
        entry.phase=t;changed=true;
      }
      if(arm.hand){
        const {item,size}=arm.hand;
        offset.makeTranslation(x,-.15,0).scale(stretch.set(1,.7+.3*size,1));
        view.cargo.setMatrixAt(loaded,worldMatrix.multiplyMatrices(base,offset));
        if(!tones.has(item))tones.set(item,new T.Color(tint(item)));
        view.cargo.setColorAt(loaded++,tones.get(item));
      }
    }
    if(changed){slide.instanceMatrix.needsUpdate=true;grip.instanceMatrix.needsUpdate=true;}
  }
  view.cargo.count=loaded;
  if(loaded){view.cargo.instanceMatrix.needsUpdate=true;view.cargo.instanceColor.needsUpdate=true;}
}
