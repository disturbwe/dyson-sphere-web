import * as T from 'three';

const geodes = new Set(['kimberlite-ore','fractal-silicon']);
const pillars = new Set(['optical-grating-crystal','organic-crystal','spiniform-stalagmite-crystal']);
const tint = {'kimberlite-ore':'#c8d9e5','fractal-silicon':'#399574','organic-crystal':'#c4cb73','optical-grating-crystal':'#ac86d6','spiniform-stalagmite-crystal':'#d4e7ea'};
export const rareDeposit = item => geodes.has(item) || pillars.has(item);

// 向二十面体的每个三角面外侧长出晶尖，让银色和绿色矿体在逆光时仍有明确的星状轮廓。
function geodeGeometry() {
  const seed = new T.IcosahedronGeometry(.46,0);
  const positions = seed.getAttribute('position');
  const vertices = [];
  for (let i=0;i<positions.count;i+=3) {
    const face = [0,1,2].map(offset=>new T.Vector3().fromBufferAttribute(positions,i+offset));
    const tip = face[0].clone().add(face[1]).add(face[2]).normalize().multiplyScalar(.63);
    for (let k=0;k<3;k++) vertices.push(...face[k].toArray(),...face[(k+1)%3].toArray(),...tip.toArray());
  }
  seed.dispose();
  return faceted(vertices);
}
function faceted(vertices) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  return geometry;
}
// 斜角晶冠、直棱晶身及暗色基座在低分辨率下也能区分光栅石、石笋和圆钝的常规矿石。
function prismGeometry() {
  const vertices = [];
  function point(side,top) {
    const angle = side*Math.PI/3;
    return [Math.cos(angle)*.20,top ? .78+.14*Math.cos(angle):0,Math.sin(angle)*.20];
  }
  for (let side=0;side<6;side++) {
    const a=point(side,false), b=point(side+1,false), c=point(side,true), d=point(side+1,true);
    vertices.push(...a,...c,...b, ...b,...c,...d, ...d,...c,.055,1.05,-.033);
  }
  return faceted(vertices);
}

/** 按矿体轮廓各生成一组实例，返回与矿点对应的实例区间。地基显矿和矿脉耗尽共用地表的局部更新。 */
export function crystalBatches(veins,planet,pose,random) {
  const batches=[];
  const root=new T.Object3D(),part=new T.Object3D(),matrix=new T.Matrix4(),color=new T.Color();
  const configs=[[geodes,geodeGeometry,3],[pillars,prismGeometry,5]];
  for (const [kinds,makeGeometry,count] of configs) {
    const deposits=veins.filter(v=>kinds.has(v.item));
    if (!deposits.length) continue;
    const material=new T.MeshStandardMaterial({roughness:.31,metalness:.32,flatShading:true});
    const batch=new T.InstancedMesh(makeGeometry(),material,deposits.length*count);
    deposits.forEach((v,i)=>{
      pose(root,v.x,v.y,planet.seed);root.rotateY(random()*Math.PI*2);root.updateMatrix();
      const isGeode=kinds===geodes;
      for(let j=0;j<count;j++){
        const angle=j*2.4+random()*.28, offset=j ? .24+random()*.11 : 0;
        const height=(j ? .47+.35*random() : .93+.16*random())*(isGeode?.93:1.28);
        part.position.set(offset*Math.cos(angle),isGeode?.26:.02,offset*Math.sin(angle));
        part.rotation.set(Math.cos(angle)*offset*.8,angle,-Math.sin(angle)*offset);
        const width=isGeode?height*.87:.64+.31*random();part.scale.set(width,height,width);part.updateMatrix();
        batch.setMatrixAt(i*count+j,matrix.multiplyMatrices(root.matrix,part.matrix));
        batch.setColorAt(i*count+j,color.set(tint[v.item]).multiplyScalar(.68+.47*random()));
      }
    });
    batches.push([batch,count,deposits]);
  }
  return batches;
}
