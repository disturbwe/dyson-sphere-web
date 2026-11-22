import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {facility} from './models.js';
import {makeSorterView,drawSorters} from './sorter-view.js';
import {levelRise,beltsAbove} from './belt-level.js';
import {ANGLE, RADIUS, axis,delta} from './world.js';
import {gauss,laser} from './fog-rules.js';
import {cargoSize} from './belt-cargo.js';
import {belts,tint} from './catalog.js';
import {isLab} from './lab.js';

const stationMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.62,metalness:.32});
const litMaterial=new T.MeshBasicMaterial({vertexColors:true});
const cargoMaterial=new T.MeshStandardMaterial({color:0xffffff,roughness:.51,metalness:.25});
const chip=new T.BoxGeometry(.35,.21,.38);
// 用实例高度和侧壁接缝表现四层实物，同一带格始终只占一个实例，长线堆叠不会成倍增加绘制量。
const pileScale=new T.Vector3(1,1,1);
const chipVaryings='varying float vPileHeight; varying float vPileSide; varying float vMarks; varying vec2 vChipUV;\n';
cargoMaterial.onBeforeCompile=shader=>{
  shader.vertexShader=chipVaryings+shader.vertexShader.replace('#include <color_vertex>',
    '#include <color_vertex>\n vMarks=0.; vChipUV=uv;\n #ifdef USE_INSTANCING_COLOR\n vMarks=floor(instanceColor.r*.5);vColor.r-=2.*vMarks;\n #endif\n').replace('#include <begin_vertex>',
    '#include <begin_vertex>\n vPileHeight=(position.y/.21+.5)*length(instanceMatrix[1].xyz); vPileSide=1.-abs(normal.y);');
  shader.fragmentShader=chipVaryings+shader.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\n float seam=1.-smoothstep(.015,.09,min(fract(vPileHeight),1.-fract(vPileHeight))); diffuseColor.rgb*=1.-.53*seam*vPileSide; float u=vChipUV.x*3.5-.22; float v=fract(vPileHeight)-.28; float mark=step(0.,u)*step(floor(u)+.5,vMarks)*step(0.,v)*step(abs(fract(u)-.5)+v*.83,.46); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.68,.14),mark*vPileSide);');
};
const liquidColors={empty:new T.Color('#48606a'),'proliferator-1':new T.Color('#e6a84f'),'proliferator-2':new T.Color('#59c491'),'proliferator-3':new T.Color('#55d5e7')};
const meterColors={waiting:new T.Color('#babeba'),pass:new T.Color('#55ed92'),fail:new T.Color('#fa5c47'),offline:new T.Color('#374654')};
const catalog=new Map();
const colors=new Map();
const chunkKey=(x,y)=>Math.floor((x+90)/12)+','+Math.floor((y+45)/10);

// 高空圈比地面长，东西向在高纬度缩短。同一比例传给实体、预览与货物，避免桥面节间露缝。
export const beltLength=t=>(RADIUS+levelRise*(t.h||0))*ANGLE/1.8*(t.dir%2?1:Math.cos(t.y*ANGLE));

// 工地、蓝图预览和已建设施使用同一个外形键。换装仓体仅重建所在块，货物计数不会触发重新上传。
export function factoryShape(tile){
  if(tile.hull===0)return 'fog-ruin';
  if(tile.distributor)return 'depot-roof/'+tile.type+'/'+(tile.layers||1);
  if(tile.coater)return tile.type+(tile.coater.reverse?'-coated-r':'-coated');
  if(tile.monitor)return tile.type+'-metered';
  if(tile.rise||tile.entryRise)return 'ramp/'+tile.type+'/'+(tile.entryRise||0)+'/'+(tile.rise||0);
  return tile.split?.depot?'splitter-with-depot':tile.type;
}
// 带停机坪的仓体 已在模型中烘焙全部楼层，废墟也只绘制一份。蓝图与完工建筑使用同一规则。
export const visualLevels=tile=>tile.distributor||tile.hull===0?1:tile.layers||1;
export const storeyHeight=type=>isLab(type)?1.64:type==='storage-1'||type==='storage-2'?1.16:1.4;
export function blueprintModel(type){
  if(catalog.has(type))return catalog.get(type);
  const model=facility(type), motor=model.userData.rotor||model.userData.core;
  model.updateMatrixWorld(true);
  const pivot=motor?motor.matrixWorld.clone():null;
  const buckets=new Map();
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    let node=mesh;
    while(node&&node!==motor)node=node.parent;
    const moving=!!motor&&node===motor, lit=mesh.material.emissive.getHex()!==0;
    const key=Number(moving)*2+Number(lit);
    if(!buckets.has(key))buckets.set(key,[]);
    // 原件几何可跨建筑复用。仅烘焙局部变换和本来的顶点色，转动件保留独立支点。
    const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    const transform=moving?pivot.clone().invert().multiply(mesh.matrixWorld):mesh.matrixWorld;
    geometry.applyMatrix4(transform);
    const vertexCount=geometry.attributes.position.count, color=new Float32Array(vertexCount*3);
    const baseColor=moving&&isLab(type)?new T.Color(0xffffff):mesh.material.color;
    for(let i=0;i<vertexCount;i++)baseColor.toArray(color,i*3);
    geometry.setAttribute('color',new T.BufferAttribute(color,3));
    buckets.get(key).push(geometry);
  });
  const parts=[];
  for(const [key,sources] of buckets){
    parts.push({geometry:mergeGeometries(sources),material:key%2?litMaterial:stationMaterial,moving:key>=2});
    for(const geometry of sources)geometry.dispose();
  }
  const value={parts,rotor:!!model.userData.rotor,motor};catalog.set(type,value);return value;
}

function disposeBlock(block){
  // 网格和材质按机型共享。只释放属于该地块的实例缓冲，否则相邻工厂会重复上传几何体。
  block.group.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});
  block.group.removeFromParent();
}

/** 按经纬地块和机型批绘。sync 接收同一行星的已提交设施，draw 只更新可见地块的动力件和货物。 */
export class FactoryView {
  constructor(parent,pose){
    this.parent=parent;this.pose=pose;this.blocks=new Map();this.poseCache=new WeakMap();this.tracking=new WeakMap();
    this.dummy=new T.Object3D();this.movement=new T.Matrix4();this.product=new T.Matrix4();
    this.frustum=new T.Frustum();this.pv=new T.Matrix4();this.eye=new T.Vector3();
    this.localRay=new T.Ray();this.hitPoint=new T.Vector3();
  }
  sync(planet){
    if(planet!==this.planet){for(const block of this.blocks.values())disposeBlock(block);this.blocks.clear();this.planet=planet;}
    const cells=new Map(),linksByBlock=new Map();
    this.armBlocksByCell=new Map();
    for(const arm of planet.links){
      const src=planet.tiles[arm.from],dst=planet.tiles[arm.to];
      const owner=chunkKey(src.x,src.y);
      if(!linksByBlock.has(owner))linksByBlock.set(owner,[]);
      linksByBlock.get(owner).push(arm);
      // 一只臂由取货端分区持有。整平卸货端时也要通知这个分区重新计算抓爪轴线。
      for(const tile of [src,dst]){
        const cell=tile.x+','+tile.y;
        if(!this.armBlocksByCell.has(cell))this.armBlocksByCell.set(cell,new Set());
        this.armBlocksByCell.get(cell).add(owner);
      }
    }
    for(const tile of Object.values(planet.tiles)){
      const key=chunkKey(tile.x,tile.y);
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(tile);
    }
    for(const [key,old] of this.blocks){if(!cells.has(key)){disposeBlock(old);this.blocks.delete(key);}}
    for(const [key,tiles] of cells){
      const old=this.blocks.get(key),links=linksByBlock.get(key)||[];
      const sameArms=old&&old.links.length===links.length&&links.every((arm,i)=>arm===old.links[i]&&arm.type===old.armTypes[i]);
      if(sameArms&&old.tiles.length===tiles.length&&tiles.every((t,i)=>t===old.tiles[i]&&(t.layers||1)===old.layers[i]&&t.dir===old.dirs[i]&&factoryShape(t)===old.shapes[i]))continue;
      if(old){disposeBlock(old);for(const t of tiles)this.poseCache.delete(t);}
      this.blocks.set(key,this.makeBlock(key,tiles,links));
    }
  }
  /** 地面整平只重建含有实际受影响建筑的分区，整片空海填地无需遍历其他工厂。 */
  reshape(cells){
    const blocks=new Set();
    for(const k of cells){const [x,y]=k.split(',').map(Number);
      for(const owner of this.armBlocksByCell.get(k)||[])blocks.add(owner);
      for(const t of [this.planet.tiles[k],...beltsAbove(this.planet,x,y)])if(t){
        this.poseCache.delete(t);if(t.coater)this.poseCache.delete(t.coater.feed);blocks.add(chunkKey(x,y));
      }
    }
    for(const k of blocks){const old=this.blocks.get(k);if(old){disposeBlock(old);this.blocks.set(k,this.makeBlock(k,old.tiles,old.links));}}
  }
  placement(tile){
    let matrix=this.poseCache.get(tile);
    if(!matrix){
      this.dummy.scale.set(1,1,1);this.pose(this.dummy,tile.x,tile.y,this.planet.seed,.025+levelRise*(tile.h||0));
      if(belts.includes(tile.type))this.dummy.scale.x=beltLength(tile);
      this.dummy.rotateY(tile.dir*Math.PI/2);this.dummy.updateMatrix();matrix=this.dummy.matrix.clone();
      this.poseCache.set(tile,matrix);
    }
    return matrix;
  }
  makeBlock(key,tiles,links){
    const group=new T.Group(),motors=[],tracks=[],upperTracks=new Set(),byType=new Map();
    const [cx,cy]=key.split(',').map(Number),normal=new T.Vector3(...axis(cx*12-84,cy*10-40));
    // 地块宽 24°、高 20°。包围球留出最高塔架与网格边缘，裁剪不能让地平线上的设施弹出。
    const top=tiles.reduce((height,t)=>Math.max(height,levelRise*(t.h||0)+(t.layers||1)*(isLab(t.type)?1.64:1.4)),0);
    const bounds=new T.Sphere(normal.clone().multiplyScalar(RADIUS+top*.5),18+top*.5+(links.length?5.4:0));
    for(const tile of tiles){
      const shape=factoryShape(tile);
      if(!byType.has(shape))byType.set(shape,[]);
      byType.get(shape).push(tile);if(belts.includes(tile.type))tracks.push(tile);
      if(tile.coater){tracks.push(tile.coater.feed);upperTracks.add(tile.coater.feed);}
    }
    for(const [type,members] of byType){
      const schema=blueprintModel(type),levelHeight=storeyHeight(type);
      const instances=members.reduce((sum,tile)=>sum+visualLevels(tile),0);
      for(const part of schema.parts){
        const batch=new T.InstancedMesh(part.geometry,part.material,instances);
        batch.frustumCulled=false;batch.castShadow=part.material===stationMaterial;batch.receiveShadow=batch.castShadow;
        let index=0;
        for(const tile of members){
          const place=this.placement(tile);batch.setMatrixAt(index++,place);
          // 堆叠设施沿局部地面法线加层，上部模型沿用底层朝向和机型对应的层高。
          for(let level=1;level<visualLevels(tile);level++){
            this.movement.makeTranslation(0,level*levelHeight,0);
            batch.setMatrixAt(index++,this.product.multiplyMatrices(place,this.movement));
          }
        }
        if(part.moving){batch.instanceMatrix.setUsage(T.DynamicDrawUsage);motors.push({batch,members,schema,levelHeight,palette:new Map()});}
        group.add(batch);
      }
    }
    let cargo=null;
    if(tracks.length){cargo=new T.InstancedMesh(chip,cargoMaterial,tracks.length);cargo.instanceMatrix.setUsage(T.DynamicDrawUsage);cargo.frustumCulled=false;cargo.count=0;group.add(cargo);}
    // 只在可见分区拾取跨格矿架和高架带。矿架用实体轮廓的窄盒，露天采掘面仍可直接选矿或布带。
    const raised=tiles.filter(t=>t.h>0||t.miner&&t.hull!==0).flatMap(tile=>{
      const matrix=this.placement(tile),rise=Math.max(Math.abs(tile.rise||0),Math.abs(tile.entryRise||0))*levelRise*.5;
      const boxes=tile.miner?[
        [-.60,.10,-.62,.74,3.58,.62],[-.65,.06,-1.78,.92,.72,1.78],
        [-6.89,.16,-2.21,-.09,1.53,-1.78],[-6.89,.16,1.78,-.09,1.53,2.21],
        [-6.97,1.95,-1.35,-6.62,2.60,1.35],[-1.02,1.95,-1.35,-.64,2.60,1.35]
      ]:[[-.91,-.04-rise,-.39,.91,.40+rise,.39]];
      const inverse=matrix.clone().invert();
      return boxes.map(([x,y,z,u,v,w])=>({tile,matrix,inverse,bounds:new T.Box3(new T.Vector3(x,y,z),new T.Vector3(u,v,w))}));
    });
    const sorters=makeSorterView(group,this.planet,links,blueprintModel);
    this.parent.add(group);return {tiles,raised,links,armTypes:links.map(l=>l.type),sorters,dirs:tiles.map(t=>t.dir),shapes:tiles.map(factoryShape),layers:tiles.map(t=>t.layers||1),group,bounds,normal,motors,tracks,upperTracks,cargo};
  }
  pickRaised(ray,maxDistance){
    let closest=maxDistance,found=null;
    for(const block of this.blocks.values()){
      if(!block.group.visible||!block.raised.length||!ray.intersectsSphere(block.bounds))continue;
      for(const entry of block.raised){
        this.localRay.copy(ray).applyMatrix4(entry.inverse);
        if(!this.localRay.intersectBox(entry.bounds,this.hitPoint))continue;
        const distance=this.hitPoint.applyMatrix4(entry.matrix).distanceTo(ray.origin);
        if(distance<closest){closest=distance;found=entry.tile;}
      }
    }
    return found;
  }
  /** 塔头根据已结算的目标朝向，待机保留末次方向。经度差取短弧并修正纬度，以免跨日界线时反向摆动。 */
  turretYaw(tile){
    const field=this.planet.fog;
    const target=tile.defense.target===-1?field?.base:field?.units.find(unit=>unit.id===tile.defense.target);
    if(target){
      const [dx,dy]=delta(tile,target);
      this.tracking.set(tile,Math.atan2(dx*Math.cos(tile.y*ANGLE),-dy)-tile.dir*Math.PI/2);
    }
    return this.tracking.get(tile)||0;
  }
  /** 把恒星方向投影到电板基座的局部坐标。俯仰角限位可避免晨昏时面板穿入地面。 */
  aimPanel(tile,sun){
    const basis=this.placement(tile).elements;
    const local=column=>sun.x*basis[column]+sun.y*basis[column+1]+sun.z*basis[column+2];
    const altitude=local(4);
    // 深夜没有直射光，面板回到水平停靠位。跟踪式面板的发电量始终由模拟结算。
    const pitch=altitude<-.35?0:Math.min(1.32,Math.acos(Math.max(-1,Math.min(1,altitude))));
    this.dummy.rotation.set(pitch,Math.atan2(local(0),local(8)),0,'YXZ');
  }
  draw(camera,time,sun){
    this.frustum.setFromProjectionMatrix(this.pv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const d=camera.position.length(),horizon=Math.acos(Math.min(1,RADIUS/d));this.eye.copy(camera.position).normalize();
    for(const block of this.blocks.values()){
      block.group.visible=block.normal.dot(this.eye)>Math.cos(horizon+.45)&&this.frustum.intersectsSphere(block.bounds);
      if(!block.group.visible)continue;
      drawSorters(block.sorters);
      for(const drive of block.motors){
        const {batch,members,schema,levelHeight,palette}=drive;
        // 光伏跟踪变化缓慢。只给可见阵列每秒刷新四次实例缓冲，避免大面积电板逐帧上传。
        if(members[0].type==='solar-panel'){
          if(time<(drive.nextTrack||0))continue;
          drive.nextTrack=time+.25;
        }
        const joint=schema.motor;let slot=0,changedColor=false;
        for(const tile of members){
          const lab=isLab(tile.type),active=tile.status==='生产中'||tile.status==='研究中';
          const meter=tile.monitor,signal=meter?.state;
          if(tile.coater){
            const fluid=tile.coater.fluid||'empty';
            if(palette.get(tile)!==fluid){batch.setColorAt(slot,liquidColors[fluid]);palette.set(tile,fluid);changedColor=true;}
          }
          const paint=lab && palette.get(tile)!==tile.recipe;
          if(meter&&palette.get(tile)!==signal){batch.setColorAt(slot,meterColors[signal]);palette.set(tile,signal);changedColor=true;}
          if(paint)palette.set(tile,tile.recipe);
          this.dummy.rotation.copy(joint.rotation);this.dummy.scale.copy(joint.scale);
          if(tile.type==='solar-panel'&&sun)this.aimPanel(tile,sun);
          else if(meter||tile.coater||tile.miner)this.dummy.rotation.y=joint.rotation.y;
          else if(tile.type===gauss||tile.type===laser)this.dummy.rotation.y=this.turretYaw(tile);
          else if(schema.rotor)this.dummy.rotation.y=time*1.8;
          else this.dummy.rotation.y=tile.power?time*(active?1.9:.55):joint.rotation.y;
          // 每层科研核心使用对应的实例下标。其他塔顶核心不会占用下一座塔的实例。
          for(let level=0;level<visualLevels(tile);level++){
            this.dummy.position.copy(joint.position);this.dummy.position.y+=level*levelHeight;
            if(tile.miner){
              // 以累计采矿件数和当前批次定位横梁。断电、减速和读档时扫描位置与实际开采进度一致。
              const phase=((tile.cursor||0)+tile.progress)/24;
              this.dummy.position.x+=2.62*Math.sin(phase);
            }
            this.dummy.updateMatrix();batch.setMatrixAt(slot,this.product.multiplyMatrices(this.placement(tile),this.dummy.matrix));
            if(paint){
              const label=tile.recipe||'unknown';
              if(!colors.has(label))colors.set(label,new T.Color(tile.recipe==='research'?'#b3f1ff':tint(label)));
              batch.setColorAt(slot,colors.get(label));changedColor=true;
            }
            slot++;
          }
        }
        batch.instanceMatrix.needsUpdate=true;
        if(changedColor)batch.instanceColor.needsUpdate=true;
      }
      if(!block.cargo)continue;
      let count=0;
      for(const tile of block.tracks){
        if(!tile.cargo)continue;
        // 货物只在本格移动，沿球面切线平移无需每帧重算地形噪声。跨格时取下一节皮带的标高。
        const offset=tile.travel-.5,height=cargoSize(tile);
        const incline=(offset<0?tile.entryRise:tile.rise)||0;
        this.movement.makeTranslation(offset*1.8,(block.upperTracks.has(tile)?1.03:.245)+.105*height+offset*incline*levelRise,0);
        this.movement.scale(pileScale.set(1,height,1));
        block.cargo.setMatrixAt(count,this.product.multiplyMatrices(this.placement(tile),this.movement));
        const marks=Math.min(3,Math.floor((tile.inc||0)/height));
        const tone=marks?tile.cargo+'/'+marks:tile.cargo;
        if(!colors.has(tone)){
          // 复用现有的实例色通道携带记号个数，顶点阶段解包，还原物品本色后绘制黄三角。
          const color=new T.Color(tint(tile.cargo));color.r+=2*marks;colors.set(tone,color);
        }
        block.cargo.setColorAt(count++,colors.get(tone));
      }
      block.cargo.count=count;
      if(count){block.cargo.instanceMatrix.needsUpdate=true;block.cargo.instanceColor.needsUpdate=true;}
    }
  }
}
