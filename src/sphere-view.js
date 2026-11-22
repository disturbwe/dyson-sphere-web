import * as T from 'three';
import {layerById, vectorAt, orbitBasis} from './sphere.js';
import {makeSun, makeDeepSky} from './stellar-light.js';
import {buildHardware} from './stellar-hardware.js';
import {starSystem} from './cluster.js';
import {layerRotation} from './layer-orbit.js';
import {makeSwarm} from './stellar-swarm.js';

const scaleRadius = meters => meters / 2700;
const unit = node => new T.Vector3(...vectorAt(node.lon,node.lat));
const origin = new T.Vector3();
const deg = Math.PI / 180;

function segments(lines,color,alpha) {
  const geometry=new T.BufferGeometry().setFromPoints(lines);
  return new T.LineSegments(geometry,new T.LineBasicMaterial({color,transparent:true,opacity:alpha,depthWrite:false}));
}
function runLine(lines, at, count) {
  let previous=at(0);
  for(let i=1;i<=count;i++){const point=at(i/count);lines.push(previous,point);previous=point;}
}
/** 编辑格只在壳层设计时开启。外圈刻度是真实经度，辅助线与物理构件单独管理。 */
function draftingGuide(layer) {
  const radius=scaleRadius(layer.radius),lines=[],ruler=[],blueprint=[];
  const gridPoint=(lon,lat,scale=1)=>new T.Vector3(...vectorAt(lon,lat)).multiplyScalar(radius*scale);
  for(let lat=-75;lat<=75;lat+=15)runLine(lines,t=>gridPoint(360*t,lat),144);
  for(let lon=0;lon<360;lon+=15)runLine(lines,t=>gridPoint(lon,180*t-90),64);
  runLine(ruler,t=>gridPoint(360*t,0,1.055),180);
  for(let lon=0;lon<360;lon+=2)ruler.push(gridPoint(lon,0,1.055),gridPoint(lon,0,lon%30===0?1.094:lon%10===0?1.079:1.065));
  const nodes=new Map(layer.nodes.map(n=>[n.id,unit(n)]));
  for(const edge of layer.edges){const a=nodes.get(edge.a),b=nodes.get(edge.b);
    runLine(blueprint,t=>a.clone().lerp(b,t).normalize().multiplyScalar(radius),30);}
  for(const n of layer.nodes){const v=nodes.get(n.id),w=new T.Vector3(0,1,0).cross(v);if(w.lengthSq()<.001)w.set(1,0,0);w.normalize();
    const u=v.clone().cross(w);const mark=(basis,sign)=>v.clone().multiplyScalar(radius*1.002).addScaledVector(basis,sign*.011*radius);
    blueprint.push(mark(w,-1),mark(w,1),mark(u,-1),mark(u,1));}
  const group=new T.Group();group.add(segments(lines,0x587e89,.17),segments(ruler,0x9dbcc6,.56),segments(blueprint,0x91cdde,.60));return group;
}
function orbitGuide(orbit) {
  const [u,v]=orbitBasis(orbit).map(a=>new T.Vector3(...a));const lines=[],radius=scaleRadius(orbit.radius);
  runLine(lines,t=>u.clone().multiplyScalar(radius*Math.cos(t*2*Math.PI)).addScaledVector(v,radius*Math.sin(t*2*Math.PI)),192);
  return segments(lines,0xedbd81,.47);
}
function clearGuides(group){group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group.clear();}

export class SphereView {
  /** 复用行星渲染器。仿真决定每根梁、每块壳的可见份额，编辑网格与相机只属于当前屏幕。 */
  constructor(renderer,backdrop) {
    this.renderer=renderer;this.scene=new T.Scene();this.scene.background=new T.Color('#080b10');
    this.camera=new T.PerspectiveCamera(41,1,.03,1800);
    this.sun=makeSun();this.swarm=makeSwarm();this.scene.add(makeDeepSky(),backdrop.clone(),this.sun.group,this.swarm.points);
    this.ray=new T.Raycaster();this.structures=new Map();this.orbits=new T.Group();this.scene.add(this.orbits);
    this.selector=new T.Mesh(new T.TorusGeometry(1,.085,6,48),new T.MeshBasicMaterial({color:0x97f5ff,depthWrite:false}));
    this.scene.add(this.selector);this.selector.visible=false;
    this.fleet=new T.Group();this.scene.add(this.fleet);
    this.rocketBody=new T.ConeGeometry(.018,.11,8);this.rocketMetal=new T.MeshBasicMaterial({color:0xffefc7});
    this.exhaustShape=new T.ConeGeometry(.016,.27,8);this.exhaustColor=new T.MeshBasicMaterial({color:0x75b5ff,transparent:true,opacity:.85,depthWrite:false});
    this.launchSite=new T.Vector3();this.up=new T.Vector3(0,1,0);this.direction=new T.Vector3();this.target=new T.Vector3();
    this.inversePose=new T.Quaternion();this.arrivalPose=new T.Quaternion();
    this.reset();
  }
  reset(){
    for(const part of this.structures.values()){this.scene.remove(part.mesh,part.guide);part.dispose();clearGuides(part.guide);}
    this.structures.clear();this.orbitKey='';this.yaw=-.40;this.latitude=.39;this.distance=3.23;this.lastRevision=-1;
  }
  sync(sphere,ui,elapsed,primary) {
    // 切换工具或高亮节点不重建金属几何。拓扑编辑时只更新受影响的那一层。
    for(const [id,part] of this.structures)if(!layerById(sphere,id)){this.scene.remove(part.mesh,part.guide);part.dispose();clearGuides(part.guide);this.structures.delete(id);}
    const deadline=performance.now()+3;
    const compact=sphere.layers.reduce((n,l)=>n+l.nodes.length+l.edges.length+l.shells.length,0)>640;
    for(const layer of sphere.layers){
      const key=[compact,layer.nodes.at(-1)?.id,layer.edges.at(-1)?.id,layer.shells.at(-1)?.id,layer.nodes.length,layer.edges.length,layer.shells.length].join('/');
      let part=this.structures.get(layer.id);
      if(!part||part.key!==key){
        if(part){this.scene.remove(part.mesh,part.guide);part.dispose();clearGuides(part.guide);}
        part={...buildHardware(layer,scaleRadius(layer.radius),compact),guide:draftingGuide(layer),key};this.structures.set(layer.id,part);this.scene.add(part.mesh,part.guide);
      }else if(this.lastRevision!==sphere.revision)part.sync();
      part.pump(deadline);
      // 构件和网格共用同一刚体姿态，无须为连续自转重新生成任何顶点。
      layerRotation(part.mesh.quaternion,layer,elapsed,primary);
      part.guide.quaternion.copy(part.mesh.quaternion);
      part.guide.visible=ui.sTab==='layers' && layer.id===ui.layer && !ui.panorama;
    }
    this.lastRevision=sphere.revision;
    const orbitKey=sphere.orbits.map(o=>[o.id,o.radius,o.tilt,o.longitude].join('.')).join('/');
    if(this.orbitKey!==orbitKey){clearGuides(this.orbits);this.orbitKey=orbitKey;for(const o of sphere.orbits){const line=orbitGuide(o);line.userData.id=o.id;this.orbits.add(line);}}
    this.orbits.visible=ui.sTab==='orbits'&&!ui.panorama;
    if(this.orbits.visible)for(const line of this.orbits.children)line.material.opacity=line.userData.id===ui.orbit ? .64 : .18;
  }
  flights(game,primary){
    const sphere=game.dyson;
    while(this.fleet.children.length<Math.min(100,sphere.flights.length)){
      const rocket=new T.Group(),body=new T.Mesh(this.rocketBody,this.rocketMetal),exhaust=new T.Mesh(this.exhaustShape,this.exhaustColor);
      exhaust.rotation.z=Math.PI;exhaust.position.y=-.16;rocket.add(body,exhaust);this.fleet.add(rocket);
    }
    this.launchSite.set(16.67*Math.cos(game.elapsed/5400),0,16.67*Math.sin(game.elapsed/5400));
    this.fleet.children.forEach((rocket,i)=>{
      const f=sphere.flights[i],layer=f&&layerById(sphere,f.layer);
      const part=layer&&(layer.nodes.find(p=>p.id===f.part)||layer.edges.find(e=>e.id===f.part));
      rocket.visible=!!part;if(!part)return;
      const node=part.lon!==undefined?part:layer.nodes.find(n=>n.id===part.a);
      // 用订单抵达时的节点位置作交会点。订单飞行期间改变壳层朝向也会反映在末端航迹。
      layerRotation(this.arrivalPose,layer,f.arrival,primary);
      this.target.fromArray(vectorAt(node.lon,node.lat)).applyQuaternion(this.arrivalPose).multiplyScalar(scaleRadius(layer.radius));
      const t=1-Math.min(1,Math.max(0,(f.arrival-game.elapsed)/8));
      rocket.position.lerpVectors(this.launchSite,this.target,t);rocket.position.y+=2.2*Math.sin(t*Math.PI);
      this.direction.subVectors(this.target,this.launchSite);this.direction.y+=2.2*Math.PI*Math.cos(t*Math.PI);rocket.quaternion.setFromUnitVectors(this.up,this.direction.normalize());
    });
  }
  draw(game,ui) {
    const sphere=game.dyson,layer=layerById(sphere,ui.layer),canvas=this.renderer.domElement;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    const primary=starSystem(game)[0];
    this.sync(sphere,ui,game.elapsed,primary);this.sun.time.value=game.elapsed;
    this.swarm.update(sphere,game.elapsed,h*this.renderer.getPixelRatio());this.flights(game,primary);
    const pose=this.structures.get(layer?.id)?.mesh.quaternion;
    const selected=layer?.nodes.find(n=>n.id===ui.chain?.at(-1));this.selector.visible=!!selected&&!ui.panorama;
    if(selected){const n=unit(selected).applyQuaternion(pose),r=scaleRadius(layer.radius);this.selector.position.copy(n).multiplyScalar(r*1.023);this.selector.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),n);this.selector.scale.setScalar(r*.048);}
    const panel=ui.panorama?0:Math.min(296,w*.30),narrow=w<=700;
    const stageW=narrow?w:w-panel,stageH=narrow&&!ui.panorama?h*.53:h;
    const focus=scaleRadius(layer?.radius??sphere.orbits.find(o=>o.id===ui.orbit)?.radius??sphere.orbits[0].radius);
    const distance=focus*this.distance*Math.max(h/stageH,h/stageW);
    this.camera.position.set(distance*Math.sin(this.yaw)*Math.cos(this.latitude),distance*Math.sin(this.latitude),distance*Math.cos(this.yaw)*Math.cos(this.latitude));
    // 跟随参考系只改变观察者，玩家画第二条边时第一条边不会因自转滑走。
    this.camera.up.copy(this.up);
    if(ui.followLayer&&pose){this.camera.position.applyQuaternion(pose);this.camera.up.applyQuaternion(pose);}
    this.camera.lookAt(origin);this.camera.rotateZ(-.25);this.camera.aspect=w/h;
    this.camera.setViewOffset(w,h,(w-stageW)/2,(h-stageH)/2, w,h);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    this.renderer.render(this.scene,this.camera);
  }
  /** 对当前镜头射线取球面近交点，避免把点击投到被壳面遮住的背面节点。空层之外返回 null。 */
  pick(x,y,layer) {
    if(!layer)return null;const rect=this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera({x:(x-rect.left)/rect.width*2-1,y:1-(y-rect.top)/rect.height*2},this.camera);
    const point=this.ray.ray.intersectSphere(new T.Sphere(origin,scaleRadius(layer.radius)),new T.Vector3());if(!point)return null;
    // 逆变换使用上一帧实际显示的姿态，避免低帧率或模拟倍速下点中相邻格。
    const pose=this.structures.get(layer.id)?.mesh.quaternion;if(!pose)return null;
    point.normalize().applyQuaternion(this.inversePose.copy(pose).invert());let best=4*deg,hit=null;for(const node of layer.nodes){const d=unit(node).angleTo(point);if(d<best){best=d;hit=node.id;}}
    return {lon:Math.atan2(point.x,point.z)/deg,lat:Math.asin(point.y)/deg,id:hit};
  }
}
