import {coaterType,newCoater} from './coater.js';
import {distributorType,newDistributor,distributorConfig,isDepot} from './depot.js';
import {newMonitor,monitorConfig,monitorType} from './traffic.js';
import {buildable,belts,sorters,recipes,physical,forMachine} from './catalog.js';
import {splitter,splitterConfig} from './splitter.js';
import {isLab} from './lab.js';
import {largeMiner,mineConfig,applyMineConfig} from './advanced-miner.js';
import {collector} from './gas.js';
import {stationTypes,newStation,setPort,setStationRule,modes,maxSlot} from './stations.js';
import {defenses,analysisBase} from './fog-rules.js';
import {equipment} from './defense-equipment.js';
import {exchanger,exchangeModes,fullCell} from './energy.js';

import {validTrackShape} from './belt-level.js';
import {beaconType,beaconConfig} from './beacons.js';

const solidItems=new Set(physical.map(item=>item.id));
const facilities=new Set(buildable.filter(id=>!sorters.includes(id)&&id!==fullCell&&id!==monitorType&&id!==coaterType&&id!==distributorType));
const settings=['chargeMW','minDrone','minVessel','range','warpAU','requireWarp','collectGas'];
export const allowedItem=id=>solidItems.has(id);
export function insist(ok,message){if(!ok)throw new Error(message);}
export const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;

function stationConfig(type,source){
  const station=newStation(type);
  const tile={type,station};
  const spec=stationTypes[type];
  insist(source&&Array.isArray(source.slots)&&source.slots.length===spec.slots,'物流站仓位数量有误');
  const seen=new Set();
  station.slots=source.slots.map(slot=>{
    if(slot===null)return null;
    insist(allowedItem(slot?.item)&&!seen.has(slot.item),'物流站货物无效或重复');
    insist(integer(slot.limit,0,spec.capacity+(spec.vessels?10000:5000)),'物流站仓容有误');
    insist(modes.includes(slot.local)&&modes.includes(slot.remote)&&(spec.vessels||slot.remote==='storage'),'物流站供需设置有误');
    seen.add(slot.item);
    return {item:slot.item,limit:slot.limit,local:slot.local,remote:slot.remote};
  });
  for(const field of settings)if(Object.hasOwn(source,field))setStationRule(tile,field,source[field]);
  insist(Array.isArray(source.exitItems)&&source.exitItems.length===4,'物流站出口设置有误');
  source.exitItems.forEach((item,dir)=>setPort(tile,dir,item));
  return Object.fromEntries(['slots','exitItems',...settings].filter(field=>Object.hasOwn(station,field)).map(field=>[field,station[field]]));
}
/** 从设施、文件或待建存档取出设计字段。库存、飞船、燃料和在制品始终由目的地自己的生产与物流生成。 */
export function facilityConfig(source){
  const type=source?.type;
  insist(facilities.has(type)&&integer(source.dir,0,3),'蓝图设施类型或朝向有误');
  insist(validTrackShape(source),'蓝图输送带高度或坡度无效');
  const config={type,dir:source.dir};
  // 只带上坡形与层位。货垛、喷点和行程属于已建线路，不能复制进新蓝图。
  for(const prop of ['h','rise','entryRise'])if(source[prop])config[prop]=source[prop];
  if(source.recipe){
    const valid=source.recipe==='research'?isLab(type):Object.hasOwn(recipes,source.recipe)&&forMachine(type).some(r=>r.id===source.recipe);
    insist(valid,'蓝图配方与设施不匹配');config.recipe=source.recipe;
  }
  if(isLab(type)||isDepot(type)||type==='storage-tank'){
    insist(integer(source.layers??1,1,20),'蓝图层数有误');config.layers=source.layers??1;
  }
  if(type===exchanger||type==='ray-receiver'){
    const valid=type===exchanger?Object.hasOwn(exchangeModes,source.mode):['power','photon'].includes(source.mode);
    insist(valid,'蓝图供能模式有误');config.mode=source.mode;
  }
  if(type==='em-rail-ejector'){
    insist(Number.isSafeInteger(source.orbit)&&source.orbit>0,'蓝图太阳帆轨道有误');config.orbit=source.orbit;
  }
  if(source.distributor){
    insist(isDepot(type),'配送器须附在储物仓顶部');config.distributor=distributorConfig(source.distributor);
  }
  if(source.coater){
    insist(belts.includes(type)&&!source.monitor&&typeof source.coater.reverse==='boolean','喷涂机需要独立的带面');
    config.coater={reverse:source.coater.reverse};
  }
  if(source.accelerate===true&&config.recipe)config.accelerate=true;
  if(source.monitor){
    insist(belts.includes(type),'流速监测器需要依附传送带');config.monitor=monitorConfig(source.monitor);
  }
  if(source.defense){
    insist(defenses.includes(type),'只有防御设施可以保存警戒配置');
    const flags=['enabled'];
    if(type===analysisBase)flags.push('collect','mend');
    if(equipment[type]?.orbital)flags.push('high','space');
    if(equipment[type]?.orbital&&equipment[type].far)flags.push('ground');
    // 弹药、标记和攻击进度属于原设施，设计图只复制玩家选择的工作档位。
    config.defense={};
    for(const field of flags){
      if(source.defense[field]===undefined)continue;
      insist(typeof source.defense[field]==='boolean','蓝图防御档位无效');
      config.defense[field]=source.defense[field];
    }
  }
  if(type===beaconType)config.beacon=beaconConfig(source.beacon,true);
  if(type===splitter)config.split=splitterConfig(source.split);
  if(stationTypes[type])config.station=stationConfig(type,source.station);
  if(type===largeMiner){
    // 实机取仓位的本地模式，图纸只带工艺设置。异星建造会重新从当地矿簇绑定矿种。
    config.miner=mineConfig({...source.miner,mode:source.station?.slots[0]?.local??source.miner?.mode});
  }
  if(type===collector){
    const flags=source.gasModes||source.station?.slots.map(slot=>slot.remote);
    insist(Array.isArray(flags)&&flags.length===2&&flags.every(v=>['storage','supply'].includes(v)),'蓝图气仓模式有误');config.gasModes=[...flags];
  }
  return config;
}
/** 完工时填入配置。另一存档的仓容升级和太阳帆轨道可能不同，仓容按当地上限，轨道缺失则沿用第一条。 */
export function configureFinished(game,tile,config){
  if(config.defense)Object.assign(tile.defense,config.defense);
  if(config.distributor)tile.distributor={...newDistributor(tile),...config.distributor};
  if(config.coater)tile.coater=newCoater(tile,config.coater.reverse);
  if(config.beacon)tile.beacon={...config.beacon};
  if(config.accelerate)tile.accelerate=true;
  if(config.monitor)tile.monitor=newMonitor(config.monitor);
  if(config.split)Object.assign(tile.split,config.split);
  if(config.recipe)tile.recipe=config.recipe;
  if(config.layers){tile.layers=config.layers;if(isLab(tile.type))tile.labWork=Array(tile.layers).fill(0);}
  if(config.mode)tile.mode=config.mode;
  if(config.orbit&&game.dyson.orbits.some(o=>o.id===config.orbit))tile.orbit=config.orbit;
  if(config.miner)applyMineConfig(game,tile,config.miner);
  if(config.gasModes)tile.station.slots.forEach((slot,i)=>slot.remote=config.gasModes[i]);
  if(config.station){
    const template=config.station;
    for(const field of settings)if(Object.hasOwn(template,field))tile.station[field]=template[field];
    tile.station.slots=template.slots.map(slot=>slot&&{...slot,limit:Math.min(slot.limit,maxSlot(game,tile)),incoming:0,held:0});
    tile.station.exitItems=[...template.exitItems];
  }
}
