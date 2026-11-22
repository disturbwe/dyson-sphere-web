import * as THREE from 'three';
import {clamp} from './world.js';
import {groundContact} from './defense-fire.js';
import {orbitContact,fleetTarget} from './defense-orbit.js';
import {hiveHere} from './space-hive.js';

const visibleLimit=64,segments=3;
/** 在一批线段中绘制真实在途记录。上限只约束画面，未进入画面的弹体继续按固定步长命中。 */
export class MissileView extends THREE.LineSegments {
  constructor(pose){
    const geometry=new THREE.BufferGeometry();
    const vertices=visibleLimit*segments*2;
    const position=new THREE.BufferAttribute(new Float32Array(vertices*3),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',position);
    const colors=new Float32Array(vertices*3);
    const steps=['#854b3a','#e47f49','#ffd99c','#fffae0'].map(color=>new THREE.Color(color));
    for(let i=0;i<vertices;i++)steps[Math.floor(i/2)%segments+i%2].toArray(colors,i*3);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setDrawRange(0,0);
    super(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.96,depthWrite:false}));
    this.pose=pose;this.paths=new WeakMap();this.anchor=new THREE.Object3D();this.vertex=new THREE.Vector3();
    this.frustumCulled=false;
  }
  path(game,shot){
    let path=this.paths.get(shot);
    if(!path){
      this.pose(this.anchor,shot.originX,shot.originY,game.planet,1.30);
      path={start:this.anchor.position.clone().normalize(),startRadius:this.anchor.position.length(),
        tangent:new THREE.Vector3(),end:new THREE.Vector3(),next:0};
      this.paths.set(shot,path);
    }
    if(game.elapsed<path.next)return path;
    const fog=game.planet.fog;
    const orbit=shot.target<=fleetTarget;
    const contact=orbit?orbitContact(hiveHere(game),game.space.current,fog,shot.target,game.space.fogNet.clock):groundContact(fog,shot.target);
    const target=orbit?contact?.stamp===shot.stamp&&contact:contact?.hp&&contact;
    const end=target||shot;
    this.pose(this.anchor,end.x,end.y,game.planet,(end.height||0)+.44);
    path.endRadius=this.anchor.position.length();path.end.copy(this.anchor.position).normalize();
    const dot=clamp(path.start.dot(path.end),-1,1);
    path.angle=Math.acos(dot);path.tangent.copy(path.end).addScaledVector(path.start,-dot);
    // 对跖或同点没有唯一大圆方向。固定一条正交基线，避免极端经纬度下尾迹出现 NaN。
    if(path.tangent.lengthSq()<1e-10){
      path.tangent.set(Math.abs(path.start.y)>.9?1:0,Math.abs(path.start.y)>.9?0:1,0);
      path.tangent.addScaledVector(path.start,-path.tangent.dot(path.start));
    }
    path.tangent.normalize();path.next=game.elapsed+.2;
    return path;
  }
  draw(game){
    const shots=game.planet.fog?.missiles;
    this.visible=!!shots?.length;if(!this.visible)return;
    const position=this.geometry.attributes.position;
    let written=0;
    for(let index=0;index<Math.min(shots.length,visibleLimit);index++){
      const shot=shots[index],path=this.path(game,shot);
      const duration=shot.due-shot.born,time=game.elapsed-shot.born;
      for(let i=0;i<segments*2;i++){
        const fraction=(Math.floor(i/2)+i%2)/segments;
        const t=clamp((time-(1-fraction)*Math.min(.24,duration*.36))/duration,0,1);
        const angle=t*path.angle;
        const height=THREE.MathUtils.lerp(path.startRadius,path.endRadius,t)+Math.sin(t*Math.PI)*Math.min(9,1.75+path.angle*5);
        this.vertex.copy(path.start).multiplyScalar(Math.cos(angle)).addScaledVector(path.tangent,Math.sin(angle)).multiplyScalar(height);
        position.setXYZ(written++,this.vertex.x,this.vertex.y,this.vertex.z);
      }
    }
    this.geometry.setDrawRange(0,written);position.needsUpdate=true;
  }
}
