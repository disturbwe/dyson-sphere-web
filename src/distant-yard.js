import {Group} from 'three';
import {buildHardware} from './stellar-hardware.js';
import {layerRotation} from './layer-orbit.js';
import {makeSwarm} from './stellar-swarm.js';

// 三个镜头都用同一米制工程。子网格取编辑器单位，父组缩放负责换到星图单位。
export const metersPerYardUnit=2700;

/** 星图、航行和地表天空共享一个远景实例。切换恒星释放旧网格，未建设的图纸在远景里没有实体。 */
export class DistantYard extends Group {
  constructor(){super();this.parts=new Map();this.revision=-1;}
  update(sphere,elapsed,primary,pixelHeight){
    if(this.sphere!==sphere){
      for(const part of this.parts.values()){this.remove(part.mesh);part.dispose();}
      this.parts.clear();this.revision=-1;this.sphere=sphere;
    }
    this.visible=!!sphere && !!(sphere.layers.length||sphere.cohorts.length);
    if(!this.visible)return;
    if(this.revision!==sphere.revision){
      for(const [id,part] of this.parts)if(!sphere.layers.some(layer=>layer.id===id)){
        this.remove(part.mesh);part.dispose();this.parts.delete(id);
      }
      for(const layer of sphere.layers){
        let part=this.parts.get(layer.id);
        // 编号单调递增。删点可能同时拆梁和壳，三个数组的长度和末尾编号共同标记拓扑。
        const shape=[layer.nodes,layer.edges,layer.shells].map(items=>items.length+'.'+(items.at(-1)?.id||0)).join('/');
        if(part?.shape===shape){part.sync();continue;}
        if(part){this.remove(part.mesh);part.dispose();}
        part=buildHardware(layer,layer.radius/metersPerYardUnit,true);
        part.shape=shape;this.add(part.mesh);this.parts.set(layer.id,part);
      }
      this.revision=sphere.revision;
    }
    // 星空中的施工件像素尺寸小，全部层共享两毫秒的建网时间，切换镜头复用已经生成的网格。
    const deadline=performance.now()+2;
    for(const layer of sphere.layers){
      const part=this.parts.get(layer.id);
      part.pump(deadline);layerRotation(part.mesh.quaternion,layer,elapsed,primary);
    }
    if(!this.swarm&&sphere.cohorts.length){this.swarm=makeSwarm(800);this.add(this.swarm.points);}
    if(this.swarm){this.swarm.points.visible=!!sphere.cohorts.length;this.swarm.update(sphere,elapsed,pixelHeight*.70);}
  }
}