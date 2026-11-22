import {facilityConfig,integer} from './blueprint-config.js';
import {cellKey,maxBeltLevel,validTrackShape} from './belt-level.js';
import {validLink} from './blueprint.js';
import {key,distance} from './world.js';
import {capabilitiesOf} from './upgrades.js';
import {collector,moorings} from './gas.js';
import {isLab} from './lab.js';
import {largeMiner,insideMine} from './advanced-miner.js';
import {dirs,delta} from './world.js';
import {isSeep} from './oil.js';

const map=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const coord=(x,y)=>Number.isFinite(x)&&x>=-90&&x<90&&Number.isFinite(y)&&Math.abs(y)<=45;
function requireWork(ok){if(!ok)throw new Error('存档中的建设订单或建设机领件无效');}
/** 在读档边界重建工地引用，拒绝重叠占位、同一设备被两架机领取、油井重复绑定和失去端点的分拣器。 */
export function validateWorks(game,planet){
  const work=planet.construction;
  if(work===undefined)return;
  const limits=capabilitiesOf(game);
  requireWork(map(work)&&map(work.sites)&&map(work.arms)&&Array.isArray(work.drones));
  requireWork(integer(work.revision,0,Number.MAX_SAFE_INTEGER)&&integer(work.layout??0,0,Number.MAX_SAFE_INTEGER)&&integer(work.cursor,0,500000)&&Number.isFinite(work.delay)&&work.delay>=0&&work.delay<=.201);
  const reserved=new Set(Object.values(planet.tiles).filter(node=>node.type==='oil-extractor').map(node=>node.seep));
  for(const [id,node] of Object.entries(work.sites)){
    requireWork(integer(node.x,-90,89)&&integer(node.y,-43,43)&&id===cellKey(node)&&validTrackShape(node,maxBeltLevel(game))&&!planet.tiles[id]);
    const clean=facilityConfig(node);
    requireWork(!clean.layers||clean.layers<=(isLab(clean.type)?limits.labLayers:limits.storageLayers));
    requireWork((planet.biome==='gas')===(node.type===collector));
    if(node.type===collector)requireWork(node.y===0&&moorings.includes(node.x));
    if(node.type==='oil-extractor'){
      const seep=planet.veins[node.seep];
      requireWork(integer(node.seep,0,planet.veins.length-1)&&isSeep(seep)&&distance(node,seep)<1.5&&!reserved.has(node.seep));
      reserved.add(node.seep);clean.seep=node.seep;
    }
    if(node.type===largeMiner){
      const ids=node.boundVeins, [fx,fy]=dirs[node.dir];
      requireWork(Array.isArray(ids)&&new Set(ids).size===ids.length);
      for(const i of ids){
        requireWork(integer(i,0,planet.veins.length-1));
        const v=planet.veins[i],[dx,dy]=delta(node,v);
        requireWork(!isSeep(v)&&v.item===planet.veins[ids[0]].item&&insideMine(dx*fx+dy*fy,dy*fx-dx*fy));
      }
      // 隐藏或耗尽不会改变预约的矿种，读档后施工仍绑定原矿点。
      clean.boundVeins=ids;
    }
    work.sites[id]={...clean,x:node.x,y:node.y};
  }
  const existing=new Set(planet.links.map(arm=>arm.from+'>'+arm.to));
  const lookup=id=>work.sites[id]||planet.tiles[id];
  for(const [id,arm] of Object.entries(work.arms)){
    requireWork(id===arm.from+'>'+arm.to&&!existing.has(id));
    requireWork(validLink(arm.type,lookup(arm.from),lookup(arm.to),arm.filter)===arm.span);
  }
  const claimed=new Set();
  requireWork(work.drones.length<=limits.builders&&(!work.drones.length||planet===game.planet));
  for(const drone of work.drones){
    requireWork(typeof drone.job==='string'&&typeof drone.back==='boolean'&&coord(drone.x,drone.y)&&coord(drone.tx,drone.ty));
    requireWork(Number.isFinite(drone.leg)&&drone.leg>0&&Number.isFinite(drone.left)&&drone.left>0&&drone.left<=drone.leg+1e-7);
    if(drone.back)continue;
    const job=work.sites[drone.job]||work.arms[drone.job];
    const target=job?.to?planet.tiles[job.to]:job;
    requireWork(target&&target.x===drone.tx&&target.y===drone.ty&&!claimed.has(drone.job));
    claimed.add(drone.job);
  }
}
