import {levelRanges, studySpec, jobSpec, studyDone, legacyPrice} from './research-levels.js';
import {bodyOf} from './navigation.js';
import {finalTopic} from './mission-record.js';
import {paidWork,prerequisites,topicVisible,completeSampleMask} from './research.js';

/** 九版只有原型首级，物流 XII 直接接 IX。继承已经开工的许可，未开工的队列则补入 X、XI。
 * 旧价格仅锁定已经启动的课题，以免加载时改变预留额，或抹去已付的哈希。
 */
export function upgradeScience9(game) {
  const science=game.science;
  if (!science || !Array.isArray(game.techs) || !Array.isArray(science.queue) || !science.suspended) throw new Error('存档缺少科研账本');
  science.ranks={};
  const capacity='logistics-carrier-capacity-12', previous='logistics-carrier-capacity-9';
  const grandfathered=game.techs.includes(capacity)||game.research?.id===capacity||Object.hasOwn(science.suspended,capacity);
  if (grandfathered && game.techs.includes(previous)) science.ranks[previous]=11;
  else if (science.queue.includes(capacity)) science.queue.splice(science.queue.indexOf(capacity),0,previous+'@10',previous+'@11');
  for (const job of [game.research,...Object.values(science.suspended)]) if(job && legacyPrice(job.id)) job.legacyPrice=true;
}

/** 校验科研的支付与排队关系。已消费额须和累计哈希相符，否则导入后会重复取料或免费完成课题。 */
export function validateScience(game) {
  const fail=()=>{throw new Error('存档包含无效的研究序列或物资账目');};
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const {science,research:active}=game;
  if (!object(science)||typeof science.manual!=='boolean'||!object(science.reserve)||!object(science.suspended)||!Array.isArray(science.queue)) fail();
  // 旧档没有样本字段。新字段最多五位，错误的整数不能让所有隐藏课题意外可见。
  if(science.samples!==undefined&&(!Number.isInteger(science.samples)||science.samples<0||science.samples>completeSampleMask))fail();
  const completed=new Set(game.techs);
  if(!object(science.ranks))fail();
  for(const [base,rank] of Object.entries(science.ranks)){
    if(!Object.hasOwn(levelRanges,base)||!completed.has(base))fail();
    const range=levelRanges[base];
    if(!Number.isInteger(rank)||rank<=range.first||rank>range.limit)fail();
  }
  const done=id=>studyDone(game,id,completed);
  // 已有存档可能完成过科研而没有完工时刻。仅校验确实写入的快照，不从当前功率反推旧成绩。
  if (science.completion !== undefined) {
    const record = science.completion;
    if (!object(record) || !completed.has(finalTopic) || !bodyOf(game,record.body) || typeof record.read !== 'boolean') fail();
    if (!Number.isFinite(record.elapsed) || record.elapsed < 0 || record.elapsed > game.elapsed || !Number.isFinite(record.power) || record.power < 0) fail();
    for (const field of ['spheres','sails','structure','cells']) if (!Number.isSafeInteger(record[field]) || record[field] < 0) fail();
    if (record.spheres > game.space.starCount) fail();
  }
  function validateJob(job) {
    if (!object(job)||!studySpec(job.id)||done(job.id)||!object(job.paid)) fail();
    if(job.legacyPrice!==undefined && (job.legacyPrice!==true || !legacyPrice(job.id)))fail();
    const spec=jobSpec(job);
    if(!topicVisible(game,job.id))fail();
    if (!Number.isFinite(job.hash)||job.hash<0||job.hash>=spec.hashes||!prerequisites(job.id).every(done)) fail();
    if(job.extraHash!==undefined&&(!Number.isFinite(job.extraHash)||job.extraHash<0||job.extraHash>job.hash*.2+1e-6))fail();
    if(job.paidGrade!==undefined&&(!Number.isInteger(job.paidGrade)||job.paidGrade<0||job.paidGrade>4))fail();
    if (Object.keys(job.paid).some(id=>!Object.hasOwn(spec.cost,id))) fail();
    for (const [id,amount] of Object.entries(spec.cost)) {
      const due=Math.ceil(paidWork(job)*amount/spec.hashes-1e-9);
      if ((job.paid[id]??0)!==due) fail();
    }
  }
  if (active!==null) validateJob(active);
  for (const [id,job] of Object.entries(science.suspended)) {
    validateJob(job);
    if (id!==job.id || id===active?.id) fail();
  }
  for (const [id,n] of Object.entries(science.reserve)) {
    if (!science.manual||!active||!Number.isSafeInteger(n)||n<=0) fail();
    const cost=jobSpec(active).cost;
    if (!Object.hasOwn(cost,id)||n>cost[id]-(active.paid[id]||0)) fail();
  }
  if (science.queue.length&&!active) fail();
  const scheduled=new Set(game.techs);
  if (active) scheduled.add(active.id);
  for (const id of science.queue) {
    if (!studySpec(id)||!topicVisible(game,id)||done(id)||scheduled.has(id)||!prerequisites(id).every(p=>scheduled.has(p)||done(p))) fail();
    scheduled.add(id);
  }
}
