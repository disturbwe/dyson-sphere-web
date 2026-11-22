import {flow,recordFlow} from './production-log.js';
import {unloadBelt,cargoPoints,cargoSize,putCargo,takeCargo} from './belt-cargo.js';
import {speedRate} from './proliferation.js';
import {sharePoints} from './stock.js';
import {belts,items} from './catalog.js';
import {dirs,key} from './world.js';
import {add,count} from './stock.js';

export const liquids=new Set(['water','crude-oil','refined-oil','sulfuric-acid','hydrogen','deuterium']);
export const tankCapacity=t=>10000*(t.layers||1);
export function canFill(t,id){
  const held=Object.keys(t.output)[0];
  return liquids.has(id)&&(!held||held===id)&&count(t.output,id)<tankCapacity(t);
}

/** 把四邻带的方向转换为本机进出口，只在建拆时调用。端点必须朝向或背向设备，横穿的带保持独立。 */
export function beltPorts(planet,t){
  return dirs.map(([dx,dy],side)=>{
    const belt=planet.tiles[key(t.x+dx,t.y+dy)];
    if(!belt||!belts.includes(belt.type))return null;
    if(belt.dir===side)return {belt,inward:false};
    if(belt.dir===(side+2)%4)return {belt,inward:true};
    return null;
  });
}
export function connectLiquid(planet,t){
  const ports=beltPorts(planet,t);
  if(t.type==='storage-tank'||t.type==='energy-exchanger')return {tile:t,ports};
  // 两侧都能作为氢入口，以接带方向决定实际流向；前口固定排重氢，后方不接带。
  const pair=[ports[(t.dir+1)%4],ports[(t.dir+3)%4]];
  const inlet=pair.find(p=>p?.inward)?.belt;
  const outlet=pair.find(p=>p&&!p.inward)?.belt;
  const front=ports[t.dir];
  return {tile:t,inlet,outlet,product:front&&!front.inward?front.belt:null};
}

/** 储液罐没有电力需求。到达带头的液体才能进入，未腾空的出带和满罐各自施加背压。 */
export function runTank({tile,ports},stage){
  for(const port of ports){
    if(!port)continue;
    const {belt,inward}=port;
    if((inward&&stage==='out')||(!inward&&stage==='in'))continue;
    if(inward){
      if(belt.travel>=1&&belt.cargo&&canFill(tile,belt.cargo)){
        const item=belt.cargo, space=tankCapacity(tile)-count(tile.output,item);
        unloadBelt(belt,tile,'output',space);
      }
      continue;
    }
    const id=Object.keys(tile.output)[0];
    if(id&&!belt.cargo){putCargo(belt,id,1,add(tile.output,id,-1));}
  }
  tile.status=Object.keys(tile.output).length?'储存中':'空罐';
}

export function newFraction(planet,t){
  // 每台机器独立保存抽样序列。暂停、切星、载入与一帧内执行几步都不会重抽同一单位的氢。
  const seed=(planet.seed^Math.imul(t.x+90,73856093)^Math.imul(t.y+45,19349663))>>>0;
  return {seed,passed:0,converted:0};
}
export function fractionGrade(port){
  const inlet=port?.inlet;
  return inlet?.cargo==='hydrogen'?Math.floor((inlet.inc||0)/cargoSize(inlet)):0;
}
export function fractionActive(port){
  return !!port?.inlet&&port.inlet.cargo==='hydrogen'&&!!port.outlet&&!port.outlet.cargo&&count(port.tile.output,'deuterium')<20;
}
/** 分馏按通过的粒子抽样。只有氢走完整条旁路才有一次 1% 机会，堵带或断电时留在原位且不推进随机数。 */
export function runFraction(game,port,dt,planet=game.planet){
  const {tile,inlet,outlet,product}=port;
  const qty=count(tile.output,'deuterium');
  if(qty&&product&&!product.cargo){add(tile.output,'deuterium',-1);putCargo(product,'deuterium');}
  if(!tile.power){tile.status='未供电';return;}
  if(!inlet||!outlet){tile.status='两侧需接氢循环带';return;}
  if(!fractionActive(port)){
    tile.status=inlet.cargo==='hydrogen'?'等待输出':'等待氢';return;
  }
  const speed=Math.min(items[inlet.type].belt.speed,items[outlet.type].belt.speed);
  tile.progress=Math.min(1,tile.progress+dt*tile.power*speed);
  if(tile.progress<1||inlet.travel<1){tile.status='氢流通过';return;}
  // 为整垛留出最坏情况下的产物空间。随机序列只随实际过机的粒子推进。
  const size=cargoSize(inlet);
  if(count(tile.output,'deuterium')+size>20){tile.status='等待重氢出口';return;}
  const points=cargoPoints(inlet), chance=.01*speedRate[Math.floor(points/size)];
  tile.fraction.lastChance=chance;
  takeCargo(inlet);tile.progress=0;
  const batch=tile.fraction;
  let converted=0;
  for(let i=0;i<size;i++){
    batch.seed=(Math.imul(batch.seed,1664525)+1013904223)>>>0;
    if(batch.seed/4294967296<chance)converted++;
  }
  batch.passed+=size;batch.converted+=converted;
  if(converted){
    add(tile.output,'deuterium',converted);add(game.stats.made,'deuterium',converted);
    // 只有成功分馏的氢会消失，回流氢依然是同一批货。
    recordFlow(planet,game.elapsed,'hydrogen',flow.used,converted);recordFlow(planet,game.elapsed,'deuterium',flow.made,converted);
  }
  if(size>converted)putCargo(outlet,'hydrogen',size-converted,points-sharePoints(points,size,converted));
  tile.status='分馏中';
}
