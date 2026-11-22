import * as T from 'three';
import {RADIUS,rng} from './world.js';

let reliefAtlas;
function repeatNoise(lattice,period,u,v){
  const x=u*period,y=v*period,i=Math.floor(x),j=Math.floor(y);
  const smooth=n=>n*n*(3-2*n);
  const a=smooth(x-i),b=smooth(y-j),at=(p,q)=>lattice[((q%period)*period+p%period)];
  return T.MathUtils.lerp(T.MathUtils.lerp(at(i,j),at(i+1,j),a),T.MathUtils.lerp(at(i,j+1),at(i+1,j+1),a),b);
}
export function surfaceAtlas(){
  if(reliefAtlas)return reliefAtlas;
  const size=256,random=rng(81037),periods=[3,7,17,37,73];
  const fields=periods.map(scale=>Float32Array.from({length:scale*scale},random));
  const bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const sample=i=>repeatNoise(fields[i],periods[i],x/size,y/size);
    const soil=sample(0)*.57+sample(1)*.30+sample(2)*.13;
    const meadow=sample(1)*.48+sample(2)*.34+sample(3)*.18;
    const stone=sample(3)*.48+sample(4)*.32+random()*.20;
    const idx=4*(y*size+x);bytes[idx]=soil*255;bytes[idx+1]=meadow*255;bytes[idx+2]=stone*255;bytes[idx+3]=random()*255;
  }
  // 同一张小纹理同时储存土带、植被斑块、石粒与细砂。远景使用 mip 层，避免把地面细节渲染成闪点。
  reliefAtlas=new T.DataTexture(bytes,size,size,T.RGBAFormat);
  reliefAtlas.wrapS=reliefAtlas.wrapT=T.RepeatWrapping;
  reliefAtlas.magFilter=T.LinearFilter;reliefAtlas.minFilter=T.LinearMipmapLinearFilter;
  reliefAtlas.generateMipmaps=true;reliefAtlas.needsUpdate=true;
  return reliefAtlas;
}
const maps = {
  mediterranean:
    'float aridity=smoothstep(.43,.67,field.r+.28*(field.g-.5));'+
    'float clearing=smoothstep(.09,.25,vHeight)*(1.-smoothstep(32.,40.,abs(normalize(vStone).y)*45.));'+
    'vec3 meadow=mix(vec3(.74,.85,.54),vec3(1.12,1.16,.72),field.g);'+
    'vec3 ochre=vec3(.48,.364,.154)*(.77+.46*field.b);'+
    'diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*meadow,clearing);'+
    'diffuseColor.rgb=mix(diffuseColor.rgb,ochre,aridity*clearing*.82);'+
    'float water=1.-smoothstep(-.045,.04,vHeight);'+
    'float ripple=sin(vStone.x*11.+vStone.y*6.+vStone.z*8.+field.b*8.+groundClock*.82);'+
    'diffuseColor.rgb+=water*vec3(.016,.038,.034)*smoothstep(.80,.99,ripple)*field.g;',
  lava:
    // 海岸由连续海拔逐像素判定。微小地形扰动只修饰岸沿，仍与地热井使用的热区一致。
    `vec2 flowUv=vec2(dot(vStone,vec3(.090,.13,.056)),dot(vStone,vec3(-.073,.018,.12)));
    vec4 rock=texture2D(groundAtlas,flowUv+vec2(field.g*.10,field.r*.08));
    float level=vHeight+(field.b-.50)*.40+(rock.g-.50)*.26;
    float liquid=1.-smoothstep(-.04,.018,level);
    vec2 drift=vec2(.00065,-.00043)*mod(groundClock,6400.);
    float eddy=texture2D(groundAtlas,flowUv*.31+field.gr*.19+drift).g;
    float seam=abs(rock.g+field.r*.27+.08*sin(groundClock*.10+field.b*10.)-.645);
    float fissure=1.-smoothstep(.007,.042,seam);
    float scoria=smoothstep(.45,.59,rock.b+field.r*.12);
    float embers=fissure*exp(-max(0.,level)*5.8)*(.22+.78*scoria);
    vec3 basalt=mix(vec3(.013,.013,.016),vec3(.075,.038,.027),.37*field.r+.63*scoria);
    float heat=smoothstep(.30,.80,eddy+.20*(rock.g-.45))*(.54+.46*scoria);
    vec3 stream=mix(vec3(.60,.019,.001),vec3(2.5,.46,.018),heat);
    stream+=vec3(1.7,.88,.17)*smoothstep(.65,.94,heat+fissure*.22);
    diffuseColor.rgb=mix(basalt,vec3(.079,.019,.004),liquid);
    vec3 lavaLight=stream*liquid+vec3(.69,.082,.006)*embers*(1.-liquid);`,
  // 海拔决定液面和可建地面，细纹取自同一张带 mip 的纹理，轨道远景自动滤除细小波纹。
  sulfuria:
    `float pool=1.-smoothstep(-.035,.025,vHeight+(field.b-.5)*.065);
    float ash=smoothstep(.27,.73,field.r+.18*(field.g-.5));
    vec3 shelf=mix(vec3(.049,.048,.053),vec3(.27,.257,.236),ash);
    float crevice=1.-smoothstep(.002,.016,abs(field.g+.16*field.r-.55));
    shelf=mix(shelf,vec3(.34,.096,.040),crevice*ash*.56);
    float salt=exp(-abs(vHeight-.042)*12.)*(.38+.62*field.b);
    shelf=mix(shelf,vec3(.43,.406,.229),salt*.72);
    float wave=sin(dot(vStone,vec3(2.8,4.1,3.4))+field.r*14.+groundClock*.62);
    vec3 acid=mix(vec3(.106,.125,.037),vec3(.39,.38,.117),exp(min(0.,vHeight)*1.7));
    acid+=vec3(.035,.044,.011)*smoothstep(.70,.98,wave)*field.g;
    diffuseColor.rgb=mix(shelf,acid,pool);`,
  cyclonius:
    `float stratum=.5+.5*sin(vHeight*11.+field.r*7.+field.g*4.);
    vec3 rock=mix(vec3(.17,.071,.048),vec3(.41,.196,.122),field.g);
    float chalk=smoothstep(.50,.71,field.r+.09*stratum);
    diffuseColor.rgb=mix(rock,vec3(.60,.565,.49),chalk)*(.86+.21*stratum);`,
  aquatica:
    `float depth=exp(min(0.,vHeight)*1.34),shoal=.5+.5*sin(dot(vStone,vec3(2.9,.9,2.2))+field.r*12.+groundClock*.72);
    vec3 water=mix(vec3(.011,.099,.22),vec3(.06,.43,.48),depth);
    water+=vec3(.019,.050,.055)*depth*smoothstep(.75,1.,shoal);
    diffuseColor.rgb=mix(water,mix(vec3(.35,.39,.30),vec3(.54,.50,.33),field.g),smoothstep(-.035,.04,vHeight));`,
  tropicana:
    `vec3 canopy=mix(vec3(.038,.19,.094),vec3(.18,.37,.16),field.r);
    float reef=exp(min(0.,vHeight)*2.9);
    vec3 bay=mix(vec3(.009,.080,.16),vec3(.027,.39,.35),reef);
    diffuseColor.rgb=mix(bay,canopy,smoothstep(-.036,.066,vHeight));`,
  gobi:
    'float gravel=smoothstep(.37,.64,field.r+.16*(field.g-.5));'+
    'float wind=.5+.5*sin(vStone.x*3.4+vStone.z*2.3+field.g*19.);'+
    'diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.76,.69,.55),diffuseColor.rgb*vec3(1.10,1.04,.92),gravel);'+
    'diffuseColor.rgb*=.91+.17*wind;'
};
/** 由网格海拔和三面投影生成当地表面。同一材质响应地表光照和阴影，海洋与岩浆仍以模拟的海平面为界。 */
export function groundMaterial(biome){
  const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.91,metalness:.03});
  mat.userData.clock={value:0};
  mat.customProgramCacheKey=()=>biome;
  mat.onBeforeCompile=shader=>{
    shader.uniforms.groundAtlas={value:surfaceAtlas()};shader.uniforms.groundClock=mat.userData.clock;
    shader.vertexShader='attribute float geology; varying vec3 vStone; varying float vHeight;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\n vStone=position;vHeight=geology;');
    shader.fragmentShader='uniform sampler2D groundAtlas;uniform float groundClock; varying vec3 vStone; varying float vHeight;\n'+shader.fragmentShader
      .replace('#include <color_fragment>',[
        '#include <color_fragment>',
        'vec3 w=abs(normalize(vStone));w=w*w*w*w;w/=w.x+w.y+w.z;',
        'vec3 p=vStone*.034+vec3(.137,.322,.598);',
        'vec4 field=texture2D(groundAtlas,p.yz)*w.x+texture2D(groundAtlas,p.zx)*w.y+texture2D(groundAtlas,p.xy)*w.z;',
        maps[biome]||('float drift=smoothstep(.35,.66,field.g+field.r*.08);'+
          'float fracture=1.-smoothstep(.006,.055,abs(field.r+.20*field.g-.611));'+
          'diffuseColor.rgb*=mix(vec3(.65,.72,.81),vec3(1.20,1.22,1.23),drift);'+
          'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.06,.16,.24),fracture*'+(biome==='gelisol'?'.44':'.14')+');'),
        'diffuseColor.rgb*=.76+.37*field.b+.10*field.a;'
      ].join('\n'));
    // 岩浆自发光独立于日照与建筑投影，固态岩壳继续参与原有光照。
    if(biome==='lava') shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=lavaLight;');
  };
  return mat;
}
/** 熔岩星近地天空由地平线仰角和太阳方向着色。轨道视角直接隐藏，避免一层尘霾遮盖宇宙背景。 */
export function volcanicSky(){
  const material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{up:{value:new T.Vector3()},sun:{value:new T.Vector3()}},
    vertexShader:'varying vec3 ray; void main(){ray=position-cameraPosition;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 ray;uniform vec3 up; uniform vec3 sun;
      void main(){vec3 dir=normalize(ray);float alt=dot(dir,up);
        float glow=exp(-2.7*max(0.,alt+.24));float lit=pow(max(0.,dot(dir,sun))*.5+.5,3.);
        vec3 sky=mix(vec3(.066,.030,.051),vec3(.47,.105,.073),glow);
        sky+=vec3(.34,.11,.041)*glow*glow*(.23+.77*lit);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
      }`});
  const dome=new T.Mesh(new T.SphereGeometry(1000,24,12),material);
  dome.renderOrder=-10;dome.visible=false;return dome;
}
/** 使用球壳的光线路程确定地平线亮度。只画靠相机的表面，遮挡仍由行星和建筑深度决定。 */
export function atmosphere(){
  const mat=new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,uniforms:{bodyRadius:{value:RADIUS},hue:{value:new T.Color(.18,.69,.94)},sunDir:{value:new T.Vector3(1,1,1).normalize()}},
    vertexShader:'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:[
      'varying vec3 wp;uniform vec3 hue;uniform vec3 sunDir;uniform float bodyRadius;',
      'void main(){vec3 ray=normalize(wp-cameraPosition);float closest=length(cross(ray,cameraPosition));',
      'float daylight=.43+.57*smoothstep(-.4,.7,dot(normalize(wp),sunDir));float height=closest-bodyRadius;',
      'float inner=exp(min(0.,height)*.98);float outer=exp(-max(0.,height)*1.58)*(1.-smoothstep(1.0,2.45,height));',
      'float glow=(inner*outer*.34+.008)*daylight; gl_FragColor=vec4(mix(hue*.72,hue+.12,outer*inner),glow);}'
    ].join('\n')});
  const shell=new T.Mesh(new T.SphereGeometry(RADIUS+2.5,112,72),mat);shell.renderOrder=3;
  return shell;
}
