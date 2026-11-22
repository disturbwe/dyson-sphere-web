import * as T from 'three';
import {axis} from './world.js';
import {groundRadius} from './reform-terrain.js';
import {brushQuote} from './reform-panel.js';

/** 保留一个笔刷网格与一组线。最大笔刷 10×10，每格取四个角和中心来贴合倾斜的岸边。 */
export class ReformView extends T.Group {
  constructor(){
    super();
    this.paint=this.overlay(1200,true);
    this.lines=this.overlay(800,false);
    this.add(this.paint,this.lines);
    this.visible=false;
  }
  overlay(capacity,fill){
    const geometry=new T.BufferGeometry();
    const positions=new T.BufferAttribute(new Float32Array(capacity*3),3).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('position',positions);
    geometry.setDrawRange(0,0);
    const style={color:0x8dffe0,transparent:true,opacity:fill?.15:.85,depthWrite:false};
    const object=fill?new T.Mesh(geometry,new T.MeshBasicMaterial({...style,side:T.DoubleSide})):new T.LineSegments(geometry,new T.LineBasicMaterial(style));
    // 只有机甲附近选中的样方能显示，不需要为每次移动重新求包围球。
    object.frustumCulled=false;
    return object;
  }
  draw(game,ui){
    this.visible=ui.panel==='reform'&&ui.view==='surface';
    if(!this.visible)return;
    const {point,plan}=brushQuote(game,ui),p=game.planet;
    const signature=[p.seed,p.reform.revision,point.x,point.y,ui.brush.size].join('|');
    const tint=plan.error?0xff7d60:0x8dffe0;
    this.lines.material.color.setHex(tint);
    this.paint.material.color.setHex(tint);
    if(this.signature===signature)return;
    this.signature=signature;
    const faces=this.paint.geometry.attributes.position,edges=this.lines.geometry.attributes.position;
    let f=0,e=0;
    for(const {x,y} of plan.tiles){
      const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5],[0,0]].map(([dx,dy])=>{
        const px=x+dx,py=y+dy,r=groundRadius(p,px,py)+.115;
        return axis(px,py).map(n=>n*r);
      });
      for(let n=0;n<4;n++){
        const next=(n+1)%4;
        for(const index of [4,n,next])faces.setXYZ(f++,...corners[index]);
        for(const index of [n,next])edges.setXYZ(e++,...corners[index]);
      }
    }
    for(const [mesh,used] of [[this.paint,f],[this.lines,e]]){
      const attr=mesh.geometry.attributes.position;
      if(used){attr.addUpdateRange(0,used*3);attr.needsUpdate=true;}
      mesh.geometry.setDrawRange(0,used);
    }
  }
}
