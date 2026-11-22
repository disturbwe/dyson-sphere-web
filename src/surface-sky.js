import * as T from 'three';
import {makeSun} from './stellar-light.js';
import {metersPerYardUnit} from './distant-yard.js';
import {RADIUS} from './world.js';

const dayColor={lava:0x88634e,sulfuria:0xaaa775,gobi:0x8ea7af,cyclonius:0x938a8c};
const tints=new Map(Object.entries(dayColor).map(([biome,value])=>[biome,new T.Color(value)]));
const blue=new T.Color('#518db9');

/** 从行星观察者的位置画恒星、壳层与大气。独立深度缓冲保持米制比例，随后地表的山、云和建筑自然遮挡天空。 */
export class SurfaceSky {
  constructor(backdrop,yard){
    this.scene=new T.Scene();this.scene.background=new T.Color('#050a12');
    this.camera=new T.PerspectiveCamera(44,1,.002,1800);
    this.sun=makeSun();this.yard=yard;
    this.stars=backdrop.clone();this.stars.material=backdrop.material.clone();
    this.stars.material.uniforms.transmission={value:1};
    this.stars.material.fragmentShader='uniform float transmission;'+this.stars.material.fragmentShader.replace('a*.87','a*.87*transmission');
    this.scene.add(this.sun.group,this.stars);
    this.rotation=new T.Quaternion();this.basis=new T.Matrix4();
    this.axes=[new T.Vector3(),new T.Vector3(),new T.Vector3()];this.up=new T.Vector3();this.view=new T.Vector3();
    const uniforms={upDir:{value:new T.Vector3()},sunDir:{value:new T.Vector3()},tint:{value:blue.clone()},density:{value:1}};
    this.atmosphere=new T.Mesh(new T.SphereGeometry(1100,64,32),new T.ShaderMaterial({uniforms,side:T.BackSide,depthWrite:false,depthTest:false,
      vertexShader:`varying vec3 sight;void main(){sight=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 sight;uniform vec3 upDir;uniform vec3 sunDir;uniform vec3 tint;uniform float density;
void main(){vec3 ray=normalize(sight);float alt=dot(ray,upDir),sunAlt=dot(upDir,sunDir);
  float day=smoothstep(-.23,.34,sunAlt),horizon=exp(-max(0.,alt)*4.8),towards=max(0.,dot(ray,sunDir));
  float dusk=exp(-abs(sunAlt+.025)*7.5)*(.17+.83*pow(towards,5.));
  vec3 zenith=mix(vec3(.002,.006,.018),tint*.53,day);
  vec3 rim=mix(vec3(.027,.055,.085),sqrt(tint)*1.17,day);
  rim=mix(rim,vec3(1.36,.42,.105),dusk*.82);
  vec3 col=mix(zenith,rim,horizon)+tint*.12*day*pow(towards,12.);
  float opacity=density*(.045+day*.929+dusk*.57*horizon);
  gl_FragColor=vec4(mix(vec3(.002,.004,.009),col,clamp(opacity,0.,.98)),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`}));
    // 大气先写底色，恒星与近侧钢架随后写深度。星点在最后按当地日高淡出，并接受实体遮挡。
    this.atmosphere.renderOrder=-2;this.scene.add(this.atmosphere);
  }
  /** 相机四角都被实心星球挡住时跳过整趟星空绘制，俯视密集工厂时完全沿用地表单趟开销。 */
  inSight(camera){
    const minRadius=RADIUS-4,range=camera.position.length();if(range<=minRadius)return false;
    const halfAngle=Math.atan(Math.tan(camera.fov*Math.PI/360)*Math.hypot(1,camera.aspect));
    const offNadir=this.view.copy(camera.position).negate().normalize().angleTo(camera.getWorldDirection(this.up));
    return offNadir+halfAngle>=Math.asin(minRadius/range);
  }
  draw(renderer,camera,game,body,primary,sky){
    const c=this.camera;
    for(let i=0;i<3;i++)this.axes[i].fromArray(sky.basis[i]);
    this.rotation.setFromRotationMatrix(this.basis.makeBasis(...this.axes));
    const metersPerUnit=(body.biome==='gas'?530:200)/RADIUS;
    // 离开地面也保留相机的观察高度和方位。减掉星团平移后再缩放，远端星系与母星精度相同。
    c.position.copy(camera.position).multiplyScalar(metersPerUnit).applyQuaternion(this.rotation);
    c.position.add(this.view.fromArray(sky.origin)).divideScalar(metersPerYardUnit);
    c.quaternion.copy(this.rotation).multiply(camera.quaternion);
    c.fov=camera.fov;c.aspect=camera.aspect;c.updateProjectionMatrix();
    this.stars.position.copy(c.position);this.atmosphere.position.copy(c.position);
    const u=this.atmosphere.material.uniforms;
    u.upDir.value.copy(camera.position).normalize().applyQuaternion(this.rotation);
    u.sunDir.value.fromArray(sky.origin).normalize().negate();
    this.stars.material.uniforms.transmission.value=1-.985*T.MathUtils.smoothstep(u.upDir.value.dot(u.sunDir.value),-.19,.25);
    u.tint.value.copy(tints.get(body.biome)??blue);u.density.value=body.biome==='gas'?1:.93;
    this.sun.time.value=game.elapsed;
    // 同一远景组从星图移回地表时保留几何缓存，只还原该镜头的比例。
    if(this.yard.parent!==this.scene)this.scene.add(this.yard);
    this.yard.scale.setScalar(1);this.yard.update(game.dyson,game.elapsed,primary,renderer.domElement.height);
    renderer.render(this.scene,c);
  }
}