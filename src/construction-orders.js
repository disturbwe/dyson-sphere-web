import {add,count} from './stock.js';

// 一处工地可带异型顶仓。设计用料、整单领件和中途退款都走同一本清单，避免跨档复制免费仓体。
export function partCount(job){return (job.layers||1)+Number(!!job.split?.depot)+Number(!!job.monitor)+Number(!!job.coater)+Number(!!job.distributor);}
export function hasParts(bag,job){
  return count(bag,job.type)>=(job.layers||1)&&(!job.split?.depot||count(bag,'storage-1')>=1)&&(!job.coater||count(bag,'spray-coater')>=1)&&(!job.monitor||count(bag,'traffic-monitor')>=1)&&(!job.distributor||count(bag,'logistics-distributor')>=1);
}
export function accountParts(bag,job,sign){
  add(bag,job.type,sign*(job.layers||1));
  if(job.split?.depot)add(bag,'storage-1',sign);
  if(job.coater)add(bag,'spray-coater',sign);
  if(job.monitor)add(bag,'traffic-monitor',sign);
  if(job.distributor)add(bag,'logistics-distributor',sign);
}

export const findJob=(works,id)=>works.sites[id]||works.arms[id];
export function refund(game,works,drone){
  // 去程机腹中有已扣的成品，返程空载。只能为尚未完工的出击退款。
  if(!drone.back){const job=findJob(works,drone.job);if(job)accountParts(game.bag,job,1);}
}
/** 撤销工地或某一格（连带所接的待装分拣器）。已交付设施和已投入产线的物料由普通拆除处理。 */
export function cancelWorks(game,cell=null){
  const c=game.planet.construction;if(!c)return 0;
  // 连锁拆带一次筛掉整批端点的工单，在途领件只会返还一次。
  const selected=id=>cell===null||(cell instanceof Set?id.split('>').some(k=>cell.has(k)):id===cell||id.split('>').includes(cell));
  c.drones=c.drones.filter(drone=>{if(!selected(drone.job))return true;refund(game,c,drone);return false;});
  let removed=0;
  for(const jobs of [c.sites,c.arms])for(const id of Object.keys(jobs))if(selected(id)){delete jobs[id];removed++;}
  if(removed){c.revision++;c.layout=(c.layout||0)+1;}
  if(!Object.keys(c.sites).length&&!Object.keys(c.arms).length&&!c.drones.length)delete game.planet.construction;
  return removed;
}
