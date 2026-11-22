import {key,distance,delta} from './world.js';
import {count} from './stock.js';
import {name,recipes,unlocked} from './catalog.js';
import {isLab} from './lab.js';
import {nearestSeep,occupiedSeeps} from './oil.js';
import {capabilitiesOf} from './upgrades.js';
import {footingWork,gradeFooting} from './reform.js';
import {claimedShields,shieldLimit,shieldType} from './planet-shield.js';
import {largeMiner,isMiningTerminal,mineConflict} from './advanced-miner.js';
import {siteError,coverage,put,inReach} from './actions.js';
import {checkLimit,stampLayout,fitsLatitude,validLink} from './blueprint.js';
import {configureFinished,insist} from './blueprint-config.js';

const schedules=new WeakMap();
const newWorks=()=>({sites:{},arms:{},drones:[],revision:0,cursor:0,delay:0});
import {cellKey} from './belt-level.js';
export const placeKey=cellKey;
export const armKey=(from,to)=>from+'>'+to;
import {findJob,refund,partCount,hasParts,accountParts} from './construction-orders.js';

function technologyError(game,node){
  const cap=capabilitiesOf(game);
  if(node.layers>(isLab(node.type)?cap.labLayers:cap.storageLayers))return '垂直建造等级不足';
  if(node.recipe&&node.recipe!=='research'&&!unlocked(game,recipes[node.recipe]))return '配方尚未解锁';
  if(node.mode==='photon'&&!game.techs.includes('dirac-inversion-mechanism'))return '需要狄拉克逆变机制';
  return '';
}
/** 只检查地形、几何和科技。物资可以随后带来，因此缺件另列，不把临时缺货当成不可放置的红色冲突。 */
export function surveyStamp(game,pattern,anchor,turn=0,mirror=false){
  checkLimit(game,pattern);
  const nodes=stampLayout(pattern,anchor,turn,mirror),errors=new Map(),cost={},p=game.planet;
  const latitudeIssue=!fitsLatitude(pattern,nodes,turn),seen=new Set();
  let seeps,shieldCount;
  const plannedTerminals=[];
  for(const node of nodes){
    const k=placeKey(node);
    let problem=latitudeIssue?'纬度网格比例不兼容':'';
    if(!problem&&(seen.has(k)||p.construction?.sites[k]))problem='此处已有待建设施';
    if(!problem)problem=siteError(game,node.type,node,node.dir)||technologyError(game,node);
    if(!problem&&node.type===shieldType){
      shieldCount??=claimedShields(p);
      if(++shieldCount>shieldLimit)problem='单星球最多有 80 座行星护盾发生器';
    }
    if(!problem&&isMiningTerminal(node.type)){
      for(const peer of plannedTerminals){problem=mineConflict(node,peer);if(problem)break;}
      if(!problem){
        plannedTerminals.push(node);
        // 从规划到无人机完工期间矿脉可能被掩埋或采空，保留原矿种和编号便于随后重新显矿。
        if(node.type===largeMiner)node.boundVeins=coverage(game,node,node.dir,node.type);
      }
    }
    if(!problem&&node.type==='oil-extractor'){
      seeps??=occupiedSeeps(p);node.seep=nearestSeep(p,node,seeps);
      if(node.seep<0)problem='选区内的油泉已被相邻井口占用';else seeps.add(node.seep);
    }
    if(problem)errors.set(k,problem);
    seen.add(k);accountParts(cost,node,1);
  }
  const arms=pattern.links.map(l=>{
    const a=nodes[l.from],b=nodes[l.to];
    const span=validLink(l.type,a,b,l.filter);
    cost[l.type]=(cost[l.type]||0)+1;
    return {type:l.type,from:placeKey(a),to:placeKey(b),span,filter:l.filter};
  });
  const missing=Object.fromEntries(Object.entries(cost).map(([id,n])=>[id,n-count(game.bag,id)]).filter(([,n])=>n>0));
  return {nodes,arms,errors,missing};
}
/** 先整体验证再写入工地。施工订单只占地，机队领件才扣库存；一处冲突不会留下半份蓝图。 */
export function scheduleBlueprint(game,pattern,anchor,turn=0,mirror=false){
  insist(!game.space.flight,'航行中无法规划地表');
  const result=surveyStamp(game,pattern,anchor,turn,mirror);
  const conflict=result.errors.entries().next();
  if(!conflict.done)throw new Error(conflict.value[1]+'（'+conflict.value[0]+'）');
  const works=game.planet.construction??=newWorks();
  for(const node of result.nodes)works.sites[placeKey(node)]=node;
  for(const arm of result.arms)works.arms[armKey(arm.from,arm.to)]=arm;
  works.revision++;works.layout=(works.layout||0)+1;works.delay=0;
  return result.nodes.length+result.arms.length;
}
function targetFor(game,c,id){
  const arm=c.arms[id];
  if(!arm)return c.sites[id];
  const a=game.planet.tiles[arm.from],b=game.planet.tiles[arm.to];
  return a&&b&&inReach(game,a)?b:null;
}
function finish(game,c,id){
  const node=c.sites[id];
  if(node){
    const t=put(game,node.type,node,node.dir,node.seep);configureFinished(game,t,node);
    game.stats.built+=partCount(node);delete c.sites[id];
  }else{
    const arm=c.arms[id];
    game.planet.links.push({...arm,progress:0,power:0});game.planet.revision++;game.stats.built++;delete c.arms[id];
  }
  c.revision++;
  const index=schedules.get(c);if(index)index.finished++;
}
function advanceDrones(game,c,dt){
  for(let i=c.drones.length-1;i>=0;i--){
    const d=c.drones[i];d.left-=dt;
    if(d.left>0)continue;
    if(d.back)c.drones.splice(i,1);
    else{finish(game,c,d.job);d.back=true;d.left+=d.leg;}
  }
}
function listJobs(c){
  // 完工只标记已处理的索引，超过半数才重整。大量建筑连续竣工时仍能控制每步扫描的工作量。
  const old=schedules.get(c);
  if(old&&old.layout===(c.layout||0)&&old.finished*2<old.keys.length)return old.keys;
  const keys=[...Object.keys(c.sites),...Object.keys(c.arms)];
  schedules.set(c,{layout:c.layout||0,finished:0,keys});return keys;
}
/** 固定步推进建造机。离开行星会收回在途领件。调度每 0.2 秒最多巡查 96 单，远处数千个虚影不会独占主线程。 */
export function runConstruction(game,dt){
  const c=game.planet.construction;if(!c)return;
  if(game.space.flight){for(const d of c.drones)refund(game,c,d);c.drones.length=0;return;}
  advanceDrones(game,c,dt);c.delay-=dt;if(c.delay>0)return;c.delay=.2;
  const jobs=listJobs(c),limits=capabilitiesOf(game);
  if(!jobs.length){if(!c.drones.length)delete game.planet.construction;return;}
  const busy=new Set(c.drones.map(d=>d.job));
  for(let n=0;n<Math.min(jobs.length,96)&&c.drones.length<limits.builders;n++){
    c.cursor%=jobs.length;const id=jobs[c.cursor++];if(busy.has(id))continue;
    const job=findJob(c,id);if(!job)continue;
    const target=targetFor(game,c,id);
    if(!target||!inReach(game,target)||!hasParts(game.bag,job))continue;
    // 球面一格约 6.98 米。按网页机甲能源单位预付整次往返飞行；电量不足时工地保留并等待供能。
    const metres=distance(game.mecha,target)*200*Math.PI/90;
    const energy=.08+metres*.006;if(game.mecha.energy<energy)continue;
    // 开始施工即平整地面。沙土不足的订单继续排队，撤单归还机器零件，已整平的土方保留。
    if(c.sites[id]){
      const work=footingWork(game,job.type,job);
      if(work!==null&&game.mecha.soil+work<0)continue;
      gradeFooting(game,job,work);
    }
    accountParts(game.bag,job,-1);game.mecha.energy-=energy;
    const leg=Math.max(.2,metres/limits.builderMS);
    c.drones.push({job:id,back:false,leg,left:leg,x:game.mecha.x,y:game.mecha.y,tx:target.x,ty:target.y});busy.add(id);
  }
}
