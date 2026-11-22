import * as T from 'three';
import {RADIUS,axis} from './world.js';
import {groundRadius} from './reform-terrain.js';
import {shieldMap,shieldStrength} from './planet-shield.js';
import {hiveHere} from './space-hive.js';

// 场壳与力场命中共用球面支撑力。WebGL 每帧只插值现有顶点，形状仅在建拆或支撑高度跨档后更新。
const height = lift => RADIUS + 1.9 + RADIUS * .255 * lift;
const vertex = `
  attribute float support; attribute float focus;
  varying float vSupport; varying float vFocus; varying vec3 vUp; varying vec3 vEye;
  void main(){
    vUp=normalize(position); vSupport=support; vFocus=focus;
    vEye=cameraPosition-position;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }`;
const fragment = `
  varying float vSupport; varying float vFocus; varying vec3 vUp; varying vec3 vEye;
  uniform float surfaceView; uniform float age; uniform float planetRadius;
  uniform vec3 hitUp; uniform vec3 sunDir;
  void main(){
    if(vSupport<0.)discard;
    vec3 up=normalize(vUp), sight=normalize(vEye);
    float depth=length(cross(cameraPosition,sight))-planetRadius;
    float horizon=smoothstep(-5.,1.25,depth);
    float shoulder=smoothstep(.14,.88,vFocus);
    float cap=smoothstep(.916,.938,vFocus);
    vec3 deep=mix(vec3(.010,.128,.340),vec3(.028,.19,.37),horizon);
    vec3 field=mix(deep,vec3(.015,.370,.380),shoulder*.74+.24*horizon);
    // 透过力场的日侧地平线只在掠过地面的视线上发亮，可在轨道上辨认实际行星边缘。
    float sunset=exp(-1.9*depth*depth)*smoothstep(.18,.85,dot(up,normalize(sunDir)));
    field=mix(field,vec3(.98,.47,.31),sunset*.70);
    field=mix(field,vec3(.47,.79,.62),cap);
    float angle=acos(clamp(dot(up,hitUp),-1.,1.));
    float pulse=(1.-smoothstep(.012,.055,abs(angle-.32*age)))*(1.-smoothstep(.05,1.6,age));
    float opacity=mix(.73,.90,shoulder)+cap*.08;
    gl_FragColor=vec4(mix(field,vec3(.87,1.,.91),pulse),mix(opacity,.032+.07*horizon+.04*cap,surfaceView)+pulse*.20);
  }`;

/** 行星共用一张可变曲面及一束线段。输入当前镜头、模拟时钟和战况，护盾消退时隐藏绘制并保留缓冲供下一次展开。 */
export class ShieldView extends T.Group {
  constructor(){
    super();
    const geometry=new T.SphereGeometry(1,96,56);
    this.directions=Float32Array.from(geometry.attributes.position.array);
    for(const attr of ['support','focus'])geometry.setAttribute(attr,new T.BufferAttribute(new Float32Array(geometry.attributes.position.count),1).setUsage(T.DynamicDrawUsage));
    geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    geometry.boundingSphere=new T.Sphere(new T.Vector3(),height(1));
    this.uniforms={planetRadius:{value:RADIUS},sunDir:{value:new T.Vector3()},surfaceView:{value:0},age:{value:4},hitUp:{value:new T.Vector3(0,1,0)}};
    const material=new T.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:T.FrontSide,toneMapped:false});
    this.shell=new T.Mesh(geometry,material);this.shell.renderOrder=3;this.add(this.shell);
    const rays=new T.BufferGeometry();
    rays.setAttribute('position',new T.BufferAttribute(new Float32Array(80*6),3).setUsage(T.DynamicDrawUsage));rays.setDrawRange(0,0);
    this.rays=new T.LineSegments(rays,new T.LineBasicMaterial({color:0x80f7f5,transparent:true,opacity:.65,depthWrite:false}));
    this.rays.frustumCulled=false;this.rays.renderOrder=4;this.add(this.rays);
  }
  reshape(planet,map){
    const mesh=this.shell.geometry,positions=mesh.attributes.position,support=mesh.attributes.support,focus=mesh.attributes.focus,up=[0,0,0],profile={lift:0,focus:0};
    for(let i=0;i<support.count;i++){
      for(let j=0;j<3;j++)up[j]=this.directions[3*i+j];
      const level=shieldStrength(map.sources,up,profile),radius=height(profile.lift);
      focus.setX(i,profile.focus);
      // 支撑恰为零的顶点写成负值，片元插值后边缘切开。极弱的真实护盾仍保留低空蓝膜。
      support.setX(i,level>0?level:-.002);positions.setXYZ(i,up[0]*radius,up[1]*radius,up[2]*radius);
    }
    positions.needsUpdate=true;support.needsUpdate=true;focus.needsUpdate=true;
    const lines=this.rays.geometry,ends=lines.attributes.position;let n=0;
    for(const source of map.sources){
      if(!source.band)continue;
      const {tile,up}=source,base=groundRadius(planet,tile.x,tile.y)+2.92;
      shieldStrength(map.sources,up,profile);const roof=height(profile.lift);
      for(const r of [base,roof])ends.setXYZ(n++,up[0]*r,up[1]*r,up[2]*r);
    }
    ends.needsUpdate=true;lines.setDrawRange(0,n);
  }
  draw(game,mode,now,sunDir){
    const planet=game.planet;
    if(!planet.shield||!['surface','orbit','sky'].includes(mode)){this.visible=false;return;}
    const map=shieldMap(planet);this.visible=map.sources.some(s=>s.band>0);
    if(!this.visible)return;
    // 充能密集时合并 200 ms 内的曲面更新。切换星球则立即换形，旧行星的场壳不能闪现在新地表。
    if(this.planet!==planet||this.revision!==map.revision&&now>=this.next){
      this.reshape(planet,map);this.planet=planet;this.revision=map.revision;this.next=now+.2;
    }
    this.uniforms.sunDir.value.copy(sunDir);
    const surface=mode==='surface';this.uniforms.surfaceView.value=Number(surface);
    this.shell.material.side=surface?T.DoubleSide:T.FrontSide;this.shell.material.forceSinglePass=true;
    const raid=hiveHere(game)?.raid;
    if(raid?.leg==='fire'&&raid.mark&&raid.body===game.space.current){
      this.uniforms.hitUp.value.fromArray(axis(raid.mark.x,raid.mark.y));this.uniforms.age.value=8-raid.left+game.space.fogNet.clock;
    }else this.uniforms.age.value=4;
  }
}
