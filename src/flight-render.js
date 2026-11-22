import * as T from 'three';
import {mechaModel} from './models.js';

/** 机甲、喷口与两根连续尾焰共用航向坐标系，局部 +Y 指向速度方向，+Z 是背甲。推进光随速度改变长度。 */
export function flightModel(){
  const craft=mechaModel(), clock={value:0},thrust={value:0};
  const nozzle=new T.CylinderGeometry(.135,.165,.29,16);
  const housing=new T.MeshStandardMaterial({color:'#4a5b66',metalness:.7,roughness:.32});
  const jet=new T.CylinderGeometry(.12,.42,1,24,9,true);
  // 整段气流只用一个透明表面，边界及尾部连续衰减。即使两束重叠也没有矩形光片或粒子排序跳动。
  const material=new T.ShaderMaterial({uniforms:{clock,thrust},side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`varying float age;varying vec3 wn;varying vec3 wp;uniform float thrust;
void main(){age=1.-uv.y;vec3 p=position;p.y=(p.y-.5)*(1.8+thrust*3.2);
 wp=(modelMatrix*vec4(p,1.)).xyz;wn=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:`varying float age;varying vec3 wn;varying vec3 wp;uniform float clock;
void main(){float facing=abs(dot(normalize(wn),normalize(cameraPosition-wp)));float fade=pow(1.-age,1.7)*(.09+.91*pow(facing,1.6));
 float shock=.88+.12*cos(29.*sqrt(age+.001)-clock*8.)*exp(-age*4.);
 vec3 color=mix(vec3(.12,.38,1.),vec3(.58,.84,1.),exp(-age*6.));
 gl_FragColor=vec4(color,fade*shock*.86);}`});
  const port=new T.CylinderGeometry(.115,.115,.05,16),hot=new T.MeshBasicMaterial({color:'#c5eeff'});
  const exhaust=new T.Group();craft.add(exhaust);
  for(const side of [-1,1]){
    const engine=new T.Mesh(nozzle,housing);engine.position.set(side*.245,.17,.12);craft.add(engine);
    const outlet=new T.Mesh(port,hot);outlet.position.set(side*.245,.018,.12);craft.add(outlet);
    const flame=new T.Mesh(jet,material);flame.position.set(side*.245,0,.12);flame.frustumCulled=false;exhaust.add(flame);
  }
  return {craft,clock,thrust,exhaust};
}
