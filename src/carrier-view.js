import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {axis,RADIUS} from './world.js';
import {groundRadius} from './reform-terrain.js';
import {ordersOf,icarusPort} from './distribution.js';
import {freightPort} from './freight.js';

const models=new Map();
function carrierGeometry(kind){
  if(models.has(kind))return models.get(kind);
  const parts=[],dummy=new T.Object3D(),c=new T.Color();
  function piece(shape,color,x,y,z,w,h,l){
    const geometry=shape==='hoop'?new T.TorusGeometry(.5,.10,5,16).rotateX(Math.PI/2).toNonIndexed():shape==='plate'?new T.BoxGeometry(1,1,1).toNonIndexed():new T.IcosahedronGeometry(.62,1);
    geometry.deleteAttribute('uv');dummy.position.set(x,y,z);dummy.scale.set(w,h,l);dummy.rotation.set(0,0,0);dummy.updateMatrix();geometry.applyMatrix4(dummy.matrix);
    const attr=new Float32Array(geometry.attributes.position.count*3);c.set(color);
    for(let i=0;i<attr.length;i+=3)c.toArray(attr,i);
    geometry.setAttribute('color',new T.BufferAttribute(attr,3));parts.push(geometry);
  }
  if(kind==='bot'){
    piece('pod','#627a83',0,0,0,.39,.18,.34);
    piece('plate','#c3ad85',0,-.12,0,.20,.13,.21);
    for(let i=0;i<3;i++){
      const angle=i*2*Math.PI/3,x=Math.sin(angle)*.28,z=Math.cos(angle)*.28;
      piece('pod','#c3d3d7',x*.58,.015,z*.58,.25,.08,.22);
      piece('hoop','#9aadb6',x,.04,z,.36,.36,.36);
      piece('hoop','#78b4cb',x,.035,z,.22,.22,.22);
      piece('plate','#4e7786',x,.052,z,.21,.018,.05);
    }
  }else if(kind==='drone'){
    // 运输机是流线形短舱，腹部挂载仓、蓝色升力口和尾端位置灯在近景也可分辨。
    piece('pod','#d7dfe1',0,.05,0,.63,.29,.83);
    piece('pod','#354c61',0,-.085,.02,.59,.20,.68);
    piece('plate','#88e9ff',0,-.041,-.37,.32,.06,.05);
    for(const side of [-1,1]){piece('pod','#5a7080',side*.26,0,.13,.17,.19,.44);piece('pod','#5cddff',side*.26,-.006,.30,.12,.13,.13);}
  }else{
    piece('pod','#647481',0,.03,0,1.21,.54,2.20);
    piece('plate','#a4b9ca',0,.15,-.10,1.18,.22,1.56);
    for(let n=0;n<4;n++)piece('plate','#d3d5cc',0,.36,-.59+n*.32,.80,.23,.25);
    for(const side of [-1,1]){piece('pod','#7d909f',side*.57,0,.23,.29,.35,1.44);piece('pod','#72dcff',side*.55,-.01,.79,.22,.24,.32);}
    piece('pod','#354f64',0,.13,-.94,.73,.32,.50);
  }
  const geometry=mergeGeometries(parts);
  for(const p of parts)p.dispose();models.set(kind,geometry);return geometry;
}
const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.53,metalness:.23});
const UP=new T.Vector3(0,1,0);
function addressRecord(game,address){
  const t=freightPort(game,address),id=address.split('/')[0],planet=id===game.space.current?game.planet:game.space.parked[id];
  return {normal:new T.Vector3(...axis(t.x,t.y)),height:planet.biome==='gas'?RADIUS+2.91:groundRadius(planet,t.x,t.y)+(t.type==='interstellar-logistics-station'?6.75:4.5),id};
}
/** 将调度器的货单映射到地表起降和星图航线。实例上限只影响缩略绘制，所有货单照常运转与到达。 */
export class CarrierView{
  constructor(parent,space=false){
    this.space=space;this.parent=parent;this.batches={};this.capacity=192;this.tripCache=new WeakMap();
    for(const kind of (space?['vessel']:['bot','drone','vessel'])){
      const batch=new T.InstancedMesh(carrierGeometry(kind),material,this.capacity);
      batch.count=0;batch.frustumCulled=false;batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.batches[kind]=batch;parent.add(batch);
    }
    this.p=new T.Vector3();this.tangent=new T.Vector3();this.up=new T.Vector3();this.right=new T.Vector3();this.planar=new T.Vector3();this.z=new T.Vector3();this.matrix=new T.Matrix4();this.obj=new T.Object3D();
  }
  path(game,trip){
    let path=this.tripCache.get(trip);if(path)return path;
    const source=addressRecord(game,trip.source),destination=addressRecord(game,trip.destination);
    const a=trip.collect?destination:source,b=trip.collect?source:destination;
    path={a,b};this.tripCache.set(trip,path);return path;
  }
  add(batch,position,up,heading,scale){
    this.z.copy(heading).normalize().negate();this.right.crossVectors(up,this.z);
    // 对径或垂直起飞时用备用切向轴，避免瞬时零向量导致飞船在塔顶消失。
    if(this.right.lengthSq()<1e-9){this.right.set(1,0,0);if(Math.abs(this.z.x)>.92)this.right.copy(UP);this.right.cross(this.z);}
    this.right.normalize();this.planar.crossVectors(this.z,this.right).normalize();
    this.obj.position.copy(position);this.obj.quaternion.setFromRotationMatrix(this.matrix.makeBasis(this.right,this.planar,this.z));this.obj.scale.setScalar(scale);
    this.obj.updateMatrix();batch.setMatrixAt(batch.count++,this.obj.matrix);
  }
  surfaceLeg(batch,from,to,phase,size){
    // 承运节点在球面而非一张平面上，远距离运输沿大圆弧飞行，途中不会钻入行星。
    const cosine=Math.max(-1,Math.min(1,from.normal.dot(to.normal))),angle=Math.acos(cosine);
    this.tangent.copy(to.normal).addScaledVector(from.normal,-cosine);
    if(this.tangent.lengthSq()<1e-9){this.tangent.crossVectors(UP,from.normal);if(this.tangent.lengthSq()<1e-9)this.tangent.set(1,0,0);}
    this.tangent.normalize();this.up.copy(from.normal).multiplyScalar(Math.cos(phase*angle)).addScaledVector(this.tangent,Math.sin(phase*angle));
    const rise=Math.sin(Math.PI*phase)*Math.min(5,1.15+angle*3);
    this.p.copy(this.up).multiplyScalar(from.height*(1-phase)+to.height*phase+rise);
    this.tangent.multiplyScalar(Math.cos(phase*angle)).addScaledVector(from.normal,-Math.sin(phase*angle));
    this.add(batch,this.p,this.up,this.tangent,size);
  }
  drawBots(game){
    const batch=this.batches.bot,planet=game.planet;
    for(const trip of ordersOf(planet)){
      if(batch.count>=this.capacity)break;
      let path=this.tripCache.get(trip);
      if(!path||path.back!==trip.back||path.bx!==trip.bx||path.by!==trip.by){
        // 机甲走动会触发一段追赶航程。仅在航段切换时计算起降点，常规帧沿缓存的大圆弧插值。
        const endpoint=(x,y,personal)=>{
          const floor=planet.tiles[Math.round(x)+','+Math.round(y)]?.layers||1;
          const height=groundRadius(planet,x,y)+(personal?1.75+(game.mecha.flying?1.65:0):floor*1.16+.71);
          return {normal:new T.Vector3(...axis(x,y)),height};
        };
        const personal=trip.peer===icarusPort;
        path={back:trip.back,bx:trip.bx,by:trip.by,a:endpoint(trip.ax,trip.ay,personal&&trip.back),b:endpoint(trip.bx,trip.by,personal&&!trip.back)};
        this.tripCache.set(trip,path);
      }
      this.surfaceLeg(batch,path.a,path.b,1-Math.max(0,Math.min(1,trip.remaining/trip.leg)),1);
    }
  }
  draw(game,bodies=null){
    for(const batch of Object.values(this.batches))batch.count=0;
    if(!this.space)this.drawBots(game);
    for(const trip of game.freight.trips){
      const batch=this.batches[trip.kind];if(!batch||batch.count>=this.capacity)continue;
      const path=this.path(game,trip),from=trip.back?path.b:path.a,to=trip.back?path.a:path.b;
      const phase=1-Math.min(1,Math.max(0,trip.remaining/trip.leg));
      if(this.space){
        // 星系图只显示两端都在本星系的航段，跨星订单继续由同一货单结算。
        const start=bodies.get(from.id),end=bodies.get(to.id);
        if(!start||!end)continue;
        const a=start.position,b=end.position;
        this.p.lerpVectors(a,b,phase);this.tangent.subVectors(b,a);this.add(batch,this.p,UP,this.tangent,.076);
      }else if(trip.kind==='drone'&&from.id===game.space.current){
        this.surfaceLeg(batch,from,to,phase,1.10);
      }else if(trip.kind==='vessel'){
        const depart=from.id===game.space.current,arrive=to.id===game.space.current;
        if(!depart&&!arrive)continue;
        const seconds=trip.leg*(depart?phase:1-phase);if(seconds>7)continue;
        const port=depart?from:to;this.tangent.set(1,0,0).addScaledVector(port.normal,-port.normal.x);
        if(this.tangent.lengthSq()<1e-9)this.tangent.crossVectors(UP,port.normal);
        this.tangent.normalize();this.p.copy(port.normal).multiplyScalar(port.height+seconds*seconds*.40).addScaledVector(this.tangent,seconds*.70);
        this.tangent.multiplyScalar(.70).addScaledVector(port.normal,seconds*.8+.01);if(arrive)this.tangent.negate();
        this.add(batch,this.p,port.normal,this.tangent,.72);
      }
    }
    for(const batch of Object.values(this.batches))if(batch.count)batch.instanceMatrix.needsUpdate=true;
  }
}
