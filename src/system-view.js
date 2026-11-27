import * as T from 'three';
import {AU,starSystem,positionAt,bodyOf,mechaPosition,sphereOf} from './navigation.js';
import {metersPerYardUnit} from './distant-yard.js';
import {rotationOf} from './ephemeris.js';
import {makeSun,makeDeepSky} from './stellar-light.js';
import {gasProfile} from './gas.js';
import {flightModel} from './flight-render.js';
import {pilotStar} from './sail-pilot.js';
import {ClusterView} from './cluster-view.js';
import {activeStar,centerMeters,homeSystemOf,starOf} from './cluster.js';
import {CarrierView} from './carrier-view.js';

const tau=Math.PI*2,unit=12/AU;
const viewSize={mediterranean:.31,lava:.37,gobi:.43,ashen:.39,gelisol:.41,gas:1.07,sulfuria:.37,aquatica:.40,cyclonius:.38,tropicana:.41};
const worldScale=new T.Vector3(1,1,1);

/** 轨带只在边缘渐亮，倾斜的圆投影成椭圆；卫星轨道跟着母行星平移。 */
function orbitBand(body) {
  const radius=body.radius*unit;
  const geometry=new T.RingGeometry(radius*.70,radius,160);
  const material=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,
    uniforms:{radius:{value:radius}},
    vertexShader:'varying vec2 radial; uniform float radius; void main(){radial=position.xy/radius; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 radial; void main(){float r=length(radial);float w=fwidth(r);float fill=pow(clamp((r-.7)/.3,0.,1.),2.8);float line=smoothstep(.997-w,.997,r);gl_FragColor=vec4(mix(vec3(.035,.27,.31),vec3(.25,.55,.59),line),fill*.27+line*.55);}`});
  const ring=new T.Mesh(geometry,material);ring.rotation.x=Math.PI/2-body.tilt;return ring;
}

/** 星图行星按天体类型绘制色带、熔岩裂隙或地表，明暗取决于真实恒星方向。 */
function planetMaterial(body) {
  const {biome:kind,seed}=body;
  return new T.ShaderMaterial({uniforms:{ice:{value:kind==='gas'&&gasProfile(body).ice},kind:{value:['mediterranean','lava','gobi','gas','ashen','gelisol','sulfuria','aquatica','cyclonius','tropicana'].indexOf(kind)},phase:{value:(seed%971)*.029},sunward:{value:new T.Vector3()}},
    vertexShader:'varying vec3 p;varying vec3 n;varying vec3 w;void main(){p=position;n=mat3(modelMatrix)*normal;w=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 p;varying vec3 n;varying vec3 w;uniform vec3 sunward;uniform int kind;uniform bool ice;uniform float phase;
float field(vec3 q){return .50+.24*sin(q.x*2.7+cos(q.y*3.4)+q.z*2.2)+.15*sin(q.y*4.9+q.x+sin(q.z*8.7))+.09*cos(dot(q,vec3(9.1,5.3,6.7)));}
void main(){vec3 d=normalize(p);float f=field(d*2.+phase);vec3 col,glow=vec3(0.);
 if(kind==0){col=mix(vec3(.033,.22,.38),vec3(.25,.46,.23),smoothstep(.44,.49,f));col=mix(col,vec3(.76,.83,.85),smoothstep(.70,.86,field(d*3.8+phase+3.)));}
 else if(kind==1){float lava=1.-smoothstep(.012,.062,abs(f-.46));col=mix(vec3(.33,.17,.12),vec3(.75,.39,.15),f);glow=lava*vec3(.9,.22,.019);}
 else if(kind==2)col=mix(vec3(.40,.29,.18),vec3(.80,.70,.46),f);
 else if(kind==6){col=mix(vec3(.27,.27,.26),vec3(.57,.55,.47),f);col=mix(vec3(.31,.32,.13),col,smoothstep(.28,.32,f));}
 else if(kind==7){col=mix(vec3(.025,.15,.40),vec3(.082,.47,.61),smoothstep(.29,.73,f));col=mix(col,vec3(.42,.52,.44),smoothstep(.84,.87,f));}
 else if(kind==8){col=mix(vec3(.39,.19,.14),vec3(.76,.70,.59),smoothstep(.47,.65,f));}
 else if(kind==9){col=mix(vec3(.022,.21,.30),vec3(.065,.31,.13),smoothstep(.47,.52,f));col=mix(col,vec3(.54,.75,.72),smoothstep(.78,.88,field(d*4.2+phase)));}
 else if(kind==4||kind==5){col=mix(kind==4?vec3(.21,.31,.37):vec3(.10,.27,.49),vec3(.72,.84,.88),smoothstep(.23,.68,f));}
 else {float belt=.5+.5*sin(d.y*45.+2.8*f+sin(d.x*4.+d.z*3.));col=mix(ice?vec3(.07,.23,.35):vec3(.34,.22,.17),ice?vec3(.52,.76,.82):vec3(.82,.59,.38),belt*.74+f*.23);}
 vec3 normalDir=normalize(n);float light=dot(normalDir,normalize(sunward));float limb=pow(1.-max(0.,dot(normalDir,normalize(cameraPosition-w))),3.2);
 gl_FragColor=vec4(col*(.065+1.18*max(0.,light))+glow+limb*vec3(.27,.42,.50)*smoothstep(-.38,.42,light),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
}

/** 标注用普通按钮提供键盘入口。每帧只重定位已有元素，不反复创建纹理、监听器或 DOM 子树。 */
export class SystemView {
  constructor(renderer,background,yard){
    this.yard=yard;
    this.renderer=renderer;this.scene=new T.Scene();this.scene.background=new T.Color('#02050a');this.scene.add(background.clone());
    this.camera=new T.PerspectiveCamera(42,1,.012,1600);this.sun=makeSun();this.sun.group.scale.setScalar(unit*metersPerYardUnit);this.scene.add(this.sun.group);
    this.fleetGroup=new T.Group();this.scene.add(this.fleetGroup);this.freight=new CarrierView(this.fleetGroup,true);
    this.hub=new T.Group();this.scene.add(this.hub);this.bodies=new Map();this.orbits=new Map();this.labels=new Map();this.anchors=new Map();
    this.labelHost=document.getElementById('map-labels');this.geometry=new T.SphereGeometry(1,42,24);
    this.marker=new T.Mesh(new T.TorusGeometry(1,.025,6,60),new T.MeshBasicMaterial({color:'#efc887'}));this.scene.add(this.marker);
    this.trail=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineDashedMaterial({color:'#ffc179',dashSize:.18,gapSize:.14,transparent:true,opacity:.85}));
    this.trail.frustumCulled=false;this.scene.add(this.trail);
    this.propulsion=flightModel();this.craft=this.propulsion.craft;
    this.scene.add(this.craft,new T.HemisphereLight('#c7dcf1','#504236',1.52));
    this.deepSky=makeDeepSky();this.deepSky.visible=false;this.scene.add(this.deepSky);
    this.right=new T.Vector3();this.shipUp=new T.Vector3();this.basis=new T.Matrix4();
    this.chaseYaw=0;this.chasePitch=.30;this.chaseRange=.015;
    this.sight=new T.Vector3();this.sightRight=new T.Vector3();this.sightUp=new T.Vector3();this.desired=new T.Vector3();
    this.light=new T.PointLight('#ffecd4',45,0,.5);this.scene.add(this.light);
    this.projection=new T.Vector3();this.forward=new T.Vector3();this.ship=new T.Vector3();this.target=new T.Vector3();this.up=new T.Vector3(0,1,0);
    this.sky=background;this.center=new T.Vector3();this.remoteTarget=new T.Vector3();
    this.yaw=-.71;this.lat=.48;this.distance=54;
  }
  /** 准星使用独立的恒星坐标航向。接管或读档时从当前速度方向开始，转动镜头后松开 W 仍可观察侧面。 */
  sightFor(flight){
    if(this.helmFlight!==flight){
      this.helmFlight=flight;
      const [x,y,z]=flight.heading;
      this.lookYaw=Math.atan2(x,z);this.lookPitch=Math.asin(T.MathUtils.clamp(y,-1,1));
    }
    const yaw=this.lookYaw,pitch=this.lookPitch,flat=Math.cos(pitch);
    this.sight.set(Math.sin(yaw)*flat,Math.sin(pitch),Math.cos(yaw)*flat);
    this.sightRight.set(-Math.cos(yaw),0,Math.sin(yaw));
    this.sightUp.crossVectors(this.sightRight,this.sight);
  }
  /** 右键拖动只改变准星。限制俯仰到接近两极，避免下一次拖动突然倒转。 */
  turnSight(flight,dx,dy){
    this.sightFor(flight);
    this.lookYaw-=dx*.006;
    this.lookPitch=T.MathUtils.clamp(this.lookPitch-dy*.005,-Math.PI/2+.001,Math.PI/2-.001);
  }
  /** 每个固定步读取当前驾驶指令，只有方向键实际按住时才生成要写入存档的单位航向。 */
  pilotInput(flight,keys){
    const forward=keys.has('w');
    const side=Number(keys.has('d')||keys.has('r')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('q')||keys.has('arrowleft'));
    const lift=Number(keys.has(' ')||keys.has('arrowup'))-Number(keys.has('alt')||keys.has('arrowdown'));
    let aim;
    if(forward||side||lift){
      this.sightFor(flight);
      aim=this.desired.copy(this.sight).multiplyScalar(Number(forward)).addScaledVector(this.sightRight,side).addScaledVector(this.sightUp,lift).normalize().toArray();
    }
    return {aim,forward,boost:keys.has('shift'),brake:keys.has('s')};
  }
  reset(game,starId=activeStar(game).id){
    if(this.game===game&&this.starId===starId){
      if(this.labelHost.firstElementChild!==this.labels.values().next().value)this.labelHost.replaceChildren(...this.labels.values());
      return;
    }
    this.game=game;this.starId=starId;this.center.fromArray(centerMeters(starOf(game,starId)));
    this.hub.traverse(o=>{if(o.geometry&&o.geometry!==this.geometry)o.geometry.dispose();o.material?.dispose();});
    this.hub.clear();this.bodies.clear();this.orbits.clear();this.labels.clear();this.anchors.clear();this.labelHost.replaceChildren();
    for(const body of starSystem(game,this.starId)){
      const mesh=new T.Mesh(this.geometry,planetMaterial(body)),ring=orbitBand(body);
      mesh.scale.setScalar(viewSize[body.biome]);this.hub.add(mesh,ring);this.bodies.set(body.id,mesh);this.orbits.set(body.id,ring);
      const label=document.createElement('button');label.type='button';label.dataset.action='select-body';label.dataset.id=body.id;label.className='star-label';label.textContent=body.title;
      this.labelHost.append(label);this.labels.set(body.id,label);
    }
  }
  draw(game,ui){
    const canvas=this.renderer.domElement,w=canvas.clientWidth,h=canvas.clientHeight,flight=game.space.flight;
    const close=!!flight&&ui.followShip;
    if(ui.cluster&&!close){
      this.galaxy??=new ClusterView(this.renderer,this.sky);this.galaxy.draw(game,ui,this);this.galaxyMode=true;return;
    }
    this.galaxyMode=false;
    const destination=bodyOf(game,flight?.to);
    let starId=ui.chartStar||activeStar(game).id;
    // 手动离轨允许没有选中目标。在距离机甲最近的恒星旁建立渲染原点，保持近景几何精度。
    if(close)starId=pilotStar(game,flight.position).id;
    if(!flight?.heading)this.helmFlight=null;
    this.reset(game,starId);
    this.center.fromArray(centerMeters(starOf(game,starId)));
    this.deepSky.visible=close;this.camera.near=close?.0003:.012;
    const selection=bodyOf(game,ui.destination)||starSystem(game,this.starId)[0];
    this.sun.time.value=game.elapsed;
    // 跟随机甲跨星时只展示镜头所在恒星的实物，尚未开发的恒星没有工程账本。
    if(this.yard.parent!==this.scene)this.scene.add(this.yard);
    this.yard.scale.setScalar(unit*metersPerYardUnit);
    this.yard.update(sphereOf(game,starId),game.elapsed,starSystem(game,starId)[0],canvas.height);
    for(const body of starSystem(game,this.starId)){
      const mesh=this.bodies.get(body.id),band=this.orbits.get(body.id);
      mesh.position.fromArray(positionAt(game,body)).sub(this.center).multiplyScalar(unit);
      const spin=rotationOf(game,body);
      mesh.rotation.set(0,spin.phase+tau*(game.elapsed%spin.period)/spin.period,spin.tilt,'ZYX');
      const actualScale=close?(body.biome==='gas'?530:200)*unit:viewSize[body.biome];
      mesh.scale.setScalar(actualScale);
      mesh.material.uniforms.sunward.value.copy(mesh.position).negate().normalize();
      band.visible=!close;
      if(body.parent)band.position.fromArray(positionAt(game,bodyOf(game,body.parent))).sub(this.center).multiplyScalar(unit);
    }
    this.fleetGroup.visible=!close;if(!close)this.freight.draw(game,this.bodies);
    this.ship.fromArray(mechaPosition(game)).sub(this.center).multiplyScalar(unit);
    this.target.fromArray(positionAt(game,selection)).sub(this.center).multiplyScalar(unit);
    this.craft.visible=!!flight;this.trail.visible=!close&&selection.id!==game.space.current||!!flight&&!close;
    if(this.trail.visible){const attribute=this.trail.geometry.attributes.position;attribute.setXYZ(0,...this.ship.toArray());attribute.setXYZ(1,...this.target.toArray());attribute.needsUpdate=true;this.trail.computeLineDistances();}
    if(flight){
      if(flight.heading)this.forward.fromArray(flight.heading);
      else this.forward.fromArray(positionAt(game,destination)).sub(this.center).multiplyScalar(unit).sub(this.ship).normalize();
      this.craft.position.copy(this.ship);
      this.right.crossVectors(this.forward,this.up);
      // 正上方或正下方也有合法航向。近极点使用准星方位，保证机甲变换矩阵一直可逆。
      if(this.right.lengthSq()<1e-10){
        if(flight.heading){this.sightFor(flight);this.right.copy(this.sightRight);}else this.right.set(1,0,0);
      }
      this.right.normalize();this.shipUp.crossVectors(this.right,this.forward).normalize();
      this.craft.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right,this.forward,this.shipUp));
      this.propulsion.clock.value=game.elapsed;this.propulsion.thrust.value=Math.min(1,flight.speed/2000);
      this.craft.scale.setScalar(close?.0009:.16);}
    this.camera.clearViewOffset();this.camera.aspect=w/h;
    if(close&&flight.heading){
      this.sightFor(flight);
      this.camera.position.copy(this.ship).addScaledVector(this.sight,-this.chaseRange).addScaledVector(this.sightUp,this.chaseRange*.12);
      this.camera.up.copy(this.sightUp);this.camera.lookAt(this.projection.copy(this.camera.position).add(this.sight));
    }else if(close){
      const d=this.chaseRange, flat=Math.cos(this.chasePitch)*d;
      this.camera.position.copy(this.ship).addScaledVector(this.forward,-flat*Math.cos(this.chaseYaw))
        .addScaledVector(this.right,flat*Math.sin(this.chaseYaw)).addScaledVector(this.shipUp,d*Math.sin(this.chasePitch));
      // 追踪点略靠前，留出机甲上方的目标视野和下方尾焰空间。右键环绕观察不会改变自动航线。
      this.camera.up.copy(this.shipUp);this.camera.lookAt(this.projection.copy(this.ship).addScaledVector(this.forward,.0038).addScaledVector(this.shipUp,.00075));
    }else{
      const horizontal=w>700?w-Math.min(296,w*.30):w,vertical=w>700?h:h*.54;
      const distance=this.distance*Math.max(h/horizontal*1.15,h/vertical);
      this.camera.position.set(Math.sin(this.yaw)*Math.cos(this.lat)*distance,Math.sin(this.lat)*distance,Math.cos(this.yaw)*Math.cos(this.lat)*distance);
      this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);this.camera.rotateZ(-.20);this.camera.setViewOffset(w,h,(w-horizontal)/2,(h-vertical)/2,w,h);
    }
    this.deepSky.position.copy(this.camera.position);
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.marker.visible=!close;
    this.marker.position.copy(this.target);this.marker.quaternion.copy(this.camera.quaternion);this.marker.scale.copy(worldScale).multiplyScalar(viewSize[selection.biome]*1.6+.12);
    this.projectLabels(game,selection,w,h,close);this.renderer.render(this.scene,this.camera);
  }
  projectLabels(game,selection,w,h,close){
    this.anchors.clear();
    for(const body of starSystem(game,this.starId)){
      const label=this.labels.get(body.id),pos=this.projection.copy(this.bodies.get(body.id).position).project(this.camera);
      const x=(pos.x+1)*w*.5,y=(1-pos.y)*h*.5;
      label.hidden=close||pos.z>1||pos.z< -1||x<0||x>w||y<0||y>h;
      if(label.hidden)continue;
      this.anchors.set(body.id,[x,y]);const near=body.id==='giant';
      label.style.transform='translate('+Math.round(x+13)+'px,'+Math.round(y+(near?12:-24))+'px)';
      label.classList.toggle('selected',body===selection);label.classList.toggle('home',body.id===game.space.current&&!game.space.flight);
    }
  }
  pick(x,y){if(this.galaxyMode)return this.galaxy.pick(x,y);let distance=25,hit=null;for(const [id,[px,py]] of this.anchors){const d=Math.hypot(px-x,py-y);if(d<distance){distance=d;hit=id;}}return hit;}
}
