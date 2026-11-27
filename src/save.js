import {validGrip} from './sorter-motion.js';
import {validProduction} from './production-log.js';
import {validatePersonal,validateDistribution} from './distribution-save.js';
import {coaterType,validateCoater,validInc} from './coater.js';
import {restorePoints} from './stock.js';
import {cellKey,validTrackShape,maxBeltLevel,clearanceError} from './belt-level.js';
import {cargoSize} from './belt-cargo.js';
import {monitorType,validateMonitor} from './traffic.js';
import {pilerType,validatePiler} from './piler.js';
import {items,belts,sorters,buildable,recipes} from './catalog.js';
import {elevation,key,newReform} from './world.js';
import {newHiveNetwork} from './space-hive.js';
import {validateHives} from './hive-save.js';
import {validShield} from './planet-shield.js';
import {validateBattlefield} from './fog-save.js';
import {fogModes} from './fog-rules.js';
import {validReform,soilLimit} from './reform.js';
import {forestOf,clearFootprint} from './forest.js';
import {splitter,validateSplitter} from './splitter.js';
import {liquids,tankCapacity} from './liquid-ports.js';
import {isSeep,restoreOldSeeps} from './oil.js';
import {newNavigation,bodyOf,sphereOf} from './navigation.js';
import {homeSystemOf,starOf} from './cluster.js';
import {validLift} from './surface-motion.js';
import {capabilitiesOf} from './upgrades.js';
import {newSphere,orbitById} from './sphere.js';
import {validateSphere} from './sphere-save.js';
import {clusterOutput} from './mission-record.js';
import {newFreight} from './freight.js';
import {validateFreight} from './freight-save.js';
import {newScience} from './research.js';
import {validateScience,upgradeScience9} from './research-save.js';
import {largeMiner,installMine} from './advanced-miner.js';
import {coverage} from './actions.js';
import {collector,moorings,gasProfile} from './gas.js';
import {isLab} from './lab.js';
import {validateWorks} from './construction-save.js';
import {emptyCell,fullCell,cellMJ,exchanger,exchangeModes,heatAt} from './energy.js';
import {newMeter,validMeter} from './matrix-meter.js';
import {validResource} from './sector-rules.js';
const PREFIX='planet-foundry-v1/';
import {beaconType,beaconConfig} from './beacons.js';
function requireValue(ok){if(!ok)throw new Error('存档格式不兼容或包含无效数据');}
const number=v=>typeof v==='number'&&Number.isFinite(v);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function stock(bag){requireValue(record(bag)&&Object.entries(bag).every(([id,n])=>Object.hasOwn(items,id)&&number(n)&&n>=0&&Number.isSafeInteger(n)));}
function point(p){requireValue(record(p)&&number(p.x)&&number(p.y)&&Math.abs(p.x)<=90&&Math.abs(p.y)<=45);}
function validatePlanet(p,body,s) {
  requireValue(validProduction(p?.production,s.elapsed));
  requireValue(p?.seed===body.seed&&p.biome===body.biome&&record(p.tiles)&&Array.isArray(p.veins)&&Array.isArray(p.links)&&Number.isSafeInteger(p.revision));
  requireValue(validReform(p));
  if(p.biome==='gas')requireValue(!p.veins.length&&!p.links.length&&Object.keys(p.tiles).length<=40);
  for(const v of p.veins){
    point(v);
    // 水世界石笋可天然沉在海床，首次到访的存档也必须能还原。人工埋矿仍需已铺设的同格地基。
    const seabed=p.biome==='aquatica'&&v.item==='spiniform-stalagmite-crystal'&&elevation(v.x,v.y,p.seed,p.biome)<.08;
    requireValue(items[v.item]?.category==='components'&&(v.buried===undefined||v.buried===true&&(seabed||p.reform.cells[key(v.x,v.y)]>=0)));
    requireValue(isSeep(v)?number(v.rate)&&v.rate>=.1:Number.isSafeInteger(v.amount)&&v.amount>=0);
  }
  // 树木编号对应确定性生成的树林。空档跳过生成以减少首次载入成本，重复或越界编号会造成多次领取。
  requireValue(Array.isArray(p.felled));
  if(p.felled.length){const forest=forestOf(p);requireValue(forest.removed.size===p.felled.length&&p.felled.every(i=>Number.isInteger(i)&&!!forest.trees[i]));}
  const occupied=new Set();
  if(p.lastLanding)point(p.lastLanding);
  if(p.beaconSerial!==undefined)requireValue(Number.isSafeInteger(p.beaconSerial)&&p.beaconSerial>=0);
  const beltLimit=maxBeltLevel(s);
  for(const [k,t] of Object.entries(p.tiles)){point(t);requireValue(validTrackShape(t,beltLimit)&&cellKey(t)===k&&buildable.includes(t.type)&&!sorters.includes(t.type)&&Number.isInteger(t.dir)&&t.dir>=0&&t.dir<4);stock(t.input);stock(t.output);restorePoints(t,'input');restorePoints(t,'output');
    if(t.distributor)restorePoints(t.distributor,'overflow');
    requireValue((t.type===beaconType)===!!t.beacon);
    if(t.beacon){requireValue(p.beaconSerial>0);t.beacon=beaconConfig(t.beacon);}
    if(t.coater)validateCoater(t);
    requireValue(t.type!==coaterType&&validInc(t.inc,cargoSize(t)));
    for(const grade of [t.cellInc,t.lensInc])requireValue(validInc(grade,1));
    if(t.bonusWork!==undefined)requireValue(number(t.bonusWork)&&t.bonusWork>=0&&t.bonusWork<1);
    if(t.bonusCycles!==undefined)requireValue(Number.isSafeInteger(t.bonusCycles)&&t.bonusCycles>=0);
    if(t.accelerate!==undefined)requireValue(typeof t.accelerate==='boolean');
    requireValue((!t.recipe||t.recipe==='research'||Object.hasOwn(recipes,t.recipe))&&(!t.cargo||Object.hasOwn(items,t.cargo))&&number(t.progress)&&number(t.travel));
    requireValue((p.biome==='gas')===(t.type===collector));
    if(t.type===collector)requireValue(t.y===0&&moorings.includes(t.x));
    if(t.type===emptyCell||t.type===exchanger){
      const bound=number(t.energyMJ)&&t.energyMJ>=0&&t.energyMJ<=cellMJ;
      requireValue(number(t.flowKW)&&Math.abs(t.flowKW)<=(t.type===exchanger?108000:2250)+1e-6);
      if(t.type===exchanger){
        requireValue(Object.hasOwn(exchangeModes,t.mode)&&(bound||t.energyMJ===null));
        for(const buffer of [t.input,t.output])requireValue(Object.entries(buffer).every(([id,n])=>(id===emptyCell||id===fullCell)&&n<=20));
      }else requireValue(bound);
    }
    // 满电物品放置后已归一化为普通蓄电器，不能伪造额外建筑或从非热源读取倍率。
    if(t.type===fullCell)requireValue(false);
    if(t.type==='geothermal-power-station')requireValue(t.efficiency>=0&&Math.abs(t.efficiency-heatAt(p,t))<1e-5);
    // 旧档没有 stack 字段，一格有货即为一件。监测器随带格保存，不可单独作为设施占位。
    requireValue(t.type!==monitorType&&(!t.monitor||belts.includes(t.type)));
    if(t.monitor)validateMonitor(t.monitor);
    if(t.stack!==undefined)requireValue(belts.includes(t.type)&&Number.isInteger(t.stack)&&(t.cargo?t.stack>=1&&t.stack<=4:t.stack===0));
    if(t.type===pilerType)validatePiler(t.piler,id=>['components','buildings'].includes(items[id]?.category));
    if(t.type===splitter)validateSplitter(t);
    if(t.type==='fractionator'){
      const f=t.fraction;
      requireValue(record(f)&&Number.isInteger(f.seed)&&f.seed>=0&&f.seed<=0xffffffff&&Number.isSafeInteger(f.passed)&&Number.isSafeInteger(f.converted)&&f.converted>=0&&f.converted<=f.passed);
    }
    if(isLab(t.type)){
      requireValue(Number.isInteger(t.layers)&&t.layers>=1&&t.layers<=capabilitiesOf(s).labLayers&&Array.isArray(t.labWork)&&t.labWork.length===t.layers&&t.labWork.every(p=>number(p)&&p>=0&&p<1));
    }
    if(t.type==='storage-tank'){
      // 五版以前的罐均为一层，原库存仍可从同一端口取出。
      t.layers??=1;
      const fluids=Object.entries(t.output);
      requireValue(Number.isInteger(t.layers)&&t.layers>=1&&t.layers<=capabilitiesOf(s).storageLayers&&fluids.length<=1&&fluids.every(([id,n])=>liquids.has(id)&&n<=tankCapacity(t)));
    }
    if(t.type==='oil-extractor'){
      requireValue(Number.isInteger(t.seep)&&p.veins[t.seep]&&isSeep(p.veins[t.seep])&&!occupied.has(t.seep));occupied.add(t.seep);
    }
    if(t.type==='em-rail-ejector')requireValue(!!orbitById(sphereOf(s,body.star),t.orbit));
    if(t.lensType!==undefined)requireValue(t.type==='ray-receiver'&&['df-dark-fog-lens','graviton-lens'].includes(t.lensType));
    if(t.type==='ray-receiver')requireValue(['power','photon'].includes(t.mode)&&number(t.continuous)&&t.continuous>=0&&t.continuous<=1&&number(t.lensTime)&&t.lensTime>=0&&t.lensTime<=600&&number(t.received)&&t.received>=0);
    if(t.oreDebt!==undefined)requireValue(number(t.oreDebt)&&t.oreDebt>=0&&t.oreDebt<1);
    if(t.veins)requireValue(Array.isArray(t.veins)&&t.veins.every(i=>Number.isSafeInteger(i)&&p.veins[i]));}
  validateDistribution(p,capabilitiesOf(s).storageLayers);
  validateBattlefield(s,p);validateWorks(s,p);requireValue(validShield(p));
  // 高度净空要在工地也读入后再查，否则一份存档可把两座未完工桥压进同层。
  for(const t of [...Object.values(p.tiles),...Object.values(p.construction?.sites||{})])requireValue(!clearanceError(p,t));
  for(const l of p.links)requireValue(sorters.includes(l.type)&&Object.hasOwn(p.tiles,l.from)&&Object.hasOwn(p.tiles,l.to)&&l.span>=1&&l.span<=3&&number(l.progress)&&l.progress>=0&&l.progress<=1&&validGrip(l.hand)&&(!l.filter||Object.hasOwn(items,l.filter)));
}

/** 导入文件和本地存档共用边界校验。先完整检查后切换场景，坏档不能中途覆盖正在玩的游戏。 */
export function decode(raw){
  requireValue(typeof raw==='string'&&raw.length<=12000000);const s=JSON.parse(raw);
  requireValue([1,2,3,4,5,6,7,8,9,10,11,12,13,14].includes(s?.version)&&Number.isInteger(s.seed)&&s.seed>0&&s.seed<=99999999&&['landing','foundry','sandbox','freight','refinery','energy','gas','blueprint','sorting','piling','coating','distribution','mission','relic','veins','mining','geology','coast','defense','shield','bridge','signal','refit'].includes(s.scenario)&&number(s.elapsed)&&s.elapsed>=0);
  // 首版地表档尚无恒星账本。只给旧版本补空工程，新版本缺少账本意味着损坏。
  if (s.version === 1) { s.dyson ??= newSphere(); s.version = 2; }
  // 单星旧档只有初始行星。升级只补星图与飞行状态，已有矿量、壳面和工厂完全沿用原账本。
  if(s.version===2){s.space=newNavigation();s.planet.biome='mediterranean';s.mecha.flying=false;s.version=3;}
  // 第三版之前的行星没有物流塔，在保留全部旧工厂的前提下从空航班清单起步。
  if(s.version===3){s.freight=newFreight();s.version=4;}
  // 四版及更早存档中树木仅供显示，油井按固定速度开采。沿用旧实体坐标与在制品，再绑定真实资源点。
  if(s.version===4){
    for(const planet of [s.planet,...Object.values(s.space.parked)]){
      planet.felled=[];restoreOldSeeps(planet);
      for(const tile of Object.values(planet.tiles))clearFootprint(planet,tile);
    }
    s.mecha.timber=null;s.version=5;
  }
  // 旧版研究为逐步扣料且只有单层。保留已付物资和底层生产进度，从空预留仓继续运行。
  if(s.version===5){
    s.science=newScience();
    for(const planet of [s.planet,...Object.values(s.space.parked)])for(const tile of Object.values(planet.tiles)){
      if(isLab(tile.type)){tile.layers=1;tile.labWork=[tile.progress];}
    }
    s.version=6;
  }
  // 原有天体 ID 与母星系生成序列不变，已有戴森云、在途帆和货单直接属于起始恒星系。
  if(s.version===6){s.space.starCount=64;s.space.spheres={};s.version=7;}
  // 七版以前没有土方账本。保留旧工厂和原始地表，只给后来发生的整地作业记账。
  if(s.version===7){
    for(const p of [s.planet,...Object.values(s.space.parked)])p.reform=newReform();
    s.mecha.soil=0;s.version=8;
  }
  // 八版工厂没有战斗。沿用和平档可避免旧厂在离线升级后意外受袭。
  if(s.version===8){s.fogMode='off';for(const p of [s.planet,...Object.values(s.space.parked)])p.fog=null;s.version=9;}
  if(s.version===9){upgradeScience9(s);s.version=10;}
  // 旧版已封闭的钻井视为中继早已撤离。载入旧档不能凭空退回一艘已离去的船。
  if(s.version===10){s.space.fogNet=newHiveNetwork();for(const p of [s.planet,...Object.values(s.space.parked)])if(p.fog?.sealed)p.fog.relayHP=0;s.version=11;}
  // v11 的平面地址即 v12 的零层地址，无须重写成千上万格地面工厂。
  if(s.version===11)s.version=12;
  // 旧星区按标准资源开局。沿用每个矿点的现有余量，仅从读档时起逐秒采样矩阵。
  if(s.version===12){s.resource='1';s.meta=newMeter(s);s.version=13;}
  // v13 前的大矿机按普通矿机保存。保留矿量、库存、喷点和进度，在既有矿种上建立新的取货仓位。
  if(s.version===13){
    for(const planet of [s.planet,...Object.values(s.space.parked)]){
      for(const tile of Object.values(planet.tiles))if(tile.type===largeMiner)installMine(s,planet,tile);
      for(const node of Object.values(planet.construction?.sites||{}))if(node.type===largeMiner){
        node.boundVeins=coverage({...s,planet},node,node.dir,node.type);node.miner={speed:100,stack:0,mode:'supply'};
      }
    }
    s.version=14;
  }
  requireValue(validResource(s.resource)&&validMeter(s));
  requireValue(Object.hasOwn(fogModes,s.fogMode)&&(!s.mecha.battle||['guard','base','relay'].includes(s.mecha.battle)));
  requireValue(Number.isSafeInteger(s.mecha.soil)&&s.mecha.soil>=0&&s.mecha.soil<=soilLimit);
  requireValue(record(s.space)&&record(s.space.parked)&&Number.isInteger(s.space.starCount)&&s.space.starCount>=32&&s.space.starCount<=64&&record(s.space.spheres));
  validateSphere(s.dyson);
  const active=homeSystemOf(s.space.current),visited=new Set(Object.keys(s.space.parked).map(homeSystemOf));
  requireValue(starOf(s,active)?.luminosity===s.dyson.luminosity);
  for(const [id,sphere] of Object.entries(s.space.spheres)){
    requireValue(id!==active&&visited.has(id)&&starOf(s,id)?.luminosity===sphere?.luminosity);validateSphere(sphere);
  }
  for(const id of visited)requireValue(id===active||Object.hasOwn(s.space.spheres,id));
  requireValue(Array.isArray(s.techs)&&s.techs.every(id=>items[id]?.technology));
  validatePersonal(s.mecha.logistics);
  stock(s.bag);restorePoints(s,'bag');restorePoints(s.mecha,'fuel');restorePoints(s.science,'reserve');point(s.mecha);const m=s.mecha;stock(m.fuel);requireValue(number(m.burn)&&number(m.energy)&&m.energy>=0&&m.energy<=capabilitiesOf(s).coreMJ&&typeof m.flying==='boolean'&&number(m.progress));if(m.target)point(m.target);
  if(m.cellFuel!==undefined)requireValue(typeof m.cellFuel==='boolean'&&(!m.cellFuel||m.burn>0&&m.burn<=cellMJ));
  requireValue(record(s.space)&&record(s.space.parked));
  const body=bodyOf(s,s.space.current);requireValue(!!body);
  if(body.biome==='gas'&&!s.space.flight)requireValue(m.flying);
  if(m.intake!=null)requireValue(body.biome==='gas'&&!s.space.flight&&gasProfile(body).gases.some(g=>g.item===m.intake)&&number(m.intakeWork)&&m.intakeWork>=0&&m.intakeWork<1);
  validatePlanet(s.planet,body,s);
  requireValue(validLift(s));
  requireValue(m.mining===null||Number.isInteger(m.mining)&&!!s.planet.veins[m.mining]&&!isSeep(s.planet.veins[m.mining]));
  if(m.timber!==null){const forest=forestOf(s.planet);requireValue(m.mining===null&&Number.isInteger(m.timber)&&!!forest.trees[m.timber]&&!forest.removed.has(m.timber)&&!s.space.flight);}
  for(const [id,planet] of Object.entries(s.space.parked)){
    const other=bodyOf(s,id);requireValue(other&&other!==body);validatePlanet(planet,other,s);
  }
  validateHives(s);validateFreight(s);
  const flight=s.space.flight;
  if(flight!==null){
    requireValue(record(flight)&&flight.from===body.id&&capabilitiesOf(s).sailMS>0);
    const manual=flight.heading!==undefined;
    // 手动帆航可在深空停船且无需目的地。持久化的单位向量决定下一步位移，长度失真会绕过引擎航速限制。
    if(manual)requireValue(Array.isArray(flight.heading)&&flight.heading.length===3&&flight.heading.every(number)&&Math.abs(Math.hypot(...flight.heading)-1)<1e-7&&!flight.autoWarp);
    requireValue(manual&&flight.to===null||!!bodyOf(s,flight.to));
    requireValue(Array.isArray(flight.position)&&flight.position.length===3&&flight.position.every(number));
    for(const key of ['warp','autoWarp'])if(flight[key]!==undefined)requireValue(typeof flight[key]==='boolean'&&(!flight[key]||capabilitiesOf(s).warpMS>0));
    requireValue(number(flight.speed)&&flight.speed>=0&&flight.speed<=(flight.warp?capabilitiesOf(s).warpMS:capabilitiesOf(s).sailMS)&&number(flight.travelled)&&flight.travelled>=0&&!m.flying&&!m.target&&m.mining===null);
  }
  requireValue(Array.isArray(s.queue)&&[1,2,4].includes(s.speed));
  validateScience(s);
  for(const job of s.queue){requireValue(Object.hasOwn(recipes,job.id)&&number(job.progress)&&number(job.time)&&job.time>0);stock(job.reserved);stock(job.produced);restorePoints(job,'reserved');
    // 旧单可能只有总收支。带分步清单的订单将用于复原中间件产消，必须先能解析每一张配方。
    if(job.steps!==undefined)requireValue(Array.isArray(job.steps)&&job.steps.every(step=>step&&Object.hasOwn(recipes,step.id)&&Number.isSafeInteger(step.count)&&step.count>0));
  }
  stock(s.stats.made);stock(s.stats.mined);requireValue(Number.isSafeInteger(s.stats.built));return s;
}
let indexCache;
function reportFor(game) {
  const {power,spheres,sails} = clusterOutput(game);
  return {power,spheres,sails,resource:game.resource,starCount:game.space?.starCount||64,elapsed:game.elapsed,finished:!!game.science?.completion};
}
function slotInfo(slot, entry) {
  const info={slot,date:entry.date,scenario:entry.scenario,seed:entry.seed,report:null};
  // 旧槽没有摘要时仅在首次打开目录计算一次。原档损坏仍保留入口，由正式读档给出具体错误。
  try {info.report=entry.report || (entry.state?.dyson ? reportFor(entry.state) : null);} catch {}
  return info;
}
/** 目录只保留小摘要。系统面板刷新不再反复解析每个槽的全部星球工厂；跨窗口写入会作废本窗口的目录。 */
export function savedGames(){
  if(!indexCache){
    const next=new Map();
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key?.startsWith(PREFIX))continue;
      try{const slot=key.slice(PREFIX.length);next.set(slot,slotInfo(slot,JSON.parse(localStorage.getItem(key))));}
      catch{/* 单个不可解析的槽不影响其他着陆档。 */}
    }
    indexCache=next;
  }
  return [...indexCache.values()].sort((a,b)=>b.date-a.date);
}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
  if(event.key===null || event.key.startsWith(PREFIX))indexCache=null;
});
export function storeGame(slot,s){
  if(!slot)throw new Error('尚未进入存档');
  const entry={date:Date.now(),seed:s.seed,scenario:s.scenario,report:reportFor(s),state:s};
  // 序列化和磁盘配额均可能失败，成功写入后才能在列表里展示新成绩。
  localStorage.setItem(PREFIX+slot,JSON.stringify(entry));
  indexCache?.set(slot,slotInfo(slot,entry));
}
export function readGame(slot){const record=JSON.parse(localStorage.getItem(PREFIX+slot)||'null');if(!record)throw new Error('没有找到这个存档');return decode(JSON.stringify(record.state));}