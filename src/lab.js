import {items, recipes} from './catalog.js';
import {jobSpec} from './research-levels.js';
import {recipeSpeed,finishBatch} from './proliferation.js';
import {count,total} from './stock.js';
import {hashWork, labTopic,paidWork} from './research.js';
import {capabilitiesOf} from './upgrades.js';

export const isLab = type => type==='matrix-lab' || type==='df-self-evolution-lab';
/** 计算能开工的层数。底层共享缓存要按完整配方分配，单份原料不可同时计作多层的在制品。 */
export function workingLabs(game,tile) {
  if (tile.recipe==='research') {
    const job=game.research;
    if (!labTopic(job)) return 0;
    const spec=jobSpec(job);
    const hasCredit=Object.entries(spec.cost).every(([id,amount])=>(count(tile.input,id)+count(job.paid,id))*spec.hashes/amount>paidWork(job)+1e-8);
    return hasCredit?tile.layers:0;
  }
  const recipe=recipes[tile.recipe];
  if (!recipe) return 0;
  let workers=Math.min(tile.layers,Math.floor((60*tile.layers-total(tile.output))/total(recipe.out)));
  for(const [id,quantity] of Object.entries(recipe.in))workers=Math.min(workers,Math.floor(count(tile.input,id)/quantity));
  return Math.max(0,workers);
}
/** 每层保有自己的生产时钟。同刻启动的三层在一批完成时一起出货，新增顶层始终从零起步。 */
export function runLab(game,tile,dt,planet=game.planet) {
  if (!tile.power) { tile.status='未供电'; return; }
  const working=workingLabs(game,tile);
  if (!working) {
    tile.status=tile.recipe==='research'?(labTopic(game.research)?'等待矩阵':'等待矩阵课题'):(total(tile.output)>=60*tile.layers?'输出堆积':'等待原料');
    return;
  }
  const speed=items[tile.type].machine.speed*dt*tile.power;
  if (tile.recipe==='research') {
    hashWork(game,tile.input,speed*working*capabilitiesOf(game).labHashes,true,planet);
    tile.status='研究中'; return;
  }
  const recipe=recipes[tile.recipe];
  for (let level=0;level<working;level++) {
    tile.labWork[level]+=speed*recipeSpeed(tile,recipe)/recipe.time;
    if (tile.labWork[level]+1e-10>=1) {
      tile.labWork[level]=Math.max(0,tile.labWork[level]-1);
      finishBatch(game,tile,recipe,planet);
    }
  }
  tile.progress=tile.labWork[0]; tile.status='生产中';
}
