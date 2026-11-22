import {axis,ANGLE,distance} from './world.js';

/** 只在建筑改变后重建供电拓扑。球面弦长不超过网格距离，因此用三维桶预筛不会遗漏经线接缝、极区或覆盖边缘的塔。 */
export function connectGrid(relays,radii,links={}) {
  const width=12,side=16,bins=new Map(),parents=relays.map((_,i)=>i);
  const largest=Math.max(0,...Object.values(radii)),longLink=Math.max(0,...Object.values(links));
  const index=(x,y,z)=>x+side*(y+side*z);
  const location=tile=>axis(tile.x,tile.y).map(v=>v/(ANGLE*width)+6);
  function root(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
  function nearby(point,radius,visit){
    const [x,y,z]=location(point),pad=radius/width;
    for(let a=Math.floor(x-pad);a<=x+pad;a++){
      for(let b=Math.floor(y-pad);b<=y+pad;b++){
        for(let c=Math.floor(z-pad);c<=z+pad;c++){
          const bucket=bins.get(index(a,b,c));
          if(bucket)for(const i of bucket)visit(i);
        }
      }
    }
  }
  relays.forEach((relay,i)=>{
    const r=radii[relay.type];
    // 长距节点的连线半径与给建筑供电的半径独立，扩展骨干网不改变覆盖边界。
    nearby(relay,Math.max(r+largest,longLink),j=>{
      const other=relays[j].type;
      const reach=links[relay.type]||links[other]?Math.max(links[relay.type]??r,links[other]??radii[other]):r+radii[other];
      if(distance(relay,relays[j])<=reach)parents[root(i)]=root(j);
    });
    const [x,y,z]=location(relay).map(Math.floor),key=index(x,y,z);
    if(!bins.has(key))bins.set(key,[]);
    bins.get(key).push(i);
  });
  // 距离完全相等时沿用建造顺序，避免分桶枚举顺序改变边界设施原本的供电归属。
  return point=>{
    let best=-1,nearest=Infinity;
    nearby(point,largest,i=>{
      const d=distance(point,relays[i]);
      if(d<=radii[relays[i].type]&&(d<nearest||(d===nearest&&i<best))){nearest=d;best=i;}
    });
    return best<0?-1:root(best);
  };
}
