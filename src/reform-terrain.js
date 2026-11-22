import * as T from 'three';
import {ANGLE,RADIUS,WIDTH,axis,clamp,elevation,key} from './world.js';
import {groundHeight,pavingColors} from './reform.js';
import {groundMaterial} from './surface-material.js';
import {terrainSectors} from './surface-sectors.js';

export function groundRadius(p,x,y){return RADIUS+.64*Math.max(0,groundHeight(p,x,y));}

// 颜色表只在地块改变时上传。经纬线每格共用同一个材质，远处接缝随像素导数平滑淡出。
function pavementAtlas(planet,material){
  const height=91, bytes=new Uint8Array(WIDTH*height*4), colors=pavingColors.map(c=>c?new T.Color(c):null);
  const atlas=new T.DataTexture(bytes,WIDTH,height);atlas.wrapS=T.RepeatWrapping;atlas.magFilter=atlas.minFilter=T.NearestFilter;
  function update(cells){
    for(const k of cells){
      const [x,y]=k.split(',').map(Number),index=((y+45)*WIDTH+x+90)*4,color=colors[planet.reform.cells[k]];
      if(color){bytes[index]=Math.round(color.r*255);bytes[index+1]=Math.round(color.g*255);bytes[index+2]=Math.round(color.b*255);}
      bytes[index+3]=color?255:0;
    }
    atlas.needsUpdate=true;
  }
  update(Object.keys(planet.reform.cells));
  const compile=material.onBeforeCompile;
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);shader.uniforms.pavement={value:atlas};
    shader.fragmentShader='uniform sampler2D pavement;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      `vec3 directionOnGround=normalize(vStone);
      vec2 surfaceGrid=vec2(atan(directionOnGround.x,directionOnGround.z),asin(clamp(directionOnGround.y,-1.,1.)))*28.64788976;
      vec4 pavementSample=texture2D(pavement,(floor(surfaceGrid+.5)+vec2(90.5,45.5))/vec2(180.,91.));
      if(pavementSample.a>.5){
        vec2 plate=fract(surfaceGrid+.5),edge=min(plate,1.-plate);
        float joint=min(edge.x,edge.y),pixel=clamp(max(fwidth(surfaceGrid.x),fwidth(surfaceGrid.y)),.001,.18);
        float recess=1.-smoothstep(.007,.014+pixel,joint);
        float inset=(1.-smoothstep(.004,.008+pixel,abs(joint-.068)))*.36;
        float hatch=(1.-smoothstep(.13,.15+pixel,abs(plate.x-.50)))*(1.-smoothstep(.025,.035+pixel,abs(plate.y-.74)));
        float vent=hatch*(.52+.48*cos(plate.x*170.));
        float rivet=1.-smoothstep(.010,.016+pixel,length(edge-vec2(.108)));
        float detail=1.-smoothstep(.028,.14,pixel);
        float grain=.90+.12*field.b+.055*field.a;
        diffuseColor.rgb=pavementSample.rgb*grain*(1.-detail*(.50*recess+.30*inset+.26*vent+.29*rivet));
      }
      #include <roughnessmap_fragment>`);
    if(planet.biome==='lava')shader.fragmentShader=shader.fragmentShader.replace('totalEmissiveRadiance+=lavaLight;','totalEmissiveRadiance+=lavaLight*(1.-pavementSample.a);');
  };
  material.addEventListener('dispose',()=>atlas.dispose());return update;
}
function upload(attributes,indices){
  // 每一行连续区域组成一个缓冲区更新，改一小块海岸无需重传整颗星球的顶点。
  const ids=[...indices].sort((a,b)=>a-b);
  for(const attr of attributes){
    for(let i=0;i<ids.length;){let j=i+1;while(j<ids.length&&ids[j]===ids[j-1]+1)j++;
      attr.addUpdateRange(ids[i]*attr.itemSize,(j-i)*attr.itemSize);i=j;}
    if(ids.length)attr.needsUpdate=true;
  }
}
/** 创建可变形的球壳。保存原始高程和格点索引以便铺地时只重算附近顶点，颜色和海岸随实际工程同步。 */
export function deformableTerrain(planet,colorAt){
  const columns=360,rows=180,stride=columns+1;
  const geo=new T.SphereGeometry(1,columns,rows),position=geo.attributes.position;
  const unit=position.array.slice(),xs=new Float32Array(position.count),ys=xs.slice(),original=xs.slice(),rough=xs.slice();
  const heights=new T.BufferAttribute(new Float32Array(position.count),1),colors=new T.BufferAttribute(new Float32Array(position.count*3),3);
  const buckets=new Map(),unitVector=new T.Vector3();
  function adjust(i){
    const h=groundHeight(planet,xs[i],ys[i],original[i]),r=RADIUS+Math.max(0,h)*.64;
    position.setXYZ(i,unit[i*3]*r,unit[i*3+1]*r,unit[i*3+2]*r);
    heights.setX(i,h);colorAt(h,ys[i],rough[i],planet.biome).toArray(colors.array,i*3);
  }
  for(let i=0;i<position.count;i++){
    unitVector.fromBufferAttribute(position,i);
    xs[i]=Math.atan2(unitVector.x,unitVector.z)/ANGLE;ys[i]=Math.asin(clamp(unitVector.y,-1,1))/ANGLE;
    original[i]=elevation(xs[i],ys[i],planet.seed,planet.biome);
    rough[i]=.5+.5*Math.sin(unitVector.x*300+70*unitVector.z)*Math.cos(224*unitVector.z+70*unitVector.y);
    const cell=key(xs[i],ys[i]);if(!buckets.has(cell))buckets.set(cell,[]);buckets.get(cell).push(i);adjust(i);
  }
  geo.setAttribute('geology',heights);geo.setAttribute('color',colors);geo.computeVertexNormals();
  const normals=geo.attributes.normal,material=groundMaterial(planet.biome),updateAtlas=pavementAtlas(planet,material);
  const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;
  mesh.userData.cull=terrainSectors(geo,columns,rows);
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  mesh.userData.reshape=cells=>{
    updateAtlas(cells);const points=new Set(),affectedNormals=new Set();
    for(const cell of cells){const [x,y]=cell.split(',').map(Number);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const i of buckets.get(key(x+dx,y+dy))||[])points.add(i);}
    for(const i of points){adjust(i);affectedNormals.add(i);}
    // 受影响边缘的法线也需要刷新。球面接缝的两份顶点使用同一组跨经线邻点。
    for(const i of points){const row=Math.floor(i/stride),col=i%stride;
      affectedNormals.add(row*stride+(col+1)%columns);affectedNormals.add(row*stride+(col+columns-1)%columns);
      if(row>0)affectedNormals.add(i-stride);if(row<rows)affectedNormals.add(i+stride);}
    for(const i of affectedNormals){const row=Math.floor(i/stride),col=i%stride;if(row===0||row===rows)continue;
      a.fromBufferAttribute(position,row*stride+(col+1)%columns).sub(c.fromBufferAttribute(position,row*stride+(col+columns-1)%columns));
      b.fromBufferAttribute(position,i+stride).sub(c.fromBufferAttribute(position,i-stride));a.cross(b).normalize();
      if(a.dot(c.fromBufferAttribute(position,i))<0)a.negate();normals.setXYZ(i,a.x,a.y,a.z);}
    upload([position,heights,colors],points);upload([normals],affectedNormals);
  };
  return mesh;
}
