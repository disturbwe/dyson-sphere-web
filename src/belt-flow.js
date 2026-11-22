import {cargoSize, putCargo, takeCargo} from './belt-cargo.js';
import {belts,items} from './catalog.js';
import {cellKey,exitKey} from './belt-level.js';

/** 预计算有向邻接和工作区。建拆后重建，货物移动只修改格子，无需每个逻辑步重新哈希相邻位置。 */
export function makeBeltFlow(ground) {
  const byKey=new Map(ground.map((t,i)=>[cellKey(t),i]));
  const tiles=[...ground],upper=new Map();
  for(const base of ground)if(base.coater){upper.set(cellKey(base),tiles.length);tiles.push(base.coater.feed);}
  // 侧向入机的带进入独立上层孔。下方主带永远只交接纵向货物，喷剂不会混入生产线。
  const exits=Int32Array.from(tiles,t=>{
    const dst=exitKey(t),lower=byKey.get(dst),high=upper.get(dst);
    if(high!==undefined&&t.dir%2!==tiles[lower].dir%2)return tiles[high].dir===t.dir?high:-1;
    return lower??-1;
  });
  const speeds=Float32Array.from(tiles,t=>items[t.type].belt.speed),n=tiles.length;
  // T 形交汇优先直行带。拓扑不变时优先次序也不变，工作步里无需对带网排序。
  const straight=tiles.map((t,i)=>i).filter(i=>exits[i]>=0&&tiles[i].dir===tiles[exits[i]].dir);
  const side=tiles.map((t,i)=>i).filter(i=>exits[i]>=0&&tiles[i].dir!==tiles[exits[i]].dir);
  const order=Int32Array.from([...straight,...side]);
  return {tiles,exits,speeds,order,byKey,claimed:new Uint8Array(n),state:new Uint8Array(n),path:new Int32Array(n),cargo:new Array(n),heights:new Uint8Array(n),points:new Uint8Array(n)};
}

const networks=new WeakMap();
/** 运输与线路维护共享一次拓扑计算。货物进出无需失效，改向、换带、建拆统一通过行星修订号触发。 */
export function beltNetwork(planet,liveTiles){
  const cached=networks.get(planet);
  if(cached?.revision===planet.revision)return cached.flow;
  const live=liveTiles||Object.values(planet.tiles).filter(t=>t.hull!==0);
  const flow=makeBeltFlow(live.filter(t=>belts.includes(t.type)));
  networks.set(planet,{revision:planet.revision,flow});
  return flow;
}

/** 输送节拍由存档中的模拟时间决定。12 格/秒在 30 Hz 下交替占 2 或 3 步，跨格时不能反复丢掉小数时间。 */
export function prepareBelts(flow,dt,elapsed){
  for(let i=0;i<flow.tiles.length;i++){
    const belt=flow.tiles[i];
    if(!belt.cargo||belt.travel>=1)continue;
    const beat=elapsed*flow.speeds[i], now=Math.floor(beat+1e-8);
    const before=Math.floor(beat-dt*flow.speeds[i]+1e-8);
    belt.travel=now>before?1:Math.max(belt.travel,Math.max(0,beat-now));
  }
}
/** 先让端口取走已经到带头的货，再同步前移。满载闭环可整体移动，堵住的末端会反向阻塞整条链。 */
export function moveBelts(flow) {
  const {tiles,exits,claimed,state,path,cargo}=flow;
  claimed.fill(0);state.fill(0);
  let proposals=0;
  for(const i of flow.order){
    const t=tiles[i];if(!t.cargo)continue;
    const dst=exits[i];
    if(t.travel>=1&&dst>=0&&!claimed[dst]){claimed[dst]=1;state[i]=1;proposals++;}
  }
  if(!proposals)return;
  // 长链和回路用显式栈。在球面铺满数千格时，递归逐格回溯会耗尽浏览器调用栈。
  for(let i=0;i<tiles.length;i++){
    if(state[i]!==1)continue;
    let at=i,length=0;
    while(state[at]===1){
      state[at]=2;path[length++]=at;at=exits[at];
      if(!tiles[at].cargo)break;
    }
    const result=!tiles[at].cargo||state[at]===2||state[at]===3?3:4;
    while(length)state[path[--length]]=result;
  }
  // 两阶段写入确保满载传送带不会覆盖后一个尚未移出的物品。
  for(let i=0;i<tiles.length;i++)if(state[i]===3){
    cargo[i]=tiles[i].cargo;flow.points[i]=tiles[i].inc||0;flow.heights[i]=takeCargo(tiles[i],cargoSize(tiles[i]));
  }
  for(let i=0;i<tiles.length;i++)if(state[i]===3){
    putCargo(tiles[exits[i]],cargo[i],flow.heights[i],flow.points[i]);cargo[i]=null;
  }
}
/** 单独推进纯皮带网络时使用同样的节拍。游戏主循环在两相之间结算设备入料。 */
export function runBelts(flow,dt){
  flow.elapsed=(flow.elapsed||0)+dt;prepareBelts(flow,dt,flow.elapsed);moveBelts(flow);
}
