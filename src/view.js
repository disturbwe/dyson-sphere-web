import * as T from 'three';
import {renderLift} from './surface-motion.js';
import {FrameBudget,scaleFor} from './frame-budget.js';
import {cloudTop,mooringGuide} from './cloud-top.js';
import {BeaconView} from './beacon-view.js';
import {signalIndex,registeredMarks} from './beacons.js';
import {DistantYard} from './distant-yard.js';
import {SurfaceSky} from './surface-sky.js';
import {SurfaceFrustum} from './surface-sectors.js';
import {bodyOf,starSystem} from './cluster.js';
import {skyAt,sunCosine} from './ephemeris.js';
import {SystemView} from './system-view.js';
import {axis,ANGLE,RADIUS,wrap,clamp,key,rng,surface,elevation,dirs,distance} from './world.js';
import {tint,oreColors,belts,sorters} from './catalog.js';
import {facility} from './models.js';
import {flightModel} from './flight-render.js';
import {FactoryView,factoryShape,beltLength} from './factory-view.js';
import {levelRise} from './belt-level.js';
import {BlueprintView} from './blueprint-view.js';
import {ReformView} from './reform-view.js';
import {ShieldView} from './shield-view.js';
import {FogView} from './fog-view.js';
import {deformableTerrain,groundRadius} from './reform-terrain.js';
import {takeGroundChanges} from './reform.js';
import {atmosphere,volcanicSky} from './surface-material.js';
import {availableSite} from './oil.js';
import {surfaceLife} from './surface-life.js';
import {CarrierView} from './carrier-view.js';
import {SphereView} from './sphere-view.js';
import {placeError,beltQuote,coverage} from './actions.js';

const vector=(x,y)=>new T.Vector3(...axis(x,y));
// 云顶建筑和机甲共用同步轨道半径。地表对象仍按游戏高度场贴地。
function pose(obj,x,y,planet,offset=0,cloud=false){
  const up=vector(x,y),east=new T.Vector3(Math.cos(x*ANGLE),0,-Math.sin(x*ANGLE)),south=east.clone().cross(up);
  obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(east,up,south));obj.position.copy(up).multiplyScalar((cloud?RADIUS:groundRadius(planet,x,y))+offset);
}
function colorAt(h,lat,rough,biome){
  const c=new T.Color();
  // 熔岩冷却、裂缝和流动带改为片元求值，网格只携带连续海拔。
  if(['lava','sulfuria','cyclonius','aquatica','tropicana'].includes(biome))return c.setRGB(1,1,1);
  // 两类冻土都无液态海洋。灰烬冻土裸岩偏铅蓝，冰原的风蚀脊更亮。
  if(biome==='ashen'||biome==='gelisol'){
    const frost=clamp(.51+h*.18+(rough-.5)*.24,0,1);
    return c.set(biome==='ashen'?'#4b6575':'#437aa1').lerp(new T.Color(biome==='ashen'?'#b2c8d2':'#d0e3eb'),frost);
  }
  if(biome==='gobi')return c.set('#a3916e').lerp(new T.Color('#d3bd83'),clamp(-h*.54+.39+rough*.17,0,1)).multiplyScalar(.88+rough*.16);
  if(h<0){c.set('#184766').lerp(new T.Color('#489c9e'),Math.exp(h*1.45));if(h>-.08)c.lerp(new T.Color('#8fcab9'),.4);}
  else if(h<.24)c.set('#c6b786').lerp(new T.Color('#91a779'),h/.24);
  else c.set('#789959').lerp(new T.Color('#477e60'),clamp((h-.24)/1.3,0,1)).lerp(new T.Color('#aa9e81'),clamp((h-1.0)/1.25,0,1));
  if(Math.abs(lat)>35)c.lerp(new T.Color('#d9e8dd'),clamp((Math.abs(lat)-35)/6+rough*.22,0,1));
  return c.multiplyScalar(.93+rough*.12);
}
function stars(){
  const rand=rng(718419),g=new T.BufferGeometry(),xyz=[],col=[],sizes=[];
  for(let i=0;i<4700;i++){
    let n;if(i<1900){const a=rand()*Math.PI*2, h=(rand()+rand()+rand()-1.5)*.20;n=new T.Vector3(Math.cos(a),h,Math.sin(a)).normalize().applyAxisAngle(new T.Vector3(0,0,1),-.43);}
    else n=vector(rand()*180-90,Math.asin(rand()*2-1)/ANGLE);
    n.multiplyScalar(700+rand()*130);xyz.push(...n.toArray());const color=new T.Color().setHSL(rand()>.25?.54+rand()*.12:.06+rand()*.08,.2+rand()*.3,.57+rand()*.38);col.push(...color.toArray());sizes.push(.65+Math.pow(rand(),4)*2.1);}
  g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setAttribute('s',new T.Float32BufferAttribute(sizes,1));
  return new T.Points(g,new T.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,vertexShader:'attribute float s;varying vec3 c;void main(){c=color;gl_PointSize=s;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 c;void main(){float a=1.-smoothstep(.10,.50,length(gl_PointCoord-.5));gl_FragColor=vec4(c,a*.87);}'}));
}
function orbitRing(radius,color,inclination,angle){const pts=[];for(let i=0;i<300;i++){const a=i*Math.PI*2/300;pts.push(new T.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}
  const l=new T.LineLoop(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color,transparent:true,opacity:.33}));l.rotation.set(inclination,0,angle);return l;
}
function disposeOwned(group){
  // 同种矿石和树的分区共享几何、材质，各自持有实例缓冲。每项只释放一次。
  const geometries=new Set(),materials=new Set();
  group.traverse(o=>{
    if(o.isInstancedMesh)o.dispose();
    if(o.geometry)geometries.add(o.geometry);
    if(o.material)materials.add(o.material);
  });
  for(const geo of geometries)geo.dispose();
  for(const mat of materials)mat.dispose();
}
export class WorldView{
  /** canvas 需要 WebGL2。窗口缩放只更新投影和像素缓冲，建造/存档始终以世界网格为准。 */
  constructor(canvas){
    this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});
    this.budget=new FrameBudget();this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.09;
    this.scene=new T.Scene();this.scene.background=new T.Color('#050c16');this.camera=new T.PerspectiveCamera(44,1,.10,1200);
    this.backdrop=stars();this.scene.add(this.backdrop);this.sun=new T.DirectionalLight('#fff0d0',2.45);this.ambient=new T.HemisphereLight('#c9e4ff','#8b8973',1.18);this.scene.add(this.sun,this.ambient);
    this.headlight=new T.PointLight('#ffdda3',0,14,1.5);this.scene.add(this.headlight);
    this.surfaceFrustum=new SurfaceFrustum();this.yard=new DistantYard();this.landBackground=this.scene.background;this.lightDir=new T.Vector3();
    this.haze=volcanicSky();this.air=atmosphere();this.scene.add(this.air,this.haze);this.orbits=new T.Group();this.orbits.add(orbitRing(70,'#adc5bc',.24,-.32),orbitRing(77,'#527f8a',.26,-.32));this.scene.add(this.orbits);
    // 阴影覆盖玩家身边的生产区，轨道和恒星视角跳过这张局部深度图。远处分区沿用地表光照。
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;
    this.scene.add(this.sun.target);this.sun.castShadow=true;
    const shadow=this.sun.shadow;Object.assign(shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:155});
    shadow.camera.updateProjectionMatrix();shadow.bias=-.00017;shadow.normalBias=.032;shadow.mapSize.set(768,768);
    this.thrusters=flightModel();this.bot=this.thrusters.craft;this.bot.traverse(o=>{if(o.isMesh&&!o.material.transparent)o.castShadow=true;});this.scene.add(this.bot);this.facilities=new T.Group();this.scene.add(this.facilities);
    this.paving=new ReformView();this.scene.add(this.paving);
    this.buildGrid=new T.Group();this.scene.add(this.buildGrid);this.factory=new FactoryView(this.facilities,(obj,x,y,seed,offset)=>pose(obj,x,y,this.s.planet,offset,this.s.planet.biome==='gas'));this.planning=new BlueprintView(this.scene,(obj,x,y,seed,offset,cloud)=>pose(obj,x,y,this.s.planet,offset,cloud));this.carriers=new CarrierView(this.scene);this.ray=new T.Raycaster();this.sphere=new T.Sphere(new T.Vector3(),RADIUS);
    this.select=new T.Mesh(new T.RingGeometry(.70,.79,40).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#8ef7d4',transparent:true,opacity:.93,depthWrite:false,side:T.DoubleSide}));this.scene.add(this.select);
    this.ghostMaterial=new T.MeshBasicMaterial({color:'#a2ffe7',wireframe:true,transparent:true,opacity:.55});this.yaw=0;this.pitch=.82;this.zoom=17;this.mapAngle=0;this.mapLat=8;this.mapZoom=145;this.revision=-1;
    this.gridMat=new T.LineBasicMaterial({color:'#c6f0cc',transparent:true,opacity:.28});
    this.resize();new ResizeObserver(()=>this.resize()).observe(canvas);
  }
  resize(){const w=this.canvas.clientWidth||1,h=this.canvas.clientHeight||1;const ratio=scaleFor(w,h,devicePixelRatio||1,this.budget.profile,this.budget.quality);
    this.renderer.setDrawingBufferSize(w,h,ratio);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.size=[w,h];}
  setState(s){
    if(this.land){this.scene.remove(this.land,this.decor);disposeOwned(this.land);disposeOwned(this.decor);}
    this.s=s;this.currentPlanet=s.planet;this.cloud=s.planet.biome==='gas';
    this.land=this.cloud?cloudTop(s.planet):deformableTerrain(s.planet,colorAt);
    this.decor=this.cloud?mooringGuide():surfaceLife(s.planet,(obj,x,y,seed,offset)=>pose(obj,x,y,s.planet,offset));
    this.surfaceRevision=s.planet.reform.revision;takeGroundChanges(s.planet);
    this.scene.add(this.land,this.decor);
    this.systemMap?.reset(s);this.stellar?.reset();this.revision=-1;this.gridKey='';this.gridSeed=null;this.cameraReady=false;this.syncStructures();
  }
  syncStructures(){
    this.factory.sync(this.s.planet);
    this.revision=this.s.planet.revision;
  }
  /** 在机甲头部高度观星。首次进入取恒星实际方位，右拖和变焦只改变摄影机。 */
  startSkyWatch(){
    const m=this.s.mecha,up=vector(m.x,m.y),east=new T.Vector3(Math.cos(m.x*ANGLE),0,-Math.sin(m.x*ANGLE));
    const south=east.clone().cross(up),sky=skyAt(this.s,bodyOf(this.s,this.s.space.current));
    const light=this.lightDir.fromArray(sky.sun);
    this.watchYaw=Math.atan2(light.dot(east),light.dot(south));
    this.watchPitch=clamp(Math.asin(clamp(light.dot(up),-1,1))*.62,.06,1.05);this.watchFov=59;
  }
  cameraFor(mode,time,dt){const s=this.s,c=this.camera,[w,h]=this.size; c.clearViewOffset();c.fov=mode==='sky'?this.watchFov:44;c.updateProjectionMatrix();
    const localSky=mode!=='menu'&&skyAt(s,bodyOf(s,s.space.current));
    if(mode==='menu'){
      const az=(time*.022+.68),dist=w/h<1.15?170:143;c.position.set(Math.sin(az)*dist,dist*.18,Math.cos(az)*dist);c.up.set(0,1,0);c.lookAt(0,0,0);
      c.setViewOffset(w,h,-w*(w/h<1.15?.09:.27),h*(w/h<1.15?.24:0),w,h);this.sun.position.set(95,68,6);this.cameraReady=false;
    }else if(mode==='orbit'){
      c.position.copy(vector(this.mapAngle,this.mapLat)).multiplyScalar(this.mapZoom);c.up.set(0,1,0);c.lookAt(0,0,0);this.cameraReady=false;
    }else{
      const m=s.mecha,up=vector(m.x,m.y),east=new T.Vector3(Math.cos(m.x*ANGLE),0,-Math.sin(m.x*ANGLE)),south=east.clone().cross(up);
      const target=up.clone().multiplyScalar((this.cloud?RADIUS:groundRadius(s.planet,m.x,m.y))+.42+renderLift(m)),horizontal=south.clone().multiplyScalar(Math.cos(this.yaw)).addScaledVector(east,Math.sin(this.yaw));
      const desired=target.clone().addScaledVector(up,this.zoom*Math.sin(this.pitch)).addScaledVector(horizontal,this.zoom*Math.cos(this.pitch));
      c.up.copy(up);
      if(mode==='sky'){
        c.position.copy(target).addScaledVector(up,2.5);
        const sight=south.multiplyScalar(Math.cos(this.watchYaw)).addScaledVector(east,Math.sin(this.watchYaw));
        sight.multiplyScalar(Math.cos(this.watchPitch)).addScaledVector(up,Math.sin(this.watchPitch));
        c.lookAt(sight.add(c.position));this.cameraReady=false;
      }else{
        if(!this.cameraReady)c.position.copy(desired);else c.position.lerp(desired,1-Math.exp(-dt*14));
        c.lookAt(target);this.cameraReady=true;
      }
      this.sun.target.position.copy(target);
      this.headlight.position.copy(target).addScaledVector(up,2.65);
    }
    const surfaceMode=mode==='surface'||mode==='sky';
    if(!surfaceMode)this.sun.target.position.set(0,0,0);
    let daylight=1;
    if(localSky){
      this.lightDir.fromArray(localSky.sun);
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.lightDir,100);
      this.solarAltitude=Math.asin(clamp(sunCosine(s.mecha,localSky),-1,1))*180/Math.PI;
      const incidence=c.position.clone().normalize().dot(this.lightDir);
      daylight=T.MathUtils.smoothstep(incidence,-.15,.28);
      this.sun.color.set(incidence>0&&incidence<.22?'#ffd39a':'#fff0d0');
    }else this.sun.color.set('#fff0d0');
    this.ambient.intensity=mode==='orbit'?.52:.40+.78*daylight;
    this.headlight.intensity=surfaceMode?(1-daylight)*4.2:0;
    this.sun.castShadow=surfaceMode&&daylight>.03;this.air.material.uniforms.sunDir.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
    // 云层低于同步轨道，气辉壳也要跟随云顶半径，否则会露出一圈悬空的蓝边。
    const airRadius=this.cloud?(RADIUS-1.8)/RADIUS:1;
    this.air.scale.setScalar(airRadius);this.air.material.uniforms.bodyRadius.value=this.cloud?RADIUS-1.8:RADIUS;
    this.haze.visible=surfaceMode&&s.planet.biome==='lava';
    if(this.haze.visible){this.haze.material.uniforms.up.value.copy(this.sun.target.position).normalize();this.haze.material.uniforms.sun.value.copy(this.air.material.uniforms.sunDir.value);}
    this.air.material.uniforms.hue.value.set(({lava:0xcf775c,gobi:0xaac4b0,sulfuria:0xc6ae75,cyclonius:0xd2a698,tropicana:0x6ab9d1})[this.s.planet.biome]??0x6edcf3);
    // 静态地形在建造修改时立即重绘阴影；其余时间只以 6 Hz 更新近景风机与机甲的投影。
    if(surfaceMode&&(this.shadowStamp!==this.revision||time>=(this.shadowNext||0))){this.renderer.shadowMap.needsUpdate=true;this.shadowNext=time+1/6;this.shadowStamp=this.revision;}
    c.updateMatrixWorld();this.orbits.visible=mode==='menu';
  }
  pick(clientX,clientY,level=0,raised=false){const rect=this.canvas.getBoundingClientRect();this.ray.setFromCamera({x:(clientX-rect.left)/rect.width*2-1,y:1-(clientY-rect.top)/rect.height*2},this.camera);
    // 对有起伏的球面迭代求交，避免拖到山坡时投影点落到山脚；经线两端归一到同一格。
    const point=new T.Vector3();this.sphere.radius=RADIUS+1.7+level*levelRise;let x=0,y=0;
    for(let i=0;i<4;i++){if(!this.ray.ray.intersectSphere(this.sphere,point))return null;point.normalize();x=Math.atan2(point.x,point.z)/ANGLE;y=Math.asin(clamp(point.y,-1,1))/ANGLE;this.sphere.radius=(this.cloud?RADIUS:groundRadius(this.s.planet,x,y))+level*levelRise;}
    if(raised){
      const ceiling=point.clone().multiplyScalar(this.sphere.radius).distanceTo(this.camera.position)+.08;
      const t=this.factory.pickRaised(this.ray.ray,ceiling);if(t)return {x:t.x,y:t.y,h:t.h,realX:t.x,realY:t.y};
    }
    return {x:wrap(Math.round(x)),y:Math.round(y),realX:x,realY:y,...(level?{h:level}:{})};
  }
  veinAt(p){if(!p)return -1;let best=.93,index=-1;this.s.planet.veins.forEach((v,i)=>{if(!availableSite(v))return;const d=distance({x:p.realX??p.x,y:p.realY??p.y},v);if(d<best){best=d;index=i;}});return index;}
  gridAt(m,show){this.buildGrid.visible=!!show;if(!show)return;const cx=Math.round(m.x),cy=Math.round(m.y),k=key(cx,cy);if(k===this.gridKey&&this.gridSeed===this.s.planet.seed)return;this.gridKey=k;this.gridSeed=this.s.planet.seed;
    for(const old of this.buildGrid.children)old.geometry.dispose();this.buildGrid.clear();const arr=[];
    const point=(x,y)=>vector(x,y).multiplyScalar(groundRadius(this.s.planet,x,y)+.052);
    for(let dx=-11;dx<=11;dx++)for(let dy=-11;dy<=11;dy++){if(dx*dx+dy*dy>132)continue;const x=cx+dx-.5,y=cy+dy-.5;arr.push(point(x,y),point(x+1,y),point(x,y),point(x,y+1));}
    this.buildGrid.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(arr),this.gridMat));
  }
  preview(ui){const p=ui.hover,mode=ui.tool;this.select.visible=!!p&&ui.view==='surface'&&ui.panel!=='reform';this.gridAt(this.s.mecha,!this.cloud&&(mode||ui.panel==='blueprint'||ui.panel==='reform')&&ui.view==='surface');
    if(this.cloud)this.decor.visible=mode==='orbital-collector'||ui.panel==='survey';
    if(!this.select.visible){if(this.ghost)this.ghost.visible=false;return;}
    pose(this.select,p.x,p.y,this.s.planet,.085+levelRise*(p.h||0),this.cloud);
    const sig=[mode,ui.dir,p.x,p.y,p.h,ui.start?.x,ui.start?.y,ui.start?.h,ui.vertical,this.s.planet.revision,this.s.planet.construction?.revision,this.s.bag[mode]].join('|');
    if(sig===this.ghostKey&&this.ghost){this.ghost.visible=true;return;}this.ghostKey=sig;
    if(this.ghost)this.scene.remove(this.ghost);this.ghost=new T.Group();this.scene.add(this.ghost);
    if(!mode||mode==='remove'||sorters.includes(mode)){this.select.material.color.set(mode==='remove'?'#ff926f':'#9bffe1');return;}
    const quote=ui.start&&belts.includes(mode)?beltQuote(this.s,mode,ui.start,p,ui.vertical,ui.dir):null;
    const path=quote?.path||[{...p,dir:ui.dir}];
    const error=quote?quote.error:placeError(this.s,mode,p,ui.dir);
    const color=error?'#ff926f':'#9bffe1';this.select.material.color.set(color);this.ghostMaterial.color.set(color);
    for(const node of path.slice(0,50)){
      const tile={...node,type:mode},obj=facility(factoryShape(tile));obj.traverse(o=>{if(o.isMesh)o.material=this.ghostMaterial;});
      const lift=mode==='logistics-distributor'?1.16*(this.s.planet.tiles[key(node.x,node.y)]?.layers||1):.09+levelRise*(node.h||0);
      pose(obj,node.x,node.y,this.s.planet,lift,this.cloud);obj.rotateY((node.dir??ui.dir)*Math.PI/2);
      if(belts.includes(mode))obj.scale.x=beltLength(tile);this.ghost.add(obj);
    }
    if(mode.includes('mining-machine')){for(const i of coverage(this.s,p,ui.dir,mode)){const v=this.s.planet.veins[i],ring=this.select.clone();pose(ring,v.x,v.y,this.s.planet,.10);ring.scale.setScalar(.62);this.ghost.add(ring);}}
  }
  prepareBeacons(){
    // 首座信标建成后才分配发射纹理和实例池，普通开局保持原有显存用量。
    this.beaconView=new BeaconView(document.getElementById('beacon-labels'));this.scene.add(this.beaconView);
  }
  draw(ui,time,dt){
    // 星体编辑器按需创建，返回地表继续使用同一个 WebGL 上下文和固定步长模拟。
    if(this.currentPlanet!==this.s.planet)this.setState(this.s);
    if(ui.view==='systemMap'){
      this.systemMap??=new SystemView(this.renderer,this.backdrop,this.yard);
      this.systemMap.draw(this.s,ui);
      if(!this.beaconView&&registeredMarks(this.s).next().value)this.prepareBeacons();
      this.beaconView?.chart(this.s,ui,this.systemMap,time);return;
    }
    if(ui.view==='sphere') {
      this.beaconView?.clearLabels();
      this.stellar??=new SphereView(this.renderer,this.backdrop);
      this.stellar.draw(this.s,ui);return;
    }
    const planet=this.s.planet;
    if(this.surfaceRevision!==planet.reform.revision){
      const cells=takeGroundChanges(planet);this.land.userData.reshape?.(cells);this.decor.userData.reshape?.(cells);
      this.factory.reshape(cells);this.surfaceRevision=planet.reform.revision;this.gridKey='';this.shadowStamp=-1;
    }
    if(this.revision!==planet.revision)this.syncStructures();this.cameraFor(ui.view,time,dt);
    if(!this.cloud){
      this.surfaceFrustum.update(this.camera);
      this.land.userData.cull(this.surfaceFrustum);
      this.decor.userData.cull(this.surfaceFrustum);
    }
    const s=this.s,m=s.mecha;this.bot.visible=ui.view!=='sky';pose(this.bot,m.x,m.y,s.planet,.03+renderLift(m),this.cloud);this.bot.rotateY(-(m.heading||0));this.bot.userData.body.rotation.z=m.mining!==null||m.timber!==null?Math.sin(time*8)*.065:0;
    // 腾空时屈膝收腿，地面步幅只随步行变化；失能下落仍沿用同一高度，机甲不会瞬移。
    const stride=!m.flying&&!m.lift&&(m.target||ui.walking)?Math.sin(time*11)*.32:0;
    const tuck=m.flying?.22:m.lift?Math.min(.42,m.lift.height*.16):0;
    this.bot.userData.legL.rotation.x=tuck+stride;this.bot.userData.legR.rotation.x=tuck-stride;
    this.decor.userData.syncCuts?.();
    this.thrusters.exhaust.visible=m.flying;this.thrusters.clock.value=time;this.thrusters.thrust.value=ui.walking?.25:0;
    this.land.material.userData.clock.value=time;this.carriers.draw(s);
    if(planet.fog&&ui.view!=='menu'&&!this.battlefield){
      this.battlefield=new FogView(pose);this.scene.add(this.battlefield);
    }
    this.battlefield?.draw(s,ui.view);
    if(planet.shield&&!this.forceField&&ui.view!=='menu'){this.forceField=new ShieldView();this.scene.add(this.forceField);}
    this.forceField?.draw(s,ui.view,time,this.air.material.uniforms.sunDir.value);
    if(ui.view==='menu'){if(this.beaconView){this.beaconView.visible=false;this.beaconView.clearLabels();}}
    else{
      if(!this.beaconView&&signalIndex(planet).beacons.length)this.prepareBeacons();
      if(this.beaconView){this.beaconView.visible=true;this.beaconView.surface(s,this.camera,ui.view,time,...this.size);}
    }
    this.factory.draw(this.camera,time,this.air.material.uniforms.sunDir.value);
    this.planning.draw(s,ui);this.paving.draw(s,ui);this.preview(ui);
    let drewSky=false;
    if(ui.view!=='menu'){
      this.skyScene??=new SurfaceSky(this.backdrop,this.yard);
      if(this.skyScene.inSight(this.camera)){
        const body=bodyOf(s,s.space.current);
        this.skyScene.draw(this.renderer,this.camera,s,body,starSystem(s)[0],skyAt(s,body));
        this.renderer.clearDepth();drewSky=true;
      }
    }
    // 天空和行星的距离比例相差数百倍。保留天空颜色、重置深度再渲染地表，工厂和山体会正确挡住恒星。
    this.backdrop.visible=ui.view==='menu';this.scene.background=drewSky?null:this.landBackground;
    this.renderer.autoClear=!drewSky;this.renderer.render(this.scene,this.camera);this.renderer.autoClear=true;
  }
}