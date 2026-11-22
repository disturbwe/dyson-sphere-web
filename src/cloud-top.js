import * as T from 'three';
import {RADIUS,axis} from './world.js';
import {gasProfile,moorings} from './gas.js';
import {surfaceAtlas} from './surface-material.js';

/** 一次绘制整颗巨星的云面。经向连续重复的小纹理在纬向急流和风暴涡旋中变形，时间只滚动纹理坐标。 */
export function cloudTop(planet){
  const geometry=new T.SphereGeometry(RADIUS-1.8,128,72),material=new T.MeshStandardMaterial({roughness:1});
  const ice=gasProfile(planet).ice;
  material.userData.clock={value:0};
  material.onBeforeCompile=shader=>{
    shader.uniforms.weather={value:surfaceAtlas()};shader.uniforms.cloudClock=material.userData.clock;
    shader.uniforms.phase={value:(planet.seed%233)/233};
    shader.uniforms.deep={value:new T.Color(ice?'#254969':'#6a4640')};
    shader.uniforms.middle={value:new T.Color(ice?'#5c99a9':'#c39571')};
    shader.uniforms.high={value:new T.Color(ice?'#c1dce1':'#ecddbb')};
    shader.vertexShader='varying vec2 cloudUv;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n cloudUv=uv;');
    shader.fragmentShader=[
      'varying vec2 cloudUv;uniform sampler2D weather; uniform float phase; uniform float cloudClock; uniform vec3 deep;uniform vec3 middle;uniform vec3 high;',
      // 经度折返后两端仍对应同一风眼。三个固定规模的采样层适合低分辨率模式和城市级工厂同时运行。
      'vec2 curlStorm(vec2 p,vec2 center,vec2 size,float spin){vec2 d=vec2(fract(p.x-center.x+.5)-.5,p.y-center.y)/size;float r=dot(d,d);float turn=spin*exp(-r*1.5);float c=cos(turn),s=sin(turn);return p+size*(mat2(c,s,-s,c)*d-d);}',
      shader.fragmentShader
    ].join('\n').replace('#include <color_fragment>',`#include <color_fragment>
      float time=mod(cloudClock,100000.);vec2 uv=cloudUv;
      uv.x+=time*.000009*(.43+.57*sin(uv.y*50.));
      vec2 p=curlStorm(uv,vec2(.258+.022*(phase-.5),.505),vec2(.060,.028),3.9);
      p=curlStorm(p,vec2(.58+.12*phase,.61),vec2(.083,.038),-3.1);
      vec4 broad=texture2D(weather,vec2(p.x*2.+phase,p.y*3.5));
      float bend=.012*(broad.r-.5)+.004*sin(p.x*31.4+broad.g*5.);
      vec2 jet=vec2(p.x*2.+.052*broad.g,(p.y+bend)*15.);
      vec4 whorl=texture2D(weather,jet+vec2(time*.000026,0.));
      vec4 fiber=texture2D(weather,jet*vec2(1.5,2.4)+whorl.rg*.22);
      float layer=.5+.5*sin((p.y+bend)*108.+4.2*whorl.g+fiber.r*.95);
      float sheet=smoothstep(.25,.79,.47*layer+.36*whorl.r+.17*fiber.g);
      diffuseColor.rgb=mix(deep,middle,smoothstep(.06,.73,.28*layer+.72*whorl.r));
      diffuseColor.rgb=mix(diffuseColor.rgb,high,sheet*(.53+.47*fiber.g));
      diffuseColor.rgb*=.76+.31*fiber.b+.16*broad.r;`);
  };
  const cloud=new T.Mesh(geometry,material);// 厚云层会散射轨道站投影；清晰的实体阴影会让云面看起来像硬质地板。
  cloud.receiveShadow=false;return cloud;
}

/** 建造时才显示赤道同步轨道和四十个可吸附站位。线段合并为一次绘制，与逻辑站位使用同一经度表。 */
export function mooringGuide(){
  const points=[];
  const add=(x,y,r)=>{const dir=axis(x,y);points.push(dir[0]*r,dir[1]*r,dir[2]*r);};
  for(let i=0;i<360;i++){add(i*.5,0,RADIUS+.09);add((i+1)*.5,0,RADIUS+.09);}
  for(const x of moorings){add(x,-.53,RADIUS+.09);add(x,.53,RADIUS+.09);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
  return new T.LineSegments(geo,new T.LineBasicMaterial({color:0x70dfa8,transparent:true,opacity:.62,depthWrite:false}));
}
