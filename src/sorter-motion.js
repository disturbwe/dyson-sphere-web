import {belts,items,sorters,stores} from './catalog.js';
import {cargoPoints,cargoSize,putCargo,takeCargo} from './belt-cargo.js';
import {add,count,creditPoints,receiveStock,sharePoints} from './stock.js';
import {accepts,insert} from './actions.js';

const tripsPerSecond=[1.5,3,6,10];
const pileType='sorter-4';

/** 给定分拣器和科技，返回额定往返次数/秒。前五级的装卸容量分别成长，第六级同步装卸可跨三格送满四层极速带。 */
export function sorterRate(link,cap){
  if(link.type===pileType&&cap.sorterParallel)return 30;
  return tripsPerSecond[sorters.indexOf(link.type)]/link.span;
}
function beltRoom(dst,id,height){
  if(!dst.cargo)return height;
  return dst.cargo===id?Math.max(0,height-cargoSize(dst)):0;
}
function canReceive(game,link,dst,id,cap){
  if(belts.includes(dst.type))return !dst.cargo||link.type===pileType&&beltRoom(dst,id,cap.sorterHeight)>0;
  return accepts(dst,id,game);
}
function nextItem(game,link,src,dst,cap){
  if(belts.includes(src.type)){
    const id=src.cargo;
    return id&&(!link.filter||link.filter===id)&&canReceive(game,link,dst,id,cap)?id:null;
  }
  if(link.filter)return count(src.output,link.filter)>0&&canReceive(game,link,dst,link.filter,cap)?link.filter:null;
  for(const id in src.output)if(canReceive(game,link,dst,id,cap))return id;
  return null;
}
/** 只按当前动作申请运行功率。缺货、满带和配方切换导致的阻塞都只需待机电力。 */
export function sorterDemand(game,link,planet,cap){
  const src=planet.tiles[link.from],dst=planet.tiles[link.to],spec=items[link.type].machine;
  const working=link.progress<1||(link.hand?canReceive(game,link,dst,link.hand.item,cap):nextItem(game,link,src,dst,cap));
  return working?spec.usage:spec.drain;
}
function takeInto(hand,src,limit){
  const belted=belts.includes(src.type),id=hand.item;
  const available=belted?(src.cargo===id?cargoSize(src):0):count(src.output,id);
  const n=Math.min(available,limit);
  if(n>0){
    hand.inc+=belted?cargoPoints(src,n):add(src.output,id,-n);
    if(belted)takeCargo(src,n);
    hand.size+=n;
  }
  return n;
}
function unload(game,link,dst,cap){
  const hand=link.hand,id=hand.item;
  let n=0;
  if(belts.includes(dst.type)){
    // 普通分拣器原垛搬运。集装分拣器卸货受独立垛高限制，放不下的件数与喷点留在手中。
    const room=link.type===pileType?beltRoom(dst,id,cap.sorterHeight):dst.cargo?0:hand.size;
    n=Math.min(hand.size,room);
    if(n>0){
      if(dst.cargo)dst.stack=cargoSize(dst)+n;
      else putCargo(dst,id,n);
    }
  }else{
    while(n<hand.size&&accepts(dst,id,game)){insert(dst,id);n++;}
  }
  if(!n)return false;
  const marks=sharePoints(hand.inc,hand.size,n);
  if(marks){
    if(belts.includes(dst.type))dst.inc=(dst.inc||0)+marks;
    else creditPoints(dst,dst.station||stores.includes(dst.type)?'output':'input',id,marks);
  }
  hand.size-=n;hand.inc-=marks;
  if(hand.size)return false;
  delete link.hand;return true;
}
/** 每步推进一条实物分拣路径。progress 记录当前单程进度，有货去卸货端，空手回取货端。停电保持手中货物与位置。 */
export function runSorter(game,planet,link,dt,cap){
  const src=planet.tiles[link.from],dst=planet.tiles[link.to];
  if(src.hull===0||dst.hull===0||!link.power)return;
  let seconds=dt*link.power;
  const pile=link.type===pileType;
  if(link.hand?.wait>0){
    const hand=link.hand;
    if(pile&&hand.size<cap.sorterLoad&&src.cargo===hand.item){
      takeInto(hand,src,cap.sorterLoad-hand.size);
      hand.wait=1/items[src.type].belt.speed;
    }
    if(pile&&!cap.sorterParallel&&hand.size<cap.sorterLoad&&(!src.cargo||src.cargo===hand.item)){
      const held=Math.min(seconds,hand.wait);hand.wait-=held;seconds-=held;
      if(hand.wait>1e-9)return;
    }
    delete hand.wait;
  }
  let travel=seconds*2*sorterRate(link,cap);
  while(travel>1e-9){
    const remaining=1-link.progress;
    if(travel+1e-9<remaining){link.progress+=travel;return;}
    travel-=remaining;link.progress=1;
    if(link.hand){if(!unload(game,link,dst,cap))return;}
    else{
      const id=nextItem(game,link,src,dst,cap);if(!id)return;
      const hand=link.hand={item:id,size:0,inc:0},belted=belts.includes(src.type);
      const capacity=pile?cap.sorterLoad:belted?cargoSize(src):1;
      takeInto(hand,src,capacity);
      // 装货端等下一带节的时间有上限。疏线的最后一件也会运走，连续来货时可合并不同带节的同种物品。
      if(pile&&belted&&!cap.sorterParallel&&hand.size<capacity){hand.wait=1/items[src.type].belt.speed;link.progress=0;return;}
    }
    link.progress=0;
  }
}
/** 拆除实体连接时统一归还臂体和在途货物。连拆皮带、拆端点与手动收回各只调用一次。 */
export function recoverSorter(game,link){
  if(link.hand)receiveStock(game,'bag',link.hand.item,link.hand.size,link.hand.inc);
  add(game.bag,link.type,1);
}
/** 导入边界允许旧档没有手中货物。等待集货、停电和改型途中也必须满足四件与每件四点的物理上限。 */
export function validGrip(hand){
  return hand===undefined||!!hand&&['components','buildings'].includes(items[hand.item]?.category)&&Number.isInteger(hand.size)&&hand.size>=1&&hand.size<=4&&Number.isInteger(hand.inc)&&hand.inc>=0&&hand.inc<=4*hand.size&&(hand.wait===undefined||Number.isFinite(hand.wait)&&hand.wait>=0&&hand.wait<=1/6+1e-9);
}
