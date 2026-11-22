import {flow,recordFlow} from './production-log.js';
import {gradeOf,speedRate} from './proliferation.js';
import {putCargo,unloadBelt} from './belt-cargo.js';
import {add,count,receiveStock} from './stock.js';
import {coreOpen} from './fog-rules.js';
import {settled} from './reform.js';
import {elevation,clamp,key} from './world.js';

export const emptyCell='accumulator', fullCell='accumulator-full', exchanger='energy-exchanger';
export const cellMJ=540;
export const exchangeModes={idle:'待机',charge:'充电',discharge:'放电'};
const exchangeKW=54000, buffer=20;

/** 熔岩浓度用同一地形高度场近似。游戏内深色地壳无热源，熔岩池中心可超过额定功率。 */
export function heatAt(planet,point){
  const f=planet.fog;
  if(coreOpen(planet,point)||f?.well&&f.base.x===point.x&&f.base.y===point.y)return 3+f.base.level*.1;
  const formerLevel=f?.oldWells?.[key(point.x,point.y)];
  if(formerLevel!==undefined)return 3+formerLevel*.1;
  if(planet.biome!=='lava'||settled(planet,point.x,point.y))return 0;
  const level=elevation(point.x,point.y,planet.seed);
  return level>=0?0:.4+clamp(-level/1.6,0,1)*1.1;
}
export function setupEnergyTile(t,type,planet){
  if(type===emptyCell || type===fullCell){
    t.type=emptyCell;t.energyMJ=type===fullCell?cellMJ:0;t.flowKW=0;
  }else if(type===exchanger){
    t.mode='idle';t.energyMJ=null;t.flowKW=0;
  }else if(type==='geothermal-power-station')t.efficiency=heatAt(planet,t);
}
export function exchangeMode(t,mode){
  if(t?.type!==exchanger||!Object.hasOwn(exchangeModes,mode))throw new Error('请选择枢纽工作模式');
  // 切换极性保留正在处理的同一只电池，来回切换不会生成额外的电量或空壳。
  t.mode=mode;t.flowKW=0;
}
export function acceptsCell(t,id){
  return count(t.input,id)<buffer && ((t.mode==='charge'&&id===emptyCell)||(t.mode==='discharge'&&id===fullCell));
}
/** 按给定方向返回本步可实际交换的功率上限，单位千瓦。限制到单只电芯的边界以保持焦耳守恒。 */
export function cellCapacity(t,dt,discharge){
  const unit=1000/dt;
  if(t.type===emptyCell)return discharge?Math.min(2250,t.energyMJ*unit):Math.min(1500,(cellMJ-t.energyMJ)*unit);
  if(t.mode!==(discharge?'discharge':'charge'))return 0;
  const input=discharge?fullCell:emptyCell, product=discharge?emptyCell:fullCell;
  if(count(t.output,product)>=buffer || (t.energyMJ===null&&!count(t.input,input)))return 0;
  const energy=t.energyMJ??(discharge?cellMJ:0);
  const grade=t.energyMJ===null?gradeOf(t.input,input):t.cellInc||0;
  return Math.min(exchangeKW*speedRate[grade],(discharge?energy:cellMJ-energy)*unit);
}
/** 只在已分配到真实功率时接入、扣除实物电芯。达到端点时将完整产物记入输出缓存和统计。 */
export function flowCell(game,t,kw,dt,planet=game.planet){
  t.flowKW=kw;
  const fixed=t.type===emptyCell;
  if(!kw){t.status=fixed?(t.energyMJ===cellMJ?'已充满':'待机'):exchangeModes[t.mode]+'待命';return;}
  const discharge=kw>0;
  if(t.energyMJ===null){
    const id=discharge?fullCell:emptyCell;
    t.cellInc=add(t.input,id,-1);t.energyMJ=discharge?cellMJ:0;recordFlow(planet,game.elapsed,id,flow.used);
  }
  t.energyMJ=clamp(t.energyMJ-kw*dt/1000,0,cellMJ);
  if(t.energyMJ<1e-8)t.energyMJ=0;
  if(t.energyMJ>cellMJ-1e-8)t.energyMJ=cellMJ;
  t.status=discharge?'放电中':'充电中';
  if(!fixed && t.energyMJ===(discharge?0:cellMJ)){
    const id=discharge?emptyCell:fullCell;
    receiveStock(t,'output',id,1,t.cellInc||0);add(game.stats.made,id,1);recordFlow(planet,game.elapsed,id,flow.made);t.energyMJ=null;t.cellInc=0;
  }
}
/** 枢纽四邻可直接上带。换模式前已产出的另一种电池也允许排走，以便用同一台机器收尾。 */
export function runExchangePorts({tile,ports},stage){
  for(const port of ports){
    if(!port||(port.inward&&stage==='out')||(!port.inward&&stage==='in'))continue;
    const belt=port.belt;
    if(port.inward){
      if(belt.travel>=1&&belt.cargo&&acceptsCell(tile,belt.cargo)){
        unloadBelt(belt,tile,'input',buffer-count(tile.input,belt.cargo));
      }
    }else if(!belt.cargo){
      const item=count(tile.output,fullCell)?fullCell:count(tile.output,emptyCell)?emptyCell:null;
      if(item){putCargo(belt,item,1,add(tile.output,item,-1));}
    }
  }
}
