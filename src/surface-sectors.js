import * as T from 'three';
import {RADIUS} from './world.js';

// 留出球面三角形的弦高，防止几何轮廓刚露出海平面就被裁掉。
const occluder = RADIUS - .05;
const point = new T.Vector3();

/** 记录表面区域的最远可见角。地形改造与矿物显露的高度余量须计入传入的包围球和最高半径。 */
function patchBounds(bounds, ceiling) {
  const distance = bounds.center.length();
  const footprint = Math.asin(Math.min(1, bounds.radius / distance));
  const summit = Math.acos(occluder / ceiling);
  return {bounds, direction: bounds.center.clone().normalize(), reach: footprint + summit};
}

/** 每台地表相机每帧更新一次视锥及几何地平线，树林、矿床和地形共用。 */
export class SurfaceFrustum {
  constructor() {
    this.frustum = new T.Frustum();
    this.projection = new T.Matrix4();
    this.eye = new T.Vector3();
  }
  update(camera) {
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    this.eye.copy(camera.position).normalize();
    this.horizon = Math.acos(Math.min(1,occluder/camera.position.length()));
  }
  sees(patch) {
    return this.eye.dot(patch.direction) >= Math.cos(Math.min(Math.PI,this.horizon+patch.reach)) && this.frustum.intersectsSphere(patch.bounds);
  }
}

/** 按经纬分开实例缓冲。返回原游戏编号到“分区网格、实例起点”的映射，采伐或显矿仍定位到同一棵树、同一个矿点。 */
export function partitionInstances(source, sites, perSite, margin=0) {
  const sectors = new Map(), slots = new Array(sites.length), parts = [];
  for (let i=0;i<sites.length;i++) {
    const {x,y} = sites[i];
    const index = Math.floor((x+90)/15)+12*Math.min(5,Math.floor((y+45)/15));
    if (!sectors.has(index)) sectors.set(index,[]);
    sectors.get(index).push(i);
  }
  for (const members of sectors.values()) {
    const mesh = new T.InstancedMesh(source.geometry,source.material,members.length*perSite);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const colors=source.instanceColor;
    if (colors) mesh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(mesh.count*3),3);
    members.forEach((id,j)=>{
      const from=id*perSite, base=j*perSite;
      mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(from*16,(from+perSite)*16),base*16);
      if(colors)mesh.instanceColor.array.set(colors.array.subarray(from*3,(from+perSite)*3),base*3);
      slots[id]={mesh,base};
    });
    // 在掩埋和采伐之前取界。否则全埋的分区会用原点零球做裁剪，铺地后也看不到矿物。
    mesh.computeBoundingSphere();mesh.boundingSphere.radius+=margin;
    mesh.frustumCulled=false;
    mesh.userData.region=patchBounds(mesh.boundingSphere,RADIUS+7);
    parts.push(mesh);
  }
  source.dispose();
  if(!parts.length){source.geometry.dispose();source.material.dispose();}
  return {parts,slots};
}

/** 将规则 SphereGeometry 的三角索引按 30° 地块排好，保留共用的顶点/法线。仅在可见区域变化时上传当帧所需索引。 */
export function terrainSectors(geometry,columns,rows) {
  const index=geometry.index, original=index.array;
  const packed=new original.constructor(original.length), patches=[];
  const position=geometry.attributes.position, stride=columns+1;
  const rowOffsets=[0];
  for(let y=0;y<rows;y++) rowOffsets.push(rowOffsets[y]+columns*(y===0||y===rows-1?3:6));
  const width=columns/12, height=rows/6;
  let cursor=0;
  for(let y=0;y<rows;y+=height) for(let x=0;x<columns;x+=width){
    const start=cursor, bounds=new T.Box3();
    for(let row=y;row<=y+height;row++){
      for(let col=x;col<=x+width;col++) bounds.expandByPoint(point.fromBufferAttribute(position,row*stride+col));
      if(row===y+height)continue;
      // 原网格两极每格只有一个三角形，中纬度有两个，按原行拷贝可保留跨分区的边与绕序。
      const step=row===0||row===rows-1?3:6;
      const begin=rowOffsets[row]+x*step;
      packed.set(original.subarray(begin,begin+width*step),cursor);cursor+=width*step;
    }
    const sphere=bounds.getBoundingSphere(new T.Sphere());sphere.radius+=3.6;
    patches.push({...patchBounds(sphere,RADIUS+3.6),start,end:cursor,visible:null});
  }
  index.setUsage(T.DynamicDrawUsage);
  return view=>{
    let changed=false;
    for(const patch of patches){
      const visible=view.sees(patch);
      if(visible!==patch.visible){patch.visible=visible;changed=true;}
    }
    if(!changed)return;
    let count=0;
    for(const patch of patches)if(patch.visible){
      original.set(packed.subarray(patch.start,patch.end),count);count+=patch.end-patch.start;
    }
    geometry.setDrawRange(0,count);index.clearUpdateRanges();
    if(count){index.addUpdateRange(0,count);index.needsUpdate=true;}
  };
}