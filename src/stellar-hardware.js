import * as T from 'three';
import {vectorAt} from './sphere.js';

const vertexShader = `attribute float part; attribute float stage; attribute float finishType;
attribute vec3 paint; varying vec3 pWorld; varying vec3 nWorld; varying vec3 base; varying vec2 panelUV;
varying float phase; varying float progress; varying float kind;
uniform sampler2D ledger; uniform vec2 atlas;
void main(){
  vec2 cell=vec2(mod(part,atlas.x),floor(part/atlas.x));
  vec4 stored=texture2D(ledger,(cell+.5)/atlas);
  progress=(stored.r*65280.+stored.g*255.)/65535.; phase=stage; kind=finishType;
  // 壳层旋转时镜向反射和日照仍在恒星空间计算，各层刚体都没有非均匀缩放。
  pWorld=(modelMatrix*vec4(position,1.)).xyz; nWorld=mat3(modelMatrix)*normal; base=paint; panelUV=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;
const fragmentShader = `varying vec3 pWorld; varying vec3 nWorld; varying vec3 base; varying vec2 panelUV;
varying float phase; varying float progress; varying float kind;
float seam(float u,float width){float d=abs(fract(u+.5)-.5);float aa=fwidth(u);return 1.-smoothstep(width,width+aa,d);}
void main(){
  if(progress<.000001||(kind<1.5 && progress<phase))discard;
  vec3 n=normalize(nWorld); if(!gl_FrontFacing)n=-n;
  vec3 toSun=-normalize(pWorld),eye=normalize(cameraPosition-pWorld);
  float sun=max(0.,dot(n,toSun));float grazing=pow(1.-abs(dot(n,eye)),3.);
  vec3 halfDir=normalize(toSun+eye);
  float glint=pow(max(0.,dot(n,halfDir)),24.);
  float sky=max(0.,dot(n,normalize(vec3(-.45,1.,.2))));
  vec3 metal=base*(.24+.24*sky)+vec3(1.,.64,.28)*base*(3.1*sun)+vec3(1.,.80,.45)*(glint*2.8)+grazing*vec3(.13,.20,.25);
  if(kind>1.5){
    vec2 u=panelUV; vec2 tile=floor(u);float variance=fract(sin(dot(tile,vec2(23.1,47.3)))*571.31);
    // 三角网格只确定曲率。按光伏子片覆盖连续前沿，避免施工一推进就跳出一整块大三角。
    vec2 subplate=floor(u*vec2(2.,3.));
    float localRank=fract(sin(dot(subplate,vec2(12.17,31.43)))*19453.17);
    if(progress<.99999 && phase+(localRank-.5)*.050>progress)discard;
    float rib=max(seam(u.x,.029),seam(u.y,.026));
    float trace=max(seam(u.x*4.,.028),seam(u.y*3.,.032));
    float mat=.78+.24*variance;
    vec3 outside=mix(vec3(.018,.040,.064),vec3(.056,.12,.16),variance)*mat;
    vec3 foil=mix(vec3(.42,.23,.095),vec3(.84,.59,.27),variance);
    vec3 tileColor=mix(outside,foil,sun)+grazing*vec3(.065,.095,.125)+trace*vec3(.013,.018,.023);
    vec3 bus=mix(vec3(.18,.17,.13),vec3(1.33,.84,.35),sun);
    metal=mix(tileColor,bus,rib)+vec3(1.1,.87,.45)*glint;
  }else if(kind>.5)metal=vec3(.22,2.15,2.9);
  gl_FragColor=vec4(metal,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const steel = [.28,.36,.42], brass = [.88,.52,.19], dark = [.09,.15,.19], light = [1,1,1];
const vector = node => new T.Vector3(...vectorAt(node.lon,node.lat));
const vec = (origin, ...terms) => terms.reduce((v,[dir,n])=>v.addScaledVector(dir,n),origin.clone());
const position = values => new T.Float32BufferAttribute(values,3);

/** 将整层的梁、节点和光伏板合成一次绘制。每个顶点保留所属构件与施工顺序，账本改变只上传小纹理。 */
class LayerMesh {
  constructor(compact){this.compact=compact;}
  xyz=[]; normals=[]; color=[]; tex=[]; part=[]; stage=[]; finish=[];
  triangle(a,b,c,paint,phase,kind=0,uv=null) {
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (const [i,p] of [a,b,c].entries()) {
      this.xyz.push(p.x,p.y,p.z);this.normals.push(normal.x,normal.y,normal.z);this.color.push(...paint);
      this.tex.push(...(uv?.[i]||[0,0]));this.part.push(this.index);this.stage.push(Array.isArray(phase)?phase[i]:phase);this.finish.push(kind);
    }
  }
  quad(a,b,c,d,paint,phase,kind=0) {
    this.triangle(a,b,c,paint,phase,kind);this.triangle(c,d,a,paint,phase,kind);
  }
  rod(a,b,width,paint,phase) {
    const axis=b.clone().sub(a).normalize();
    const cross=axis.clone().cross(a).normalize();
    if(cross.lengthSq()<.01)cross.set(1,0,0).cross(axis).normalize();
    const height=axis.clone().cross(cross);
    const ring=p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>vec(p,[cross,x*width],[height,y*width]));
    const start=ring(a),end=ring(b);
    for(let i=0;i<4;i++)this.quad(start[i],start[(i+1)%4],end[(i+1)%4],end[i],paint,phase);
  }
  /** 球面桁架用两根外弦、一根内弦和交叉斜撑围成三角截面。长弧分跨，观察内侧时能看见梁腹。 */
  frame(a,b,radius) {
    const angle=a.angleTo(b), sideways=a.clone().cross(b).normalize();
    const tangent=sideways.clone().cross(a), bays=Math.max(2,Math.ceil(angle/(this.compact?.15:.052)));
    function chord(t) {
      const out=a.clone().multiplyScalar(Math.cos(t*angle)).addScaledVector(tangent,Math.sin(t*angle));
      const center=out.clone().multiplyScalar(radius);
      return [vec(center,[sideways,radius*.0065]),vec(center,[sideways,-radius*.0065]),vec(center,[out,-radius*.014])];
    }
    let prev=chord(0);
    for(let i=1;i<=bays;i++) {
      const end=chord(i/bays),phase=(i-.5)/bays;
      // 星图或密集多层工程里单根箱梁仍保留曲率与施工前沿，省去在屏幕上不足一像素的腹杆。
      if(this.compact){this.rod(prev[0],end[0],radius*.005,brass,phase);prev=end;continue;}
      for(let j=0;j<3;j++)this.rod(prev[j],end[j],radius*(j===2?.0018:.0024),j===0?brass:steel,phase);
      this.rod(prev[i%2],end[2],radius*.0016,brass,phase);this.rod(prev[2],end[1-i%2],radius*.0016,steel,phase);
      this.rod(end[0],end[1],radius*.0017,dark,phase);prev=end;
    }
  }
  hub(normal,radius) {
    const tangent=new T.Vector3(0,1,0);if(Math.abs(normal.y)>.92)tangent.set(1,0,0);
    tangent.cross(normal).normalize();const side=normal.clone().cross(tangent);
    const center=normal.clone().multiplyScalar(radius), sides=this.compact?5:10;
    const ring=(h,r)=>Array.from({length:sides},(_,i)=>{const a=i*2*Math.PI/sides;return vec(center,[normal,h*radius],[tangent,Math.cos(a)*r*radius],[side,Math.sin(a)*r*radius]);});
    const profile=this.compact?[[-.012,.018],[.004,.029],[.021,.009]]:[[-.020,.014],[-.011,.026],[.003,.029],[.011,.023],[.013,.014],[.021,.012],[.023,.006]];
    const rings=profile.map(([h,r])=>ring(h,r));
    for(let i=0;i<sides;i++) {
      const j=(i+1)%sides;
      for(let k=1;k<rings.length;k++)this.quad(rings[k-1][i],rings[k-1][j],rings[k][j],rings[k][i],k===2||k===4?brass:steel,(k-.5)/8);
      this.triangle(rings.at(-1)[i],rings.at(-1)[j],vec(center,[normal,.024*radius]),light,.89,1);
    }
  }
  panel(records,radius) {
    const center=records.reduce((n,v)=>n.add(v),new T.Vector3()).normalize();
    const right=center.clone().cross(Math.abs(center.y)>.94?new T.Vector3(1,0,0):new T.Vector3(0,1,0)).normalize(),up=center.clone().cross(right);
    const ground=records.map(p=>new T.Vector2(p.dot(right)/p.dot(center),p.dot(up)/p.dot(center)));
    const cells=[];
    for(const [ia,ib,ic] of T.ShapeUtils.triangulateShape(ground,[])) {
      const a=records[ia],b=records[ib],c=records[ic];
      // 将单个多边形的细分预算均摊给三角扇，凹形长边界也能在分帧预算内逐件入场。
      const limit=Math.max(2,Math.floor(Math.sqrt((this.compact?120:2000)/Math.max(1,records.length-2))));
      const divisions=Math.min(limit,32,Math.max(3,Math.ceil(Math.max(a.angleTo(b),a.angleTo(c),b.angleTo(c))/(this.compact?.16:.042))));
      const at=(i,j)=>a.clone().multiplyScalar(1-(i+j)/divisions).addScaledVector(b,i/divisions).addScaledVector(c,j/divisions).normalize();
      function cell(p,q,r){
        // 统一外法线，否则同块凹壳面在两侧观察时会出现翻转的反光。
        if(q.clone().sub(p).cross(r.clone().sub(p)).dot(p)<0)[q,r]=[r,q];
        const n=p.clone().add(q).add(r).normalize();
        const distance=1-Math.max(...records.map(v=>v.dot(n)));
        const scatter=Math.sin(n.x*329.7+n.z*281.3+n.y*211.5)*.0036;
        cells.push({p,q,r,rank:distance+scatter});
      }
      for(let i=0;i<divisions;i++)for(let j=0;i+j<divisions;j++){
        cell(at(i,j),at(i+1,j),at(i,j+1));if(i+j+1<divisions)cell(at(i+1,j),at(i+1,j+1),at(i,j+1));
      }
    }
    // 从节点向内铺设，细胞点只控制已铺面积。按距离排序让施工中段留下连贯缺口。
    cells.sort((a,b)=>a.rank-b.rank);
    // 用面积采样的累计分布把距离换成建设百分比。共享顶点使用同一阈值，剪切边沿不会泄漏剖分方向。
    function phaseAt(v) {
      const rank=1-Math.max(...records.map(n=>v.dot(n)));
      let low=0,high=cells.length;
      while(low<high){const mid=(low+high)>>>1;if(cells[mid].rank<rank)low=mid+1;else high=mid;}
      return low/cells.length;
    }
    for(const {p,q,r} of cells){
      const points=[p,q,r],uv=points.map(v=>[v.dot(right)/v.dot(center)*36,v.dot(up)/v.dot(center)*27]);
      const phases=points.map(phaseAt),vertices=points.map(v=>v.clone().multiplyScalar(radius*.997));
      this.triangle(...vertices,steel,phases,2,uv);
    }
  }
  geometry(){
    const g=new T.BufferGeometry();g.setAttribute('position',position(this.xyz));g.setAttribute('normal',position(this.normals));g.setAttribute('paint',position(this.color));
    g.setAttribute('uv',new T.Float32BufferAttribute(this.tex,2));
    for(const [key,data] of [['part',this.part],['stage',this.stage],['finishType',this.finish]])g.setAttribute(key,new T.Float32BufferAttribute(data,1));
    return g;
  }
}

/** 从真实工程账本建立壳层网格。尚未付款的图元只出现在设计线中，首次收到材料才排入分帧构网队列。 */
export function buildHardware(layer,radius,compact=false) {
  const positions=new Map(layer.nodes.map(n=>[n.id,vector(n)]));
  const records=[...layer.nodes,...layer.edges,...layer.shells];
  const width=Math.max(1,Math.min(256,records.length)),height=Math.max(1,Math.ceil(records.length/width));
  const bytes=new Uint8Array(width*height*4),ledger=new T.DataTexture(bytes,width,height,T.RGBAFormat);
  const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{ledger:{value:ledger},atlas:{value:new T.Vector2(width,height)}},vertexShader,fragmentShader});
  const mesh=new T.Group(),chunkSize=24,chunks=[],pending=new Set();
  for(let start=0;start<records.length;start+=chunkSize)chunks.push({start,mask:0,body:null});
  function sync(){
    let changed=false;
    for(let i=0;i<records.length;i++){
      const record=records[i],built=record.built??record.cells;
      if(!built)continue;
      const chunk=chunks[Math.floor(i/chunkSize)],bit=1<<(i-chunk.start);
      if(!(chunk.mask&bit)){chunk.mask|=bit;pending.add(chunk);}
      const value=Math.max(1,Math.round(65535*built/record.required));
      if(bytes[i*4]===value>>8 && bytes[i*4+1]===(value&255))continue;
      bytes[i*4]=value>>8;bytes[i*4+1]=value&255;changed=true;
    }
    if(changed)ledger.needsUpdate=true;
  }
  let work=null;
  /** 多层共用绝对截止时刻。施工期间只重做新增图元所在的小块，块完工时才替换旧网格以免画面闪退。 */
  function pump(deadline){
    while((work||pending.size)&&performance.now()<deadline){
      if(!work){
        const chunk=pending.values().next().value;pending.delete(chunk);
        work={chunk,mask:chunk.mask,offset:0,shape:new LayerMesh(compact)};
      }
      const {chunk,mask,shape}=work,index=chunk.start+work.offset;
      if(mask&(1<<work.offset)){
        const part=records[index];shape.index=index;
        if('lon' in part)shape.hub(positions.get(part.id),radius);
        else if('borders' in part)shape.panel(part.nodes.map(id=>positions.get(id)),radius);
        else shape.frame(positions.get(part.a),positions.get(part.b),radius);
      }
      work.offset++;
      if(work.offset<chunkSize && index+1<records.length)continue;
      if(chunk.body){mesh.remove(chunk.body);chunk.body.geometry.dispose();}
      chunk.body=new T.Mesh(shape.geometry(),material);mesh.add(chunk.body);work=null;
    }
  }
  sync();return {mesh,sync,pump,dispose(){for(const part of mesh.children)part.geometry.dispose();mesh.clear();material.dispose();ledger.dispose();}};
}
