import * as T from 'three';
import {clusterOf,activeStar,starOf,spectra,LY,distanceLY} from './cluster.js';
import {mechaPosition} from './navigation.js';

function segments(points,color,opacity){
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
  return new T.LineSegments(geometry,new T.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
}
function starlight(stars){
  const p=[],c=[],s=[];
  for(const star of stars){
    p.push(...star.position);c.push(...new T.Color(spectra[star.kind][1]).toArray());
    s.push(star.kind==='giant'?1.8:star.kind==='hole'?.72:star.kind==='neutron'?.9:1+.24*Math.log2(1+star.luminosity));
  }
  const geometry=new T.BufferGeometry();
  for(const [key,arr,size] of [['position',p,3],['color',c,3],['weight',s,1]])geometry.setAttribute(key,new T.Float32BufferAttribute(arr,size));
  const material=new T.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{physical:{value:1}},vertexShader:
    'attribute float weight;uniform float physical;varying vec3 hue;void main(){hue=color;vec4 at=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(21.*weight*55./-at.z,15.,58.)*physical;gl_Position=projectionMatrix*at;}',
    fragmentShader:'varying vec3 hue;void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);if(r>1.)discard;float halo=exp(-5.7*r)*(1.-smoothstep(.72,1.,r));float disk=1.-smoothstep(.105,.185,r);vec3 c=hue*(halo+.83*disk)+mix(hue,vec3(1.),.49)*disk*.83;gl_FragColor=vec4(c,1.);}'
  });
  return new T.Points(geometry,material);
}
function chartPlate(){
  const p=[],rim=[],height=-3.6;
  for(let i=-20;i<=20;i+=2){p.push(i,height,-20,i,height,20,-20,height,i,20,height,i);}
  for(const [a,b] of [[[-20,-20],[20,-20]],[[20,-20],[20,20]],[[20,20],[-20,20]],[[-20,20],[-20,-20]]])rim.push(a[0],height,a[1],b[0],height,b[1]);
  const sheet=new T.Group();sheet.add(segments(p,'#7198a0',.115),segments(rim,'#a5cbd3',.47));return sheet;
}
/** 在光年坐标绘图。全部恒星共用一批点精灵，只给选中项和机甲驻地创建文字层，避免逐帧重建 64 个标签。 */
export class ClusterView{
  constructor(renderer,sky){
    this.renderer=renderer;this.scene=new T.Scene();this.scene.background=new T.Color('#030c12');this.scene.add(sky.clone(),chartPlate());
    this.camera=new T.PerspectiveCamera(39,1,.1,1500);this.v=new T.Vector3();this.anchors=new Map();
    this.ring=new T.Mesh(new T.RingGeometry(.84,1,64),new T.MeshBasicMaterial({color:'#ffd18d',side:T.DoubleSide,depthTest:false}));
    const triangle=new T.Shape();triangle.moveTo(0,.36);triangle.lineTo(-.19,-.18);triangle.lineTo(0,-.09);triangle.lineTo(.19,-.18);triangle.closePath();
    this.ship=new T.Mesh(new T.ShapeGeometry(triangle),new T.MeshBasicMaterial({color:'#a9fff5',side:T.DoubleSide,depthTest:false}));
    this.track=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineDashedMaterial({color:'#e5bc83',dashSize:.20,gapSize:.13,transparent:true,opacity:.8,depthTest:false}));
    this.ship.renderOrder=3;this.ring.renderOrder=2;this.track.frustumCulled=false;this.scene.add(this.ring,this.ship,this.track);
    this.host=document.getElementById('map-labels');
    this.labels=['selected','home'].map(cls=>{const e=document.createElement('button');e.type='button';e.className='star-label '+cls;e.dataset.action='select-star';return e;});
  }
  prepare(game){
    if(this.game===game)return;
    this.game=game;
    if(this.stars){this.scene.remove(this.stars,this.wires);for(const m of [this.stars,this.wires]){m.geometry.dispose();m.material.dispose();}}
    const {stars}=clusterOf(game);this.stars=starlight(stars);
    // 连接最近两颗邻星作为读图参照。航行仍依据实际距离直达，不受显示连线限制。
    const edges=[],seen=new Set();
    for(const star of stars){const nearest=stars.filter(s=>s!==star).sort((a,b)=>distanceLY(a,star)-distanceLY(b,star)).slice(0,2);
      for(const end of nearest){const k=[star.id,end.id].sort().join('/');if(seen.has(k))continue;seen.add(k);edges.push(...star.position,...end.position);}}
    this.wires=segments(edges,'#9aaeb0',.24);this.scene.add(this.wires,this.stars);
  }
  draw(game,ui,controls){
    this.prepare(game);if(this.labels[0].parentElement!==this.host)this.host.replaceChildren(...this.labels);
    const ship=mechaPosition(game).map(n=>n/LY),here=activeStar(game),dest=starOf(game,ui.chartStar)||here;
    const canvas=this.renderer.domElement,w=canvas.clientWidth,h=canvas.clientHeight,stage=w>700?w-Math.min(300,w*.3):w;
    const vertical=w>700?h:h*.55,dist=controls.distance*Math.max(h/stage*1.12,h/vertical);
    const view=this.camera;view.clearViewOffset();view.aspect=w/h;
    view.position.set(Math.sin(controls.yaw)*Math.cos(controls.lat)*dist,Math.sin(controls.lat)*dist,Math.cos(controls.yaw)*Math.cos(controls.lat)*dist);
    view.lookAt(0,0,0);view.setViewOffset(w,h,(w-stage)/2,(h-vertical)/2,w,h);view.updateProjectionMatrix();view.updateMatrixWorld();
    this.ring.position.fromArray(dest.position);this.ring.quaternion.copy(view.quaternion);this.ring.scale.setScalar(.36*dist/54);
    this.ship.position.fromArray(ship);this.ship.quaternion.copy(view.quaternion);this.ship.scale.setScalar(.90*dist/54);
    this.track.visible=dest!==here||!!game.space.flight;
    if(this.track.visible){const a=this.track.geometry.attributes.position;a.setXYZ(0,...ship);a.setXYZ(1,...dest.position);a.needsUpdate=true;this.track.computeLineDistances();}
    this.stars.material.uniforms.physical.value=this.renderer.getPixelRatio();this.anchors.clear();
    for(const star of clusterOf(game).stars){this.v.fromArray(star.position).project(view);if(this.v.z>1||this.v.z< -1)continue;
      const x=(1+this.v.x)*w*.5,y=(1-this.v.y)*h*.5;if(x>=0&&x<=w&&y>=0&&y<=h)this.anchors.set(star.id,[x,y]);}
    for(const [i,star] of [dest,here].entries()){
      const item=this.labels[i],p=this.anchors.get(star.id);item.hidden=!p||(i===1&&star===dest);if(item.hidden)continue;
      item.dataset.id=star.id;item.textContent=star.title+(i===0?'  ·  '+spectra[star.kind][0]:'');item.style.transform='translate('+Math.round(p[0]+12)+'px,'+Math.round(p[1]+4)+'px)';
    }
    this.renderer.render(this.scene,view);
  }
  pick(x,y){let nearest=20,hit=null;for(const [id,[u,v]] of this.anchors){const d=Math.hypot(u-x,v-y);if(d<nearest){nearest=d;hit=id;}}return hit;}
}
