import * as T from 'three';

const noise = `float hash3(vec3 p){p=fract(p*vec3(.1031,.11369,.13787));p+=dot(p,p.yxz+19.19);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb(vec3 p){return noise3(p)*.54+noise3(p*2.07+5.9)*.27+noise3(p*4.19-8.7)*.13+noise3(p*8.33)*.06;}`;
const finish = `#include <tonemapping_fragment>
#include <colorspace_fragment>`;
const radius = .66;
/** 按观察距离呈现光球和外层日冕，光球写深度，日冕仅读深度，近侧钢梁能完整遮住亮斑。 */
export function makeSun() {
  const time = {value:0};
  const group = new T.Group();
  const surface = new T.Mesh(new T.SphereGeometry(radius,80,48), new T.ShaderMaterial({
    uniforms:{clock:time},
    vertexShader:`varying vec3 local; varying vec3 world;
void main(){local=normalize(position);world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`varying vec3 local; varying vec3 world; uniform float clock;
${noise}
void main(){
  vec3 p=normalize(local); float drift=clock*.007;
  p.xz=mat2(cos(drift),sin(drift),-sin(drift),cos(drift))*p.xz;
  vec3 warp=vec3(fb(p*4.+19.),fb(p*4.+7.),fb(p*4.));
  float surface=fb(p*17.+warp*4.3);
  float grain=fb(p*70.+warp*7.);
  float filament=pow(1.-abs(2.*noise3(p*31.+warp*8.)-1.),5.);
  float regionHeat=fb(p*3.5+warp*.9);
  float umbra=1.-smoothstep(.225,.32,regionHeat+.13*(surface-.5));
  float mu=clamp(dot(normalize(world),normalize(cameraPosition-world)),0.,1.);
  float heat=clamp(surface*.57+grain*.28+.22*filament+.21*mu-.74*umbra,0.,1.);
  vec3 color=mix(vec3(1.5,.18,.012),vec3(4.2,2.05,.45),smoothstep(.33,.78,heat));
  color+=vec3(2.4,1.38,.50)*max(0.,heat-.57)*3.;
  color*=mix(.47,1.,pow(mu,.44));
  gl_FragColor=vec4(color,1.);
  ${finish}
}`
  }));
  group.add(surface);
  // 用以恒星为中心的视向平面累积散射。旋转时光晕始终围绕日面，窄色球层与外冕各有不同衰减尺度。
  const corona = new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({
    uniforms:{clock:time, disk:{value:radius}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`uniform float disk; varying vec2 at;
void main(){at=position.xy*10.;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);center.xy+=at*disk*length(modelViewMatrix[0].xyz);gl_Position=projectionMatrix*center;}`,
    fragmentShader:`varying vec2 at;uniform float clock;
${noise}
void main(){
  float r=length(at), edge=max(r-1.,0.); vec2 dir=at/max(.001,r);
  if(r>10.)discard;
  float tuft=0.;
  // 远冕已没有肉眼可辨的细丝，只在紧贴日面的区域采样湍流噪声。
  if(edge<1.65){float plume=fb(vec3(dir*7.,r*.55+clock*.013));
    float threads=fb(vec3(dir*49.+plume*3.,r+clock*.018));
    tuft=exp(-edge*(8.5-3.4*plume))*(.4+.9*threads);}
  float inner=exp(-edge*1.8)*.22;
  float aerial=exp(-edge*.48)*.14;
  float streak=.022*exp(-abs(at.y)*36.)*exp(-abs(at.x)*.42);
  vec3 c=vec3(1.,.47,.105)*(tuft+inner)+vec3(.74,.34,.13)*aerial+vec3(.9,.48,.22)*streak;
  gl_FragColor=vec4(c*(1.-smoothstep(8.,10.,r)),1.);
}`
  }));
  corona.frustumCulled=false;corona.renderOrder=1;group.add(corona);
  return {group,time};
}

/** 尘带的频率远低于星点。在天球顶点采样再插值，避免让数百万背景像素逐帧重算十二次噪声。 */
export function makeDeepSky() {
  return new T.Mesh(new T.SphereGeometry(1300,120,64),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,
    vertexShader:`varying vec3 dustColor;
${noise}
void main(){
  vec3 p=normalize(position);float n=fb(p*5.7+2.1);
  float band=dot(p,normalize(vec3(.38,.90,-.23)))+.22*(n-.5);
  float cloud=exp(-9.*abs(band))*(.21+.79*fb(p*14.+n*3.));
  float dust=smoothstep(.40,.70,fb(p*18.2+.7));
  dustColor=mix(vec3(.012,.016,.026),vec3(.024,.032,.049),n);
  dustColor+=cloud*(1.-dust*.66)*mix(vec3(.135,.12,.107),vec3(.097,.13,.17),smoothstep(-.4,.6,p.y));
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`,
    fragmentShader:'varying vec3 dustColor;void main(){gl_FragColor=vec4(dustColor,1.);}'
  }));
}
