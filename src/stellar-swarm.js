import * as T from 'three';
import {orbitBasis} from './sphere.js';

const vertexShader=`uniform float clock;uniform float screenHeight;
attribute vec3 basisU;attribute vec3 basisV;attribute vec4 flight; varying float glint;varying vec2 track;varying vec3 tint;
void main(){
  float radius=flight.x;float t=flight.y+clock*.075/pow(radius,.85);
  vec3 n=normalize(cross(basisU,basisV));vec3 radial=basisU*cos(t)+basisV*sin(t);
  vec3 ahead=basisV*cos(t)-basisU*sin(t);vec3 world=radius*radial+n*flight.z;
  vec4 center=projectionMatrix*modelViewMatrix*vec4(world,1.);
  vec4 next=projectionMatrix*modelViewMatrix*vec4(world+ahead*.035,1.);
  track=normalize((next.xy/next.w-center.xy/center.w)*vec2(projectionMatrix[1][1]/projectionMatrix[0][0],1.)+vec2(.000001));
  vec3 viewDir=normalize(cameraPosition-(modelMatrix*vec4(world,1.)).xyz);
  float back=dot(normalize(mat3(modelMatrix)*radial),viewDir);glint=pow(max(0.,sin(t*3.+flight.w)),13.);
  tint=mix(vec3(.30,.65,.86),vec3(1.,.82,.45),(1.-smoothstep(-.65,.55,back)));
  gl_Position=center;gl_PointSize=clamp(screenHeight*(.037+.026*glint)*length(modelMatrix[0].xyz)/center.w,1.,12.);
}`;
const fragmentShader=`varying vec2 track;varying float glint;varying vec3 tint;
void main(){vec2 p=gl_PointCoord-.5;p.y=-p.y;
  vec2 q=vec2(dot(p,track),dot(p,vec2(-track.y,track.x)));
  float spot=exp(-(q.x*q.x*24.+q.y*q.y*175.));
  float bloom=exp(-dot(p,p)*17.)*.12;
  gl_FragColor=vec4(tint*(.83+.48*glint),(spot+bloom)*(.69+.30*glint));
}`;
function fraction(n){const t=Math.sin(n*12.9898+78.233)*43758.5453;return t-Math.floor(t);}
/** 以实物桶的半径和倾角为准分配采样上限。只在总量/轨道分配变化时更新缓冲，逐帧公转由 GPU 完成。 */
export function makeSwarm(cap=3600) {
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(cap*3),3));
  for(const [key,size] of [['basisU',3],['basisV',3],['flight',4]])geometry.setAttribute(key,new T.BufferAttribute(new Float32Array(cap*size),size).setUsage(T.DynamicDrawUsage));
  const uniforms={clock:{value:0},screenHeight:{value:720}};
  const material=new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  const points=new T.Points(geometry,material);points.frustumCulled=false;points.renderOrder=2;
  let lastSphere=null,revision=-1,signature='';
  function update(sphere,clock,height) {
    uniforms.clock.value=clock;uniforms.screenHeight.value=height;
    if(sphere===lastSphere && sphere.revision===revision)return;
    revision=sphere.revision;lastSphere=sphere;
    const groups=new Map();let total=0;
    for(const cohort of sphere.cohorts){
      const key=[cohort.radius,cohort.tilt,cohort.longitude].join('/');
      if(!groups.has(key))groups.set(key,{key,orbit:cohort,n:0});
      groups.get(key).n+=cohort.count;total+=cohort.count;
    }
    let raw=0,end=0;
    const entries=[...groups.values()].map(g=>{raw+=g.n;const start=end;end=Math.round(raw/total*Math.min(total,cap));return {...g,start,end};});
    const next=entries.map(g=>g.key+':'+(g.end-g.start)).join('|');
    if(next===signature)return;signature=next;
    for(const {orbit,start,end} of entries){
      const [u,v]=orbitBasis(orbit);const radius=orbit.radius/2700;
      for(let i=start;i<end;i++){
        const j=i-start,k=j+orbit.tilt*71+orbit.longitude;
        geometry.attributes.basisU.setXYZ(i,...u);geometry.attributes.basisV.setXYZ(i,...v);
        geometry.attributes.flight.setXYZW(i,radius*(1+.019*(fraction(k)-.5)),j*2.39996323+orbit.tilt,radius*.018*(fraction(k+.5)-.5),fraction(k+4.1)*6.28);
      }
    }
    for(const key of ['basisU','basisV','flight'])geometry.attributes[key].needsUpdate=true;
    geometry.setDrawRange(0,end);
  }
  geometry.setDrawRange(0,0);
  return {points,update};
}
