import * as THREE from 'three';
import {blueprintModel} from './factory-view.js';
import {stationed,hiveHere,relayTripSeconds} from './space-hive.js';
import {battleCap} from './fog-rules.js';
import {combatStrokes} from './ground-combat.js';
import {MissileView} from './missile-view.js';
import {clamp,wrap} from './world.js';

const capacityByType={'fog-core':1,'fog-relay':3,'fog-lancer':6,'fog-pit':1,'fog-ranger':battleCap,'fog-raider':battleCap,'fog-debris':96};
/** 一片地表共用一批敌方实例。视图读取实际在场单位、残骸和短时命中特效，退出战区或打开和平档即隐藏。 */
export class FogView extends THREE.Group {
  constructor(pose){
    super();this.pose=pose;this.types=new Map();this.tracks=new WeakMap();
    this.body=new THREE.Object3D();this.point=new THREE.Object3D();this.color=new THREE.Color();
    const geo=new THREE.BufferGeometry();
    for(const attr of ['position','color'])geo.setAttribute(attr,new THREE.BufferAttribute(new Float32Array(60*6),3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0,0);
    this.strokes=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.95,depthWrite:false}));
    this.strokes.frustumCulled=false;this.add(this.strokes);
    this.missiles=new MissileView(pose);this.add(this.missiles);
  }
  groupFor(type){
    let group=this.types.get(type);if(group)return group;
    const parts=blueprintModel(type).parts.map(part=>{
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,capacityByType[type]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.frustumCulled=false;this.add(mesh);return mesh;
    });
    group={count:0,parts};this.types.set(type,group);return group;
  }
  emit(type,object){
    const group=this.groupFor(type);
    if(group.count>=capacityByType[type])return;
    object.updateMatrix();for(const mesh of group.parts)mesh.setMatrixAt(group.count,object.matrix);group.count++;
  }
  anchor(planet,x,y,height=0,yaw=0){
    this.pose(this.body,x,y,planet,height);this.body.rotateY(yaw);return this.body;
  }
  unit(game,unit){
    let path=this.tracks.get(unit);
    if(!path||path.x!==unit.x||path.y!==unit.y){
      this.pose(this.point,unit.x,unit.y,game.planet,.055);
      if(!path){path={previous:this.point.position.clone(),next:this.point.position.clone()};this.tracks.set(unit,path);}
      else{path.previous.copy(path.next);path.next.copy(this.point.position);}
      path.x=unit.x;path.y=unit.y;path.changedAt=game.elapsed;
      path.orientation??=new THREE.Quaternion();path.orientation.copy(this.point.quaternion);
    }
    // 只在模拟更新经纬度时采地形。渲染帧用本次导航节拍插值，使 5Hz 的寻路在 30/60Hz 画面里连续移动。
    this.body.position.lerpVectors(path.previous,path.next,clamp((game.elapsed-path.changedAt)/.2,0,1));
    this.body.quaternion.copy(path.orientation);this.body.rotateY(Math.PI-unit.angle);
    this.emit('fog-'+unit.kind,this.body);
  }
  traffic(game){
    const h=hiveHere(game);if(!h)return;
    const body=game.space.current,p=game.planet,clock=game.space.fogNet.clock;
    const relay=(trip,arriving)=>{
      const progress=clamp((trip.left-clock)/relayTripSeconds,0,1),rise=arriving?progress:1-progress;
      this.emit('fog-relay',this.anchor(p,wrap(trip.x+rise*9),clamp(trip.y+rise*3,-43,43),5.4+rise*22,game.elapsed*.11));
    };
    if(h.flight?.body===body)relay(h.flight,h.flight.leg==='approach');
    for(const trip of h.withdrawals)if(trip.body===body)relay(trip,false);
    const a=h.raid;if(!a||a.body!==body)return;
    // 用同一编队阶段驱动入轨和撤离。光束终点取本轮打击的设施，不另造随机受击点。
    const target=a.mark||p.fog.base,offset=a.leg==='approach'?(a.left-clock)/18:a.leg==='return'?1-(a.left-clock)/18:0;
    for(let i=0;i<a.ships;i++){
      const x=wrap(target.x-6+2.3*i+offset*17),y=clamp(target.y+4+offset*7+i*.6,-43,43);
      this.emit('fog-lancer',this.anchor(p,x,y,13+offset*15,1.96));
    }
  }
  beams(game){
    const geom=this.strokes.geometry,pos=geom.attributes.position,col=geom.attributes.color;
    let n=0;
    for(const event of combatStrokes(game.planet)){
      if(event.until<game.elapsed)continue;
      this.color.setHex(event.color);
      for(const [point,height] of [[event.a,1.24],[event.b,event.endHeight??.43]]){
        this.pose(this.point,point.x,point.y,game.planet,height);
        const {x,y,z}=this.point.position;
        pos.setXYZ(n,x,y,z);col.setXYZ(n,this.color.r,this.color.g,this.color.b);n++;
      }
    }
    const a=hiveHere(game)?.raid;
    if(n+2<=pos.count&&a?.body===game.space.current&&a.leg==='fire'&&a.left===8&&a.mark){
      const {x,y}=a.mark;this.color.setHex(0x9af4ec);
      for(const [lon,lat,lift] of [[wrap(x-6),clamp(y+4,-43,43),13],[x,y,.8]]){
        this.pose(this.point,lon,lat,game.planet,lift);const v=this.point.position;
        pos.setXYZ(n,v.x,v.y,v.z);col.setXYZ(n,this.color.r,this.color.g,this.color.b);n++;
      }
    }
    geom.setDrawRange(0,n);if(n){pos.needsUpdate=true;col.needsUpdate=true;}
  }
  draw(game,mode){
    const p=game.planet,f=p.fog;
    this.visible=!!f&&(mode==='surface'||mode==='orbit');if(!this.visible)return;
    for(const group of this.types.values())group.count=0;
    if(!f.sealed){
      this.emit(f.base.hp?'fog-core':'fog-pit',this.anchor(p,f.base.x,f.base.y,.035));
      if(stationed(f))this.emit('fog-relay',this.anchor(p,f.base.x,f.base.y,5.35+Math.sin(game.elapsed*1.2)*.065,game.elapsed*.11));
    }
    for(const unit of f.units)this.unit(game,unit);
    for(let i=Math.max(0,f.debris.length-capacityByType['fog-debris']);i<f.debris.length;i++){
      const pile=f.debris[i];this.emit('fog-debris',this.anchor(p,pile.x,pile.y,.07,pile.id*.81));
    }
    this.traffic(game);this.beams(game);this.missiles.draw(game);
    for(const {parts,count} of this.types.values())for(const mesh of parts){mesh.count=count;if(count)mesh.instanceMatrix.needsUpdate=true;}
  }
}
