import * as T from 'three';
import {groundRadius} from './reform-terrain.js';
import {axis,wrap,key,delta,surface,RADIUS,clamp,ANGLE} from './world.js';
import {beltsAbove,cellKey,levelRise} from './belt-level.js';
import {belts} from './catalog.js';
import {blueprintModel,factoryShape,visualLevels,storeyHeight,beltLength} from './factory-view.js';
import {previewAt} from './blueprint-controls.js';
import {rotated} from './blueprint.js';

const cyan=new T.Color('#55c8ff'),green=new T.Color('#99ff86'),red=new T.Color('#ff755c');
const ghostMaterial=new T.MeshBasicMaterial({transparent:true,opacity:.58,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
const lineMaterial=new T.LineBasicMaterial({color:0xa5ff95,transparent:true,opacity:.95,depthWrite:false});
const craftBody=new T.IcosahedronGeometry(.18,0),rotor=new T.BoxGeometry(.67,.038,.12);
const droneMat=new T.MeshStandardMaterial({color:0xd8d4bb,emissive:0x1c5353,metalness:.52,roughness:.36});
const tipMat=new T.MeshBasicMaterial({color:0xa5eee9});
const clearBatches=group=>{for(const mesh of group.children)mesh.dispose();group.clear();};

function windowJobs(planet,m){
  const c=planet.construction,out=[];if(!c)return out;
  // 只访问玩家附近格点，缩放时远方数千个预占设施不应占用显存。
  const cy=Math.round(m.y),cx=Math.round(m.x),extent=Math.min(60,Math.ceil(18/Math.max(.18,Math.cos(m.y*ANGLE))));
  for(let y=Math.max(-43,cy-17);y<=Math.min(43,cy+17);y++)for(let x=cx-extent;x<=cx+extent;x++){
    const job=c.sites[key(x,y)];if(job)out.push(job);
    for(const upper of beltsAbove(planet,x,y))if(c.sites[cellKey(upper)])out.push(upper);
  }
  return out;
}
/** 预建体共享实体工厂几何，按机型实例化。已领件机队按仿真去返程动画，掠过山丘沿球面法线抬升。 */
export class BlueprintView{
  constructor(parent,pose){
    this.pose=pose;this.root=new T.Group();this.pending=new T.Group();this.ghosts=new T.Group();this.root.add(this.pending,this.ghosts);parent.add(this.root);
    this.unit=new T.Object3D();this.local=new T.Matrix4();this.world=new T.Matrix4();this.placed=new T.Matrix4();
    this.border=new T.LineSegments(new T.BufferGeometry(),lineMaterial);this.root.add(this.border);
    this.units=new T.InstancedMesh(craftBody,droneMat,32);this.wings=new T.InstancedMesh(rotor,tipMat,32);
    this.units.frustumCulled=this.wings.frustumCulled=false;this.units.count=this.wings.count=0;this.root.add(this.units,this.wings);
  }
  point(x,y,planet){return new T.Vector3(...axis(x,y)).multiplyScalar((planet.biome==='gas'?RADIUS:groundRadius(planet,x,y))+.13);}
  outline(a,b,planet){
    const vertices=[];
    if(a&&b){
      const [dx]=delta(a,b),west=a.x+Math.min(0,dx)-.5,east=west+Math.abs(dx)+1;
      const low=Math.min(a.y,b.y)-.5,high=Math.max(a.y,b.y)+.5;
      // 每格单独贴球，跨经线或靠近极地时轮廓都能正确包围对应的建筑。
      for(let x=west;x<east;x++)for(const y of [low,high])vertices.push(this.point(x,y,planet),this.point(x+1,y,planet));
      for(let y=low;y<high;y++)for(const x of [west,east])vertices.push(this.point(x,y,planet),this.point(x,y+1,planet));
    }
    this.border.geometry.dispose();this.border.geometry=new T.BufferGeometry().setFromPoints(vertices);this.border.visible=!!vertices.length;
  }
  populate(group,tiles,p,colors){
    clearBatches(group);const types=new Map();
    for(const tile of tiles){
      const shape=factoryShape(tile);
      if(!types.has(shape))types.set(shape,[]);
      types.get(shape).push(tile);
    }
    for(const [type,members] of types){
      const schema=blueprintModel(type),count=members.reduce((n,t)=>n+visualLevels(t),0);
      for(const part of schema.parts){
        const mesh=new T.InstancedMesh(part.geometry,ghostMaterial,count);let j=0;
        for(const tile of members){
          this.pose(this.unit,tile.x,tile.y,p.seed,.095+(tile.h||0)*levelRise,p.biome==='gas');
          this.unit.scale.set(belts.includes(tile.type)?beltLength(tile):1,1,1);this.unit.rotateY(tile.dir*Math.PI/2);this.unit.updateMatrix();
          for(let level=0;level<visualLevels(tile);level++){
            this.local.makeTranslation(0,storeyHeight(type)*level,0);this.placed.multiplyMatrices(this.unit.matrix,this.local);
            if(part.moving)this.placed.multiply(schema.motor.matrixWorld);
            mesh.setMatrixAt(j,this.placed);mesh.setColorAt(j++,colors(tile));
          }
        }
        mesh.computeBoundingSphere();group.add(mesh);
      }
    }
  }
  draw(game,ui){
    const p=game.planet,c=p.construction,editing=ui.panel==='blueprint'&&ui.view==='surface';this.root.visible=ui.view==='surface'&&!!(editing||c);
    if(!this.root.visible){this.planKey='';return;}
    const m=game.mecha,desk=ui.bp;
    const stamp=[c?.revision,c?.layout,Math.round(m.x/2),Math.round(m.y/2)].join(':');
    if(this.planet!==p||this.stamp!==stamp||this.works!==c){
      this.planet=p;this.works=c;this.stamp=stamp;this.populate(this.pending,windowJobs(p,m),p,()=>cyan);this.planKey='';
    }
    const corner=desk?.last||ui.hover||desk?.first;
    const token=editing?[desk.mode,desk.first?.x,desk.first?.y,corner?.x,corner?.y,desk.anchor?.x,desk.anchor?.y,desk.turn,desk.mirror,p.revision,c?.revision].join(':'):'-';
    if(this.planKey!==token||this.pattern!==desk?.pattern){
      this.planKey=token;this.pattern=desk?.pattern;
      let a=editing&&desk.mode!=='library'?desk.first:null,b=a?corner:null,tiles=[],errors;
      if(editing&&desk.mode==='paste'){
        const result=previewAt(game,desk);tiles=result?.nodes||[];errors=result?.errors;
        const pat=desk.pattern,mx=Math.floor((pat.width-1)/2),my=Math.floor((pat.height-1)/2);
        const cornerAt=(x,y)=>{const [dx,dy]=rotated((x-mx)*(desk.mirror?-1:1),y-my,desk.turn);return {x:wrap(desk.anchor.x+dx),y:clamp(desk.anchor.y+dy,-44,44)};};
        a=cornerAt(0,0);b=cornerAt(pat.width-1,pat.height-1);
      }
      this.populate(this.ghosts,tiles,p,t=>errors?.has(cellKey(t))?red:green);this.outline(a,b,p);
      this.border.material.color.copy(errors?.size?red:green);
    }
    const drones=c?.drones||[];this.units.count=this.wings.count=Math.min(drones.length,32);
    for(let i=0;i<this.units.count;i++){
      const d=drones[i],lx=d.back?d.tx:d.x,ly=d.back?d.ty:d.y,rx=d.back?m.x:d.tx,ry=d.back?m.y:d.ty;
      const t=clamp(1-d.left/d.leg,0,1),x=wrap(lx+wrap(rx-lx)*t),y=ly+(ry-ly)*t;
      const height=.46+(d.back?t:1-t)*.85+Math.sin(t*Math.PI)*1.2;
      this.unit.scale.set(1,1,1);this.pose(this.unit,x,y,p.seed,height,p.biome==='gas');this.unit.rotateY(Math.atan2(wrap(rx-lx),ry-ly));this.unit.updateMatrix();
      this.units.setMatrixAt(i,this.unit.matrix);this.wings.setMatrixAt(i,this.unit.matrix);
    }
    if(drones.length)this.units.instanceMatrix.needsUpdate=this.wings.instanceMatrix.needsUpdate=true;
  }
}
