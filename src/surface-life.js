import * as T from 'three';
import {rng,axis,key} from './world.js';
import {partitionInstances} from './surface-sectors.js';
import {groundRadius} from './reform-terrain.js';
import {availableSite} from './oil.js';
import {forestOf} from './forest.js';
import {isSeep} from './oil.js';
import {oreColors} from './catalog.js';
import {crystalBatches,rareDeposit} from './mineral-shapes.js';

function solid(geometry,count,metalness=0){
  const material=new T.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness,flatShading:true});
  return new T.InstancedMesh(geometry,material,count);
}
function treePatch(planet,pose){
  const {trees}=forestOf(planet);
  const random=rng(planet.seed+4343);
  const timber=solid(new T.CylinderGeometry(.055,.10,1,5),trees.length*2);
  const crowns=solid(new T.IcosahedronGeometry(1,0),trees.length*4);
  const base=new T.Object3D(),local=new T.Object3D(),matrix=new T.Matrix4(),color=new T.Color();
  function insert(batch,index,x,y,z,sx,sy,sz,lean,color){
    local.position.set(x,y,z);local.scale.set(sx,sy,sz);local.rotation.set(0,0,lean);local.updateMatrix();
    batch.setMatrixAt(index,matrix.multiplyMatrices(base.matrix,local.matrix));batch.setColorAt(index,color);
  }
  trees.forEach((tree,i)=>{
    pose(base,tree.x,tree.y,planet.seed);base.rotateY(tree.angle);base.scale.setScalar(tree.h);base.updateMatrix();
    color.set('#746e56');insert(timber,i*2,0,.54,0,.85,1.13,.85,.04,color);
    insert(timber,i*2+1,.15,.82,.02,.59,.52,.60,-.54,color);
    for(let n=0;n<4;n++){
      const az=n*2.09+tree.angle,last=n===3,radius=last?0:.24;
      color.setHSL(.218+.118*tree.color+random()*.016,.28+random()*.16,.25+.16*tree.color+.12*random());
      const jungle=planet.biome==='tropicana';
      // 丛林的粉紫花冠与阔叶暗绿林成簇分布；每棵树沿用同一个可采伐实例编号。
      if(jungle) color.setHSL(tree.color>.81?.83:.37+tree.color*.055,tree.color>.81?.35:.48,.22+tree.color*.22);
      const spread=jungle?1.32:1;
      insert(crowns,i*4+n,Math.cos(az)*radius*spread,last?1.37:1.10,Math.sin(az)*radius*spread,(.38+random()*.12)*spread,last?.37:.33,(.34+random()*.13)*spread,random()-.5,color);
    }
  });
  const trunks=partitionInstances(timber,trees,2),canopies=partitionInstances(crowns,trees,4);
  const hidden=new T.Matrix4().makeScale(0,0,0),grove=new T.Group();
  for(const mesh of [...trunks.parts,...canopies.parts])grove.add(mesh);
  let cursor=0;
  grove.userData.syncCuts=()=>{
    while(cursor<planet.felled.length){
      const id=planet.felled[cursor++];
      // 游戏按全星编号记伐木；只改所属分区的树干和树冠，其他分区保持原来的上传版本。
      for(const [slots,count] of [[trunks.slots,2],[canopies.slots,4]]){
        const {mesh,base}=slots[id];
        for(let j=0;j<count;j++)mesh.setMatrixAt(base+j,hidden);
        mesh.instanceMatrix.addUpdateRange(base*16,count*16);mesh.instanceMatrix.needsUpdate=true;
      }
    }
  };
  grove.userData.syncCuts();return grove;
}
function mineralPatch(planet,pose){
  const random=rng(planet.seed+7821),base=new T.Object3D(),rock=new T.Object3D(),matrix=new T.Matrix4(),color=new T.Color();
  const solids=planet.veins.filter(v=>!isSeep(v));
  const veins=solids.filter(v=>!rareDeposit(v.item)),ore=solid(new T.DodecahedronGeometry(.58,0),veins.length*4,.20),seam=solid(new T.CylinderGeometry(.50,.60,1,5),veins.length*2,.29);
  for(let i=0;i<veins.length;i++){
    const v=veins[i],tint=oreColors[v.item]||'#aba79e';pose(base,v.x,v.y,planet.seed);base.rotateY(random()*6.28);base.updateMatrix();
    for(let j=0;j<4;j++){
      const side=random()*6.28,offset=j===0?0:.29+random()*.15,big=j===0?1:.63;
      rock.position.set(offset*Math.cos(side),big*.17,offset*Math.sin(side));rock.rotation.set(random()*.5,side,.56-random());rock.scale.set(big*(.6+random()*.38),big*(.59+random()*.52),big*.77);rock.updateMatrix();
      ore.setMatrixAt(i*4+j,matrix.multiplyMatrices(base.matrix,rock.matrix));
      color.set(tint).lerp(new T.Color('#4e5054'),.27+random()*.36);ore.setColorAt(i*4+j,color);
      if(j<2){
        // 矿石由母岩和夹杂其中的矿晶组成。矿带方向按矿点固定，读档不会改变矿脉轮廓。
        rock.position.y+=big*.20;rock.rotation.z-=.15;rock.scale.multiply(new T.Vector3(.64,.25,.63));rock.updateMatrix();
        seam.setMatrixAt(i*2+j,matrix.multiplyMatrices(base.matrix,rock.matrix));color.set(tint).multiplyScalar(1.07);seam.setColorAt(i*2+j,color);
      }
    }
  }
  // 原油在地面形成扁平的深色泉眼，轮廓与可手采的固体矿簇区分开。
  const seeps=planet.veins.filter(isSeep);
  const oil=solid(new T.CylinderGeometry(.80,.85,.065,19),seeps.length,.79);
  const rim=solid(new T.TorusGeometry(.67,.035,4,28).rotateX(-Math.PI/2),seeps.length,.59);
  seeps.forEach((v,i)=>{
    pose(base,v.x,v.y,planet.seed,.065);base.scale.set(1,1,.78);base.updateMatrix();
    oil.setMatrixAt(i,base.matrix);oil.setColorAt(i,color.set('#211e31'));
    base.translateY(.042);base.updateMatrix();rim.setMatrixAt(i,base.matrix);rim.setColorAt(i,color.set('#776378'));
  });
  const groups=[[ore,4,veins],[seam,2,veins],[oil,1,seeps],[rim,1,seeps],...crystalBatches(solids,planet,pose,random)],regions=new Map();
  // 保存模型原姿态。矿点被掩埋时只隐藏实例，露出时恢复同一批岩石及剩余矿量。
  const hidden=new T.Matrix4().makeScale(0,0,0),saved=new T.Matrix4(),group=new T.Group();
  for(const [source,instances,list] of groups){
    const original=source.instanceMatrix.array;
    const {parts,slots}=partitionInstances(source,list,instances,4);
    for(const mesh of parts)group.add(mesh);
    list.forEach((v,i)=>{
      const {mesh,base}=slots[i],address=key(v.x,v.y),direction=axis(v.x,v.y),baseline=groundRadius(planet,v.x,v.y);
      const update=()=>{
        const rise=groundRadius(planet,v.x,v.y)-baseline;
        for(let n=0;n<instances;n++){
          if(!availableSite(v))mesh.setMatrixAt(base+n,hidden);
          else{
            saved.fromArray(original,(i*instances+n)*16);
            for(let c=0;c<3;c++)saved.elements[12+c]+=direction[c]*rise;
            mesh.setMatrixAt(base+n,saved);
          }
        }
        mesh.instanceMatrix.addUpdateRange(base*16,instances*16);mesh.instanceMatrix.needsUpdate=true;
      };
      if(!regions.has(address))regions.set(address,[]);regions.get(address).push(update);
      if(!availableSite(v))update();
    });
  }
  group.userData.reshape=cells=>{
    const visited=new Set();
    for(const k of cells){const [x,y]=k.split(',').map(Number);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)visited.add(key(x+dx,y+dy));}
    for(const k of visited)for(const update of regions.get(k)||[])update();
  };
  return group;
}
/** 生成当前星球实例植被与矿床，空旷的熔岩、戈壁只生成矿床。切星后由场景统一释放实例缓冲。 */
export function surfaceLife(planet,pose){
  const group=mineralPatch(planet,pose);
  if(planet.biome==='mediterranean'||planet.biome==='tropicana'){
    const grove=treePatch(planet,pose);group.add(grove);group.userData.syncCuts=grove.userData.syncCuts;
  }
  const regions=[];
  group.traverse(mesh=>{if(mesh.userData.region)regions.push(mesh);});
  group.userData.cull=view=>{for(const mesh of regions)mesh.visible=view.sees(mesh.userData.region);};
  return group;
}
