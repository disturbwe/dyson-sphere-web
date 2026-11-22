import * as T from 'three';
import {axis,RADIUS} from './world.js';
import {groundRadius} from './reform-terrain.js';
import {homeSystemOf} from './cluster.js';
import {litBeacon,visibleFrom,beamColor,markId,registeredMarks,signalIndex} from './beacons.js';
import {name} from './catalog.js';
import {icon} from './icons.js';

const budget=80, labelBudget=24, metre=RADIUS/200;
const up=new T.Vector3(0,1,0);
/** 聚焦环、断续刻线和三片旋叶共用一张透明纹理。不同信标只向实例缓冲写入颜色和姿态。 */
function reticleTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.translate(128,128);ctx.strokeStyle='white';ctx.fillStyle='white';
  const arc=(r,start,end,width)=>{ctx.lineWidth=width;ctx.beginPath();ctx.arc(0,0,r,start,end);ctx.stroke();};
  arc(117,0,Math.PI*2,2);arc(91,0,Math.PI*2,2);
  for(let i=0;i<60;i++){
    ctx.save();ctx.rotate(i*Math.PI/30);ctx.fillRect(i%5?-1:-2,-114,i%5?2:4,i%5?6:12);ctx.restore();
  }
  for(let i=0;i<3;i++){
    ctx.save();ctx.rotate(i*Math.PI*2/3);arc(80,.04,1.76,5);arc(71,.21,1.45,2);
    ctx.beginPath();ctx.moveTo(51,-12);ctx.bezierCurveTo(39,-45,-8,-48,-23,-27);
    ctx.bezierCurveTo(0,-32,23,-23,23,-4);ctx.lineTo(51,-12);ctx.fill();ctx.restore();
  }
  arc(19,0,Math.PI*2,3);arc(8,0,Math.PI*2,2);
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;return tex;
}
function instanceBatch(geometry,options){
  const mat=new T.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,...options});
  const mesh=new T.InstancedMesh(geometry,mat,budget);mesh.count=0;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);return mesh;
}
/** 光柱与投影合计两批。标签使用独立覆盖层，星图和地表复用池内按钮，几千座离线信标也不会生成对应 DOM。 */
export class BeaconView extends T.Group{
  constructor(host){
    super();this.host=host;this.labels=[];this.count=0;
    this.pole=instanceBatch(new T.CylinderGeometry(.63,1,1,7),{opacity:.76,blending:T.AdditiveBlending});
    this.target=instanceBatch(new T.PlaneGeometry(2,2),{map:reticleTexture(),opacity:.96,side:T.DoubleSide});
    this.add(this.pole,this.target);this.pole.renderOrder=2;this.target.renderOrder=3;
    this.worldUp=new T.Vector3();this.point=new T.Vector3();this.ndc=new T.Vector3();
    this.model=new T.Object3D();this.tint=new T.Color();this.next=0;
  }
  label(x,y,body,tile,color,rear=false){
    if(this.count>=labelBudget||tile.beacon.caption==='none')return;
    const b=tile.beacon,idx=this.count++;
    let node=this.labels[idx];
    if(!node){
      node=document.createElement('button');node.type='button';node.className='holo-label';node.dataset.action='mark-open';
      node.append(document.createElement('i'),document.createElement('span'),document.createElement('small'));this.host.append(node);this.labels[idx]=node;
    }
    const ref=markId(body,tile);node.dataset.id=ref;node.hidden=false;node.style.setProperty('--beam',color);
    node.classList.toggle('rear',rear);node.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';
    node.title=b.title;const thumb=node.firstChild;
    if(thumb.dataset.icon!==(b.icon||'')){thumb.dataset.icon=b.icon||'';thumb.innerHTML=b.icon?icon(b.icon):'◇';}
    const title=b.caption==='icon'?'':b.title;
    if(node.children[1].textContent!==title)node.children[1].textContent=title;
    const tasks=b.caption==='tasks'?b.body.split('\n').slice(0,3).join('\n').replace(/\[item:([\w-]+)\]/g,(_,id)=>name(id)).replace(/<\/?color(?:=#[a-f0-9]{6})?>/gi,''):'';
    if(node.lastChild.textContent!==tasks)node.lastChild.textContent=tasks;
  }
  finish(){for(let i=this.count;i<this.labels.length;i++)this.labels[i].hidden=true;}
  clearLabels(){this.host.hidden=true;this.next=0;this.mode='';}
  refresh(time,mode){
    if(this.mode===mode&&time<this.next)return false;
    this.mode=mode;this.next=time+.09;this.host.hidden=false;this.count=0;return true;
  }
  surface(game,camera,view,time,w,h){
    if(!this.refresh(time,view))return;
    const planet=game.planet,origin=this.worldUp,point=this.point,model=this.model;
    let n=0;
    for(const tile of signalIndex(planet).beacons){
      if(!litBeacon(tile))continue;
      origin.fromArray(axis(tile.x,tile.y));const b=tile.beacon,base=groundRadius(planet,tile.x,tile.y);
      const rear=origin.dot(camera.position)<base;
      if(rear&&b.scope==='sight')continue;
      const mast=b.height*metre,altitude=base+.98;
      point.copy(origin).multiplyScalar(altitude+mast);const pixel=this.ndc.copy(point).project(camera);
      if(pixel.z< -1||pixel.z>1||Math.abs(pixel.x)>1.05||Math.abs(pixel.y)>1.08)continue;
      const color=beamColor(planet,tile),radius=b.radius*metre;
      if(!rear&&n<budget){
        this.tint.set(color).multiplyScalar(.22+.78*tile.power);model.quaternion.setFromUnitVectors(up,origin);
        model.position.copy(origin).multiplyScalar(altitude+mast/2);model.scale.set(.045,mast,.045);model.updateMatrix();
        this.pole.setMatrixAt(n,model.matrix);this.pole.setColorAt(n,this.tint);
        model.position.copy(point);model.quaternion.copy(camera.quaternion);model.scale.setScalar(radius);model.updateMatrix();
        this.target.setMatrixAt(n,model.matrix);this.target.setColorAt(n,this.tint);n++;
      }
      const offset=rear?8:Math.max(8,radius/Math.max(1,camera.position.distanceTo(point))*h*1.25+4);
      this.label((pixel.x+1)*w/2+offset,(1-pixel.y)*h/2-9,game.space.current,tile,color,rear);
      if(n===budget&&this.count===labelBudget)break;
    }
    for(const batch of [this.target,this.pole]){batch.count=n;if(n){batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true;}}
    this.finish();
  }
  chart(game,ui,system,time){
    if(ui.followShip){this.clearLabels();return;}
    if(!this.refresh(time,ui.cluster?'cluster':'system'))return;
    const view=ui.cluster?'cluster':'system',anchors=(ui.cluster?system.galaxy:system)?.anchors,offsets=new Map();
    if(anchors)for(const {tile,planet,body} of registeredMarks(game)){
      if(!visibleFrom(game,body,tile,view)||tile.beacon.caption==='none')continue;
      const id=ui.cluster?homeSystemOf(body):body,p=anchors.get(id);if(!p)continue;
      const offset=offsets.get(id)||0;
      // 同一天体最多三条常显标记，更多内容可在星图的信标总控分页查询。
      if(offset>=3)continue;offsets.set(id,offset+1);
      this.label(p[0]+14,p[1]+27+offset*21,body,tile,beamColor(planet,tile));if(this.count===labelBudget)break;
    }
    this.finish();
  }
}
