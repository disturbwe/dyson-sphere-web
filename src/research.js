import {flow,recordFlow} from './production-log.js';
import {studySpec, jobSpec, studyDone, finishStudy, studyName, studyParents} from './research-levels.js';
import {archiveCompletion} from './mission-record.js';
import {gradeOf,extraRate} from './proliferation.js';
import {count, add, moveStock,moveAll} from './stock.js';

// 位序随存档保存。机甲首次拿到样本即登记，样本后来转入仓储或用于制造，发现记录仍有效。
const sampleItems=['df-dark-fog-matrix','df-silicon-based-neuron','df-matter-recombinator','df-negentropy-singularity','df-core-element'];
export const discoveryBits = new Map([
  ['df-dark-fog-lens-tech',1], ['df-digital-analog-computation',2], ['df-matter-recombination',4],
  ['df-negentropy-recursion',8], ['df-high-density-controlled-annihilation',16]
]);
export const completeSampleMask=(1<<sampleItems.length)-1;
export const newScience = () => ({manual:true, reserve:{}, queue:[], suspended:{}, samples:0, ranks:{}});
/** 只检查机甲随身库存。产线或战场分析基站代管的样本，要实际移交给机甲才能触发。 */
export function discoverSamples(game) {
  let mask=game.science.samples||0;
  if(mask===completeSampleMask)return;
  for(let i=0;i<sampleItems.length;i++)if(game.bag[sampleItems[i]]>0)mask|=1<<i;
  if(mask)game.science.samples=mask;
}
/** 普通图谱直接可见。隐藏课题须取得样本并完成前置，沙盒或已完成的课题沿用既有解锁。 */
export function topicVisible(game,id) {
  const bit=discoveryBits.get(id);
  if(!bit||game.techs.includes(id))return true;
  return !!((game.science.samples||0)&bit)&&prerequisites(id).every(parent=>game.techs.includes(parent));
}
export const prerequisites = studyParents;
export const isMatrix = id => ['electromagnetic-matrix','energy-matrix','structure-matrix','information-matrix','gravity-matrix','universe-matrix'].includes(id);
export const labTopic = job => !!job && Object.keys(jobSpec(job).cost).every(isMatrix);
function check(ok, why) { if (!ok) throw new Error(why); }
function release(game) {
  moveAll(game.science.reserve,game,'bag');
}
/** 把背包可用物资转入当前课题预留仓。实验室可独立付款，超过剩余总成本的预留立即退还。 */
function reserveForHand(game) {
  const job=game.research, science=game.science;
  if (!job || !science.manual) return;
  for (const [id,total] of Object.entries(jobSpec(job).cost)) {
    const needed=total-count(job.paid,id)-count(science.reserve,id);
    const move=Math.min(needed,count(game.bag,id));
    if(move>0)moveStock(game.bag,science,'reserve',id,move);
    if(move<0)moveStock(science.reserve,game,'bag',id,-move);
  }
}
export function toggleInventoryResearch(game) {
  game.science.manual=!game.science.manual;
  if (game.science.manual) reserveForHand(game); else release(game);
}
function activate(game,id) {
  game.research=game.science.suspended[id] || {id,hash:0,paid:{}};
  delete game.science.suspended[id];
  reserveForHand(game);
}
/** 直接开始一个已满足前置的课题，已有活动课题时报错。跨分支的连续计划由 enqueueResearch 生成。 */
export function startResearch(game,id) {
  check(studySpec(id),'课题或研发等级无效');
  discoverSamples(game);
  check(topicVisible(game,id),'尚未发现该课题所需的黑雾样本或前置科技');
  check(!game.research,'已有进行中的研究');
  check(!studyDone(game,id),'科技已解锁');
  check(prerequisites(id).every(x=>studyDone(game,x)),'尚未解锁前置科技');
  activate(game,id);
}
/** 只规划尚缺的依赖闭包，按可执行顺序返回 ID。资料缺项在任何入队操作之前报错，避免只排进半条路线。 */
export function researchRoute(game,target) {
  const seen=new Set(game.techs.concat(game.science.queue));
  if (game.research) seen.add(game.research.id);
  discoverSamples(game);
  const route=[], visiting=new Set(), pending=[{id:target,expanded:false}];
  // 万级课题的依赖链可能很深。用堆上的后序栈维持支付顺序，避免长路线耗尽浏览器调用栈。
  while(pending.length){
    const {id,expanded}=pending.pop();
    if(seen.has(id)||studyDone(game,id,seen))continue;
    if(expanded){visiting.delete(id);seen.add(id);route.push(id);continue;}
    check(studySpec(id),'课题或研发等级无效：'+studyName(id));
    check(topicVisible(game,id),'尚未发现该课题所需的黑雾样本或前置科技');
    check(!visiting.has(id),'研究依赖形成循环');
    visiting.add(id);pending.push({id,expanded:true});
    for(const parent of [...prerequisites(id)].reverse())pending.push({id:parent,expanded:false});
  }
  return route;
}
export function enqueueResearch(game,id) {
  const route=researchRoute(game,id);
  check(route.length,'课题已完成或已加入序列');
  game.science.queue.push(...route);
  if (!game.research) activate(game,game.science.queue.shift());
  return route.length;
}
/** 移除选中的课题和依赖它的后续项，保留独立路线。消耗过的物资对应已上传的哈希，重选时继续。 */
export function cancelResearch(game,id) {
  const science=game.science;
  if (game.research?.id===id) {
    release(game);
    if (game.research.hash>0) science.suspended[id]=game.research;
    game.research=null;
  } else check(science.queue.includes(id),'课题不在研究序列中');
  const possible=new Set(game.techs);
  if (game.research) possible.add(game.research.id);
  science.queue=science.queue.filter(next=>{
    if (id===next || !prerequisites(next).every(p=>possible.has(p)||studyDone(game,p,possible))) return false;
    possible.add(next); return true;
  });
  if (!game.research && science.queue.length) activate(game,science.queue.shift());
}
// 上传进度含额外哈希，矩阵只按普通哈希付款；切换供料端仍可用完已经付过的那一批。
export const paidWork=job=>job.hash-(job.extraHash||0);
function paidLimit(job,cost,hashes){
  let end=Infinity;
  for(const id in cost)end=Math.min(end,count(job.paid,id)*hashes/cost[id]);
  return end;
}
export function researchGrade(job,bag,lab){
  const {cost,hashes}=jobSpec(job);
  if(paidLimit(job,cost,hashes)>paidWork(job)+1e-8)return job.paidGrade||0;
  if(!lab)return 0;
  let grade=4;
  for(const id in cost)grade=Math.min(grade,gradeOf(bag,id));
  return grade;
}
/** 给一个课题上传基础哈希，返回含增产的实际进展。先用已付余额，再结算本供料端带来的新矩阵。 */
export function hashWork(game,bag,hashes,lab=false,planet=game.planet) {
  const job=game.research;
  if(!job||hashes<=0||lab&&!labTopic(job))return 0;
  const spec=jobSpec(job), start=job.hash;
  while(hashes>1e-8&&job.hash<spec.hashes-1e-6){
    const base=paidWork(job),credit=paidLimit(job,spec.cost,spec.hashes);
    const grade=researchGrade(job,bag,lab), bonus=extraRate[grade];
    let allowed=credit;
    if(credit<=base+1e-8){
      allowed=Infinity;
      for(const id in spec.cost)allowed=Math.min(allowed,(count(job.paid,id)+count(bag,id))*spec.hashes/spec.cost[id]);
    }
    const delta=Math.min(hashes,allowed-base,(spec.hashes-job.hash)/(1+bonus));
    if(delta<=1e-8)break;
    for(const [id,amount] of Object.entries(spec.cost)){
      const due=Math.ceil((base+delta)*amount/spec.hashes-1e-9)-count(job.paid,id);
      if(due>0){add(bag,id,-due);add(job.paid,id,due);recordFlow(planet,game.elapsed,id,flow.used,due);}
    }
    if(grade||job.paidGrade)job.paidGrade=grade;
    if(bonus)job.extraHash=(job.extraHash||0)+delta*bonus;
    job.hash+=delta*(1+bonus);hashes-=delta;
  }
  if(job.hash>=spec.hashes-1e-6){
    archiveCompletion(game,job);finishStudy(game,job.id);game.research=null;release(game);
    if(game.science.queue.length)activate(game,game.science.queue.shift());
  }else if(game.science.manual&&bag!==game.science.reserve)reserveForHand(game);
  return job.hash-start;
}
export function handResearch(game,dt) {
  discoverSamples(game);
  if (!game.research || !game.science.manual) return;
  reserveForHand(game); hashWork(game,game.science.reserve,60*dt);
}

/** 为已满足前置的矩阵课题报价。已上传的实物算作付款，机甲预留仓的物品尚未消耗。 */
export function buyoutCost(game,id){
  const job=game.research?.id===id?game.research:game.science.suspended[id];
  const spec=job?jobSpec(job):studySpec(id);
  check(spec&&!studyDone(game,id),'课题不存在或已完成');
  check(topicVisible(game,id)&&prerequisites(id).every(parent=>studyDone(game,parent)),'先完成此项的前置科技');
  check(Object.keys(spec.cost).every(isMatrix),'此课题需要实物研究材料');
  return Object.fromEntries(Object.entries(spec.cost).map(([item,n])=>[item,Math.max(0,n-count(job?.paid||{},item))]));
}
/** 执行一张已付款的研究收据。只有当前课题占用了机甲预留仓，购买其他可用分支要保持其供料。 */
export function receiveBuyout(game,id){
  if(studyDone(game,id))return;
  const current=game.research?.id===id;
  const job=current?game.research:game.science.suspended[id];
  const spec=job?jobSpec(job):studySpec(id);
  if(current){release(game);game.research=null;}
  delete game.science.suspended[id];
  game.science.queue=game.science.queue.filter(key=>key!==id);
  archiveCompletion(game,{id,hash:spec.hashes,paid:{...spec.cost}});
  finishStudy(game,id);
  if(!game.research&&game.science.queue.length)activate(game,game.science.queue.shift());
}
