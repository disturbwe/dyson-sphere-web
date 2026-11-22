import {items,recipes,research,name,product,handRecipe,unlocked,forMachine,belts,sorters,machines,stores,extractors,generators,buildable} from './catalog.js';
import {wrap,key,delta,distance,clamp,dirs,elevation,makePlanet,environments} from './world.js';
import {newMeter} from './matrix-meter.js';
import {validResource} from './sector-rules.js';
import {beaconType,installBeacon} from './beacons.js';
import {coaterType,newCoater} from './coater.js';
import {unloadBelt,cargoSize,putCargo,takeCargo} from './belt-cargo.js';
import {distributorType,botType,isDepot,newDistributor,depotRoom,shrinkDepot} from './depot.js';
import {ordersOf} from './distribution.js';
import {newMonitor,monitorType} from './traffic.js';
import {newPiler,pilerType} from './piler.js';
import {footingWork,gradeFooting,settled} from './reform.js';
import {makeRelicLesson} from './relic-lesson.js';
import {makeShieldLesson} from './shield-lesson.js';
import {makeSignalLesson} from './signal-lesson.js';
import {makeGeologyLesson} from './geology-lesson.js';
import {makeRefitLesson} from './refit-lesson.js';
import {makeMiningLesson} from './mining-lesson.js';
import {makeVeinsLesson} from './veins-lesson.js';
import {makeFogLesson} from './fog-lesson.js';
import {coreOpen,nearCore,createField,fogModes,setDefense,defenseInput} from './fog-rules.js';
import {makeCoastLesson} from './coast-lesson.js';
import {makeMissionLesson} from './mission-lesson.js';
import {makeDistributionLesson} from './distribution-lesson.js';
import {makeCoatingLesson} from './coating-lesson.js';
import {makePilerLesson} from './piler-lesson.js';
import {makeSplitterLesson} from './splitter-lesson.js';
import {largeMiner,insideMine,installMine,mineSiteError} from './advanced-miner.js';
import {splitter,newSplitter} from './splitter.js';
import {canFill,newFraction,tankCapacity} from './liquid-ports.js';
import {capabilitiesOf} from './upgrades.js';
import {clearFootprint} from './forest.js';
import {cancelWorks} from './construction-orders.js';
import {nearestSeep,occupiedSeeps} from './oil.js';
import {newNavigation} from './navigation.js';
import {newScience,isMatrix} from './research.js';
import {isLab} from './lab.js';
import {stationTypes,newStation,slotFor,freeSpace} from './stations.js';
import {newFreight,portKey} from './freight.js';
import {collector,moorings,setupCollector} from './gas.js';
import {makeGasLesson} from './gas-lesson.js';
import {makeEnergyLesson} from './energy-lesson.js';
import {makeRefineryLesson} from './refinery-lesson.js';
import {makeFreightLesson} from './freight-lesson.js';
import {newSphere} from './sphere.js';
import {acceptsCell,cellMJ,emptyCell,fullCell,exchanger,heatAt,setupEnergyTile} from './energy.js';
import {newHiveNetwork} from './space-hive.js';
import {claimedShields,installShield,shieldLimit,shieldType} from './planet-shield.js';
import {seedOrbitalYard} from './orbital-yard.js';

import {recoverSorter} from './sorter-motion.js';
import {canRefit,refitError,refitPart} from './facility-grades.js';
import {count,add,total,enough,merge,receiveStock,moveStock,moveAll,creditPoints} from './stock.js';
export {count,add,total,enough,merge} from './stock.js';
import {makeBridgeLesson} from './bridge-lesson.js';
import {cellKey,clearanceError,validTrackShape,maxBeltLevel,profileRoute,exitKey} from './belt-level.js';
export const posKey=cellKey;
export const tileAt=(s,p)=>s.planet.tiles[posKey(p)];
export const requireRule=(ok,why)=>{if(!ok)throw new Error(why)};
export const inReach=(s,p)=>!s.space.flight&&distance(s.mecha,p)<=12;

/** 构造新档。教学基地仅通过独立场景创建，示例库存不会混进从着陆开始的存档。 */
export function newGame(seed=747183,scenario='landing',starCount=64,aggression='normal',resource='1'){
  requireRule(Number.isInteger(starCount)&&starCount>=32&&starCount<=64,'星数范围为 32 至 64');
  requireRule(Object.hasOwn(fogModes,aggression),'黑雾活跃度无效');
  requireRule(validResource(resource),'资源倍率无效');
  // 教学的料仓、矿耗与教程目标按标准倍率配置。
  resource=scenario==='landing'?resource:'1';
  const fogMode=['defense','shield','signal'].includes(scenario)?'normal':scenario==='landing'?aggression:'off';
  const s={version:14,seed,scenario,fogMode,resource,elapsed:0,space:newNavigation(starCount),freight:newFreight(),planet:makePlanet(seed,'mediterranean',resource,true),mecha:{x:0,y:-1,soil:0,flying:false,energy:120,fuel:{},burn:0,target:null,mining:null,timber:null,progress:0},bag:{coal:6},techs:[],research:null,science:newScience(),queue:[],stats:{made:{},mined:{},built:0},speed:1};
  s.space.fogNet=newHiveNetwork();
  s.dyson = newSphere();
  if(scenario==='defense')makeFogLesson(s,put,linkSorter);
  else s.planet.fog=createField(s.planet,fogMode);
  if (['foundry','sandbox','blueprint'].includes(scenario)) seedFoundry(s);
  // 蓝图教学只给本档解锁批量建造 I。用于复制的熔炉、仓储和分拣器仍消耗实际库存。
  if(scenario==='shield')makeShieldLesson(s,put);
  if(scenario==='signal')makeSignalLesson(s,put);
  if(scenario==='bridge')makeBridgeLesson(s,put,linkSorter);
  if(scenario==='relic')makeRelicLesson(s,put);
  if(scenario==='veins')makeVeinsLesson(s,put,linkSorter);
  if(scenario==='mining')makeMiningLesson(s,put,linkSorter);
  if(scenario==='refit')makeRefitLesson(s,put,linkSorter);
  if(scenario==='geology')makeGeologyLesson(s,put,linkSorter);
  if(scenario==='mission')makeMissionLesson(s,put,linkSorter);
  if(scenario==='coast')makeCoastLesson(s);
  if(scenario==='sorting')makeSplitterLesson(s,put,linkSorter);
  if(scenario==='coating')makeCoatingLesson(s,put,linkSorter);
  if(scenario==='piling')makePilerLesson(s,put);
  if(scenario==='distribution')makeDistributionLesson(s,put);
  if(scenario==='blueprint')s.techs.push('mass-construction-1');
  if (scenario==='sandbox') seedSpacePort(s);
  if (scenario==='gas') makeGasLesson(s,put);
  if (scenario==='energy') makeEnergyLesson(s,put);
  if (scenario==='refinery') makeRefineryLesson(s,put,linkSorter);
  if (scenario==='freight') makeFreightLesson(s,put,linkSorter);
  s.meta=newMeter(s);
  return s;
}
/** 规划一笔手搓事务：先扣虚拟中间件，再用背包，缺口递归手搓；失败不扣任何实物。 */
export function planCraft(s,id,cycles=1){
  requireRule(Number.isInteger(cycles)&&cycles>=1&&cycles<=100,'数量须在 1 至 100 之间');
  const available={...s.bag}, reserved={}, produced={}, steps=[], stack=new Set();
  function make(r,times){
    requireRule(r && unlocked(s,r) && handRecipe(r), '复制器无法制作 '+name(r?.id||id));
    requireRule(!stack.has(r.id),'该配方形成循环，需要工厂中间件'); stack.add(r.id);
    for(const [item,n] of Object.entries(r.in)){
      let need=n*times, fromJob=Math.min(need,count(produced,item)); add(produced,item,-fromJob); need-=fromJob;
      const fromBag=Math.min(need,count(available,item)); add(available,item,-fromBag); add(reserved,item,fromBag); need-=fromBag;
      if(need>0){const sub=recipes[item]; requireRule(sub && unlocked(s,sub) && handRecipe(sub)&&sub.out[item]>0,'缺少 '+name(item)+' ×'+need);
        make(sub,Math.ceil(need/sub.out[item]));add(produced,item,-need);}
    }
    merge(produced,r.out,times); steps.push({id:r.id,count:times,seconds:r.time*times}); stack.delete(r.id);
  }
  make(recipes[id],cycles);
  return {id,cycles,reserved,produced,steps,time:steps.reduce((n,x)=>n+x.seconds,0),progress:0};
}
export function queueCraft(s,id,cycles){const job=planCraft(s,id,cycles);for(const [item,n] of Object.entries(job.reserved))creditPoints(job,'reserved',item,add(s.bag,item,-n));s.queue.push(job);return job;}
export function cancelCraft(s,index){const job=s.queue[index];if(job){moveAll(job.reserved,s,'bag');s.queue.splice(index,1);}}
export {startResearch, hashWork} from './research.js';
export function coverage(s,p,dir,type='mining-machine'){
  const [fx,fy]=dirs[dir];let target=null;const hits=[];
  for(const [i,v] of s.planet.veins.entries()){
    if(v.buried||v.amount<=0||v.item==='crude-oil')continue;
    const [dx,dy]=delta(p,v),forward=dx*fx+dy*fy;
    const covered=type===largeMiner?insideMine(forward,dy*fx-dx*fy):Math.hypot(dx,dy)<=2.7&&forward<=.75;
    if(!covered)continue;
    if(!target || distance(v,p)<distance(target,p))target=v;hits.push(i);
  }
  return hits.filter(i=>s.planet.veins[i].item===target?.item);
}
/** 蓝图可先规划远处、缺件的设施。地形和占位与普通建造共用，距离及领料在实际施工时检查。 */
export function siteError(s,type,p,dir){
  if(!buildable.includes(type))return '暂未接入该设施';
  if(Math.abs(p.y)>43)return '极区网格无法支撑该设施';
  const existing=tileAt(s,p);
  if(type===distributorType){
    if(!existing||!isDepot(existing.type)||existing.hull===0)return '请选择一座完好的储物仓';
    return existing.distributor?'仓顶已有物流配送器':'';
  }
  if(type===monitorType||type===coaterType){
    if(!existing||!belts.includes(existing.type)||existing.hull===0)return '请选择一格完好的传送带';
    if(existing.rise||existing.entryRise)return '需要一节水平传送带';
    if(type===coaterType&&clearanceError(s.planet,{...existing,coater:true},existing))return '喷涂机上方净空不足';
    return existing.coater||existing.monitor?'此格传送带上已有设备':'';
  }
  if(existing)return '格点已被占用';
  const shape={...p,type};
  if(!validTrackShape(shape,maxBeltLevel(s)))return '高度或坡度超出垂直建造限制';
  const blocked=clearanceError(s.planet,shape);if(blocked)return blocked;
  if(type===shieldType&&claimedShields(s.planet)>=shieldLimit)return '单星球最多有 80 座行星护盾发生器';
  if(s.planet.biome==='gas'){
    if(type!==collector)return '云顶只支持轨道采集器';
    if(p.y!==0||!moorings.includes(p.x))return '请选择赤道上的同步轨道位';
    return '';
  }
  if(type===collector)return '轨道采集器需要巨星赤道';
  if(nearCore(s.planet,p))return '黑雾基地占据了此处';
  if(coreOpen(s.planet,p)&&type!=='geothermal-power-station')return '核心钻井可用地基填平或由地热站接管';
  const reformed=settled(s.planet,p.x,p.y);
  const level=elevation(p.x,p.y,s.planet.seed,s.planet.biome),ocean=environments[s.planet.biome].ocean;
  if(type==='water-pump'){if(reformed||!['water','sulfuric-acid'].includes(ocean)||level>.3)return '抽水站需要靠近可抽取的水面或硫酸海';}
  else if(type==='geothermal-power-station'){if(!heatAt(s.planet,p))return '地热发电站需要建在熔岩池中';}
  else if(!reformed&&ocean&&level<-.05&&!belts.includes(type)&&type!=='wind-turbine')return '水下无法放置，请选择陆地';
  const spacing=mineSiteError(s.planet,{type,x:p.x,y:p.y,dir});
  if(spacing)return spacing;
  if(type.includes('mining-machine') && !coverage(s,p,dir,type).length)return '开采区未覆盖矿脉，试试旋转采矿机';
  if(type==='oil-extractor' && nearestSeep(s.planet,p,occupiedSeeps(s.planet))<0)return '需要对准一处空闲的原油涌泉';
  return '';
}
export function placeError(s,type,p,dir){
  if(!inReach(s,p))return '超出建造范围，请先靠近';
  if(s.planet.construction?.sites[posKey(p)])return '此处有待建蓝图';
  // 只有手持备件覆盖已建实体才换型。蓝图场地检查仍按占位处理，预建不会领走一件后造出两台机器。
  const existing=tileAt(s,p);
  if(canRefit(existing,type))return refitError(s,existing,type);
  return siteError(s,type,p,dir)||(type!==monitorType&&type!==coaterType&&type!==distributorType&&s.mecha.soil+(footingWork(s,type,p)??0)<0?'整平地面所需的沙土不足':'')||(!count(s.bag,type)?'背包中没有'+name(type):'');
}
/** 创建一台已付费、已通过场地检查的空设备。手动建造与建设机共用采集绑定和物理初值。 */
export function put(s,type,p,dir,reservedSeep){
  // 测点附在既有带格上，保留流向、行程、分拣器和当时经过的货物。
  if(type===coaterType){const belt=tileAt(s,p);belt.coater=newCoater(belt);s.planet.revision++;return belt;}
  if(type===monitorType){
    const belt=tileAt(s,p);belt.monitor=newMonitor();s.planet.revision++;return belt;
  }
  if(type===distributorType){
    const depot=tileAt(s,p);depot.distributor=newDistributor(depot);s.planet.revision++;return depot;
  }
  const recipe=machines.includes(type)?forMachine(type).find(r=>unlocked(s,r))?.id:null;
  const tile={type,x:wrap(p.x),y:p.y,dir,input:{},output:{},progress:0,recipe:recipe||null,cargo:null,travel:0,power:0,status:'待机'};
  // 先保存固定原料源，再清理占位树。拆掉采油站时泉眼的衰减仍留在行星上。
  setupEnergyTile(tile,type,s.planet);setDefense(tile);
  // 对钻井建地热站会驱离中继。热效率由原基地等级决定，保留在行星上供拆后重建。
  if(type==='geothermal-power-station'&&coreOpen(s.planet,p)){s.planet.fog.sealed=true;s.planet.fog.well=true;}
  if(type===shieldType)installShield(s.planet,tile);
  if(type===beaconType)tile.beacon=installBeacon(s.planet);
  if(type===splitter)tile.split=newSplitter();
  if(type===pilerType)tile.piler=newPiler();
  if(type==='storage-tank')tile.layers=1;
  if(isLab(type)){tile.layers=1;tile.labWork=[0];}
  if(type==='fractionator')tile.fraction=newFraction(s.planet,tile);
  if(type==='oil-extractor')tile.seep=reservedSeep??nearestSeep(s.planet,p,occupiedSeeps(s.planet));
  // 高架这层的建造只占空域，树木和地面设施仍留在原格。
  if(p.h)tile.h=p.h;
  if(p.rise)tile.rise=p.rise;
  if(p.entryRise)tile.entryRise=p.entryRise;
  if(!p.h)clearFootprint(s.planet,p);
  if(type===collector)setupCollector(s,tile);
  if(stationTypes[type])tile.station=newStation(type);
  if(type.includes('mining-machine'))tile.veins=type===largeMiner&&p.boundVeins?p.boundVeins.slice():coverage(s,p,dir,type);
  if(type===largeMiner)installMine(s,s.planet,tile);
  if(type==='em-rail-ejector') tile.orbit=s.dyson.orbits[0].id;
  if(type==='ray-receiver') Object.assign(tile,{mode:'power',continuous:0,lensTime:0,received:0});
  s.planet.tiles[posKey(p)]=tile; s.planet.revision++;return tile;
}
export function place(s,type,p,dir=0){
  const msg=placeError(s,type,p,dir);requireRule(!msg,msg);
  const existing=tileAt(s,p);
  if(canRefit(existing,type))return refitPart(s,existing,type);
  if(type!==monitorType&&type!==coaterType&&type!==distributorType)gradeFooting(s,p,footingWork(s,type,p));
  add(s.bag,type,-1);s.stats.built++;return put(s,type,p,dir);
}
/** 加装可拆的顶仓。建造位置和背包一次检查，关闭缓存时由普通拆除逻辑归还仓体及库存。 */
export function mountDepot(game,tile){
  requireRule(tile?.type===splitter&&inReach(game,tile),'请靠近四向分流器');
  requireRule(!tile.split.depot,'已安装缓存仓');
  requireRule(count(game.bag,'storage-1')>0,'背包缺少小型储物仓');
  add(game.bag,'storage-1',-1);tile.split.depot=true;game.stats.built++;game.planet.revision++;
}
/** 储物仓扩层使用同型号仓体，配送器始终位于顶层，同一组分拣器继续读写共享库存。 */
export function stackDepot(game,tile){
  requireRule(tile&&isDepot(tile.type)&&tile.hull!==0&&inReach(game,tile),'请靠近完好的储物仓');
  requireRule((tile.layers||1)<capabilitiesOf(game).storageLayers,'已达到垂直建造层数上限');
  requireRule(count(game.bag,tile.type)>0,'缺少同型储物仓');
  requireRule(!clearanceError(game.planet,{...tile,layers:(tile.layers||1)+1},tile),'上方传送带阻挡了仓体扩层');
  add(game.bag,tile.type,-1);tile.layers=(tile.layers||1)+1;game.planet.revision++;game.stats.built++;
}
/** 加建上层消耗一只空罐并沿用底层端口。超出科技层数或建造距离时保持设备与背包不变。 */
export function stackTank(s,t){
  requireRule(t?.type==='storage-tank'&&inReach(s,t),'需要靠近储液罐');
  requireRule((t.layers||1)<capabilitiesOf(s).storageLayers,'已达到垂直建造层数上限');
  requireRule(count(s.bag,'storage-tank')>0,'缺少一只储液罐');
  requireRule(!clearanceError(s.planet,{...t,layers:(t.layers||1)+1},t),'上方传送带阻挡了储液罐扩层');
  add(s.bag,t.type,-1);t.layers=(t.layers||1)+1;s.planet.revision++;s.stats.built++;
}
/** 同型实验室共享底层接口与工作模式。先检查层高、库存和距离，避免半建成的研究站。 */
export function stackLab(game,tile) {
  requireRule(tile && isLab(tile.type) && inReach(game,tile),'需要靠近矩阵研究站');
  requireRule(tile.layers<capabilitiesOf(game).labLayers,'已达到研究站层数上限');
  requireRule(count(game.bag,tile.type)>0,'缺少同型研究站');
  requireRule(!clearanceError(game.planet,{...tile,layers:tile.layers+1},tile),'上方传送带阻挡了研究站扩层');
  add(game.bag,tile.type,-1); tile.layers++; tile.labWork.push(0);
  game.planet.revision++; game.stats.built++;
}
export function pathBetween(a,b,vertical=false){
  const [dx,dy]=delta(a,b),p={...a},out=[{...p}];
  // 先经度后纬度，按较短方向穿越接缝。每一步记录自己的输出朝向。
  for(const [axis,n] of (vertical?[['y',dy],['x',dx]]:[['x',dx],['y',dy]])){
    for(let i=0;i<Math.abs(n);i++){const dir=axis==='x'?(n>0?0:2):(n>0?1:3);out.at(-1).dir=dir;p[axis]+=Math.sign(n);p.x=wrap(p.x);out.push({...p});}
  }
  out.at(-1).dir=out.at(-2)?.dir??0;return out;
}
/** 预览和施工共用同一条坡线，复用首尾既有带节时只计新件。占用冲突在扣件前返回。 */
export function beltQuote(s,type,a,b,vertical=false,lastDir=0){
  const path=pathBetween(a,b,vertical),last=path.length-1;
  if(!belts.includes(type))return {path,cost:0,error:'请选择传送带'};
  if(!last)path[0].dir=lastDir;
  try{profileRoute(s.planet,path,a.h||0,b.h||0);}catch(e){return {path,cost:0,error:e.message};}
  let cost=0;
  for(let i=0;i<=last;i++){
    const p=path[i],existing=tileAt(s,p),reuse=existing&&belts.includes(existing.type)&&existing.hull!==0&&(i===0||i===last);
    if(!inReach(s,p))return {path,cost,error:'超出建造范围，请先靠近'};
    if(reuse){
      if(!last)return {path,cost,error:'此处已有传送带，请选择另一端点'};
      if(i===0){
        const redirects=existing.dir!==p.dir||(existing.rise||0)!==(p.rise||0);
        if(redirects&&(s.planet.tiles[exitKey(existing)]||existing.coater||existing.monitor))return {path,cost,error:'起点已有出带，请从线路末端续接'};
      }else if(existing.dir===(p.dir+2)%4)return {path,cost,error:'不能迎头接入反向传送带'};
      p.join=true;continue;
    }
    const error=s.planet.construction?.sites[posKey(p)]?'此处有待建蓝图':siteError(s,type,p,p.dir);
    if(error)return {path,cost,error};
    cost++;
  }
  return {path,cost,error:cost>count(s.bag,type)?'传送带不足，需要 '+cost+' 节':''};
}
export function layBelt(s,type,a,b,vertical=false,lastDir=0){
  const {path,cost,error}=beltQuote(s,type,a,b,vertical,lastDir);requireRule(!error,error);
  for(const [i,p] of path.entries()){
    if(!p.join){put(s,type,p,p.dir);continue;}
    const existing=tileAt(s,p);
    // 接到在用线时保留货垛、喷点和行程。支线汇入不转动目的带，断头续接只调整起点的下游方向。
    if(i===0){existing.dir=p.dir;if(p.rise)existing.rise=p.rise;else delete existing.rise;}
    else if(existing.dir===p.dir&&p.entryRise)existing.entryRise=p.entryRise;
  }
  add(s.bag,type,-cost);s.stats.built+=cost;s.planet.revision++;return path;
}
export function linkSorter(s,type,a,b){
  const src=tileAt(s,a),dst=tileAt(s,b),[dx,dy]=delta(a,b),span=Math.abs(dx)+Math.abs(dy);
  requireRule(sorters.includes(type)&&count(s.bag,type)>0,'分拣器不足');requireRule(src&&dst,'分拣器两端都需要设施或传送带');
  requireRule(inReach(s,a)&&inReach(s,b),'超出建造范围');requireRule((dx===0||dy===0)&&span>0&&span<=3,'两端需要在同一直线上，相隔 1 至 3 格');
  requireRule((src.h||0)===(dst.h||0),'分拣器两端需位于同一高度');
  requireRule(![src.type,dst.type].some(id=>id==='storage-tank'||id==='fractionator'||id===exchanger||id===splitter||id===pilerType),'该设备通过端口直接连接传送带');
  const from=posKey(a),to=posKey(b);
  const existing=s.planet.links.find(link=>link.from===from&&link.to===to);
  // 两端顺序决定输送方向。反向连接可以独立存在，同向覆盖只交换整件，保留过滤器和当前分拣行程。
  requireRule(!s.planet.construction?.arms[from+'>'+to],'此处有待建分拣器');
  if(canRefit(existing,type))return refitPart(s,existing,type);
  requireRule(!existing,'同向分拣器已存在');
  const l={type,from:posKey(a),to:posKey(b),span,progress:0,filter:null,power:0};s.planet.links.push(l);add(s.bag,type,-1);s.planet.revision++;s.stats.built++;return l;
}
export function remove(s,p){
  const t=tileAt(s,p);requireRule(t&&inReach(s,p),'需要靠近目标设施');const k=posKey(p);
  if(t.coater){
    const feed=t.coater.feed;
    if(feed.cargo)unloadBelt(feed,s,'bag',cargoSize(feed),false);
    delete t.coater;add(s.bag,coaterType,1);s.planet.revision++;return;
  }
  if(t.monitor){delete t.monitor;add(s.bag,monitorType,1);s.planet.revision++;return;}
  if(t.distributor){
    requireRule(!ordersOf(s.planet).some(trip=>trip.home===k||trip.peer===k),'请等待关联的配送机返航');
    add(s.bag,distributorType,1);add(s.bag,botType,t.distributor.bots);moveAll(t.distributor.overflow,s,'bag');
    delete t.distributor;s.planet.revision++;return;
  }
  if(isDepot(t.type)&&t.layers>1){shrinkDepot(t,s);add(s.bag,t.type,1);s.planet.revision++;return;}
  if(t.split?.depot){
    // 从上向下拆除，正在使用的四个带口保留，缓存商品随箱子回到背包。
    add(s.bag,'storage-1',1);moveAll(t.output,s,'bag');t.split.depot=false;s.planet.revision++;return;
  }
  if(isLab(t.type) && t.layers>1){
    // 顶层的未完批次还没有扣料，保留底层共用库存和现有分拣器即可。
    t.layers--;t.labWork.pop();add(s.bag,t.type,1);s.planet.revision++;return;
  }
  if(t.type==='storage-tank'&&t.layers>1){
    // 上层拆除时随层带走溢出的液体，底层相连皮带和仍可容纳的存货保留。
    t.layers--;const id=Object.keys(t.output)[0];
    const surplus=id?Math.max(0,count(t.output,id)-tankCapacity(t)):0;
    if(surplus)moveStock(t.output,s,'bag',id,surplus);
    add(s.bag,t.type,1);s.planet.revision++;return;
  }
  if(t.station){
    const address=portKey(s.space.current,t);
    requireRule(!s.freight.trips.some(trip=>trip.source===address||trip.destination===address),'等待关联运载器返航后可以拆除');
    add(s.bag,'logistics-drone',t.station.drones);add(s.bag,'logistics-vessel',t.station.vessels);add(s.bag,'space-warper',t.station.warpers);
  }
  // 移走端口时同步撤销尚未接上的分拣器，领过件的建设机也随工单回收。
  cancelWorks(s,k);
  for(const l of s.planet.links)if(l.from===k||l.to===k)recoverSorter(s,l);
  s.planet.links=s.planet.links.filter(l=>l.from!==k&&l.to!==k);moveAll(t.input,s,'bag');moveAll(t.output,s,'bag');if(t.cargo)unloadBelt(t,s,'bag',cargoSize(t),false);
  if(t.piler?.item)receiveStock(s,'bag',t.piler.item,t.piler.size,t.piler.inc||0);
  // 只有完全充满的电池能以满电商品回收，拆除部分充电的设施仍返回电池外壳。
  const recoveredCell=t.energyMJ===cellMJ?fullCell:emptyCell;
  if(t.hull!==0)add(s.bag,t.type===emptyCell?recoveredCell:t.type,1);
  if(t.type===exchanger&&t.energyMJ!==null)receiveStock(s,'bag',recoveredCell,1,t.cellInc||0);
  delete s.planet.tiles[k];s.planet.revision++;
}
export function accepts(t,id,s){
  if(t.hull===0)return false;
  if(t.defense)return defenseInput(t,id);
  if(t.type===collector)return false;
  if(t.station){const slot=slotFor(t,id);return !!slot&&freeSpace(t,slot)>0;}
  if(belts.includes(t.type))return t.cargo===null;
  if(t.type==='storage-tank')return canFill(t,id);
  if(t.type===exchanger)return acceptsCell(t,id);
  if(isDepot(t.type))return depotRoom(t,id)>0;
  if (t.type==='em-rail-ejector') return id==='solar-sail' && count(t.input,id)<200;
  if (t.type==='vertical-launching-silo') return id==='small-carrier-rocket' && count(t.input,id)<30;
  if (t.type==='ray-receiver') {
    // 两种透镜共用接收站的催化剂仓。剩余透镜可以用完后换型，手动与分拣器装填遵守同一容量。
    const lens=id==='graviton-lens'||id==='df-dark-fog-lens';
    return lens && s.techs.includes('planetary-ionosphere-utilization') && total(t.input)<20;
  }
  if(generators.includes(t.type))return items[id]?.fuel?.types?.some(f=>items[t.type]?.machine?.fuelTypes?.includes(f))&&count(t.input,id)<50;
  if(t.recipe==='research')return isMatrix(id)&&count(t.input,id)<20*t.layers;
  const cost=recipes[t.recipe]?.in;
  return !!cost?.[id]&&count(t.input,id)<Math.max(20,cost[id]*4)*(t.layers||1);
}
export function insert(t,id,quantity=1,points=0){
  if(belts.includes(t.type))putCargo(t,id,quantity,points);
  else receiveStock(t,t.station||stores.includes(t.type)?'output':'input',id,quantity,points);
}
export function loadMachine(s,t,id,max=50){requireRule(inReach(s,t),'请先靠近设备');let n=0;
  while(n<max&&count(s.bag,id)>0&&accepts(t,id,s)){insert(t,id,1,add(s.bag,id,-1));n++;}requireRule(n,'无可装填物料或设备已满');return n;
}
export function takeOutput(s,t){requireRule(inReach(s,t),'请先靠近设备');requireRule(total(t.output)>0||t.cargo,'没有可取的产物');moveAll(t.output,s,'bag');if(t.cargo)unloadBelt(t,s,'bag',cargoSize(t),false);}
export function changeRecipe(s,t,id){
  requireRule(inReach(s,t),'请先靠近设备');requireRule((id==='research'&&t.type.endsWith('lab')) || (forMachine(t.type).some(r=>r.id===id)&&unlocked(s,recipes[id])),'该设备尚不能执行此配方');
  // 批次完成才正式扣料，切方时退回缓冲区即可，避免吞掉旧原料。
  moveAll(t.input,s,'bag');t.progress=0;t.recipe=id;
  if(t.bonusWork)t.bonusWork=0;
  if(isLab(t.type)){moveAll(t.output,s,'bag');t.labWork.fill(0);}
}
function seedFoundry(s){
  s.techs=['electromagnetism','basic-logistics-system','automatic-metallurgy','basic-assembling-processes','electromagnetic-matrix-technology'];
  s.bag={'iron-ore':40,'copper-ore':30,'iron-ingot':30,'copper-ingot':18,gear:15,'circuit-board':10,'magnetic-coil':12,coal:18,'mining-machine':3,'wind-turbine':6,'tesla-tower':5,'arc-smelter':2,'assembling-machine-1':2,'matrix-lab':1,'storage-1':3,'conveyor-belt-1':80,'sorter-1':18};
  put(s,'mining-machine',{x:-3,y:2},0);for(let x=-2;x<=1;x++)put(s,'conveyor-belt-1',{x,y:2},0);
  put(s,'arc-smelter',{x:1,y:0},0).recipe='iron-ingot';put(s,'storage-1',{x:3,y:0},0);
  put(s,'wind-turbine',{x:-2,y:5},0);put(s,'wind-turbine',{x:2,y:5},0);put(s,'wind-turbine',{x:-3,y:-2},0);put(s,'tesla-tower',{x:0,y:1},0);
  linkSorter(s,'sorter-1',{x:1,y:2},{x:1,y:0});linkSorter(s,'sorter-1',{x:1,y:0},{x:3,y:0});s.stats.built=Object.keys(s.planet.tiles).length+s.planet.links.length;
}
/** 沙盒新档附带一座在建试验站。初始结构点和帆都是该档的既有实物，随后继续走正常供料和验收。 */
function seedSpacePort(s) {
  s.techs=Object.keys(research);
  // 沙盒已持有运输船扩容 XII，前一段 IX–XI 同步记为完成。
  s.science.ranks['logistics-carrier-capacity-9']=11;
  for(const id of ['em-rail-ejector','vertical-launching-silo','ray-receiver','artificial-star']) s.bag[id]=4;
  // 恒星工程沙盒的飞行物资也要走真实背包和核心回路，便于来回验证异星建厂。
  Object.assign(s.mecha,{energy:capabilitiesOf(s).coreMJ,fuel:{'antimatter-fuel-rod':10}});
  Object.assign(s.bag,{'space-warper':24,'solar-sail':400,'small-carrier-rocket':200,'graviton-lens':12,'antimatter-fuel-rod':8});
  const power=put(s,'artificial-star',{x:4,y:3},0);power.input['antimatter-fuel-rod']=5;
  const silo=put(s,'vertical-launching-silo',{x:3,y:2},0);silo.input['small-carrier-rocket']=30;
  const ejector=put(s,'em-rail-ejector',{x:4,y:1},0);ejector.input['solar-sail']=180;
  put(s,'ray-receiver',{x:5,y:3},0);
  // 与发射场共网，玩家在同一地点即可比较地面光伏、戴森球射线和日落后的供电。
  put(s,'solar-panel',{x:2,y:1},0);
  seedOrbitalYard(s);
  s.stats.built=Object.keys(s.planet.tiles).length+s.planet.links.length;
}
