import {physical} from './catalog.js';

export const monitorType='traffic-monitor';
export const comparisons={'=':(a,b)=>a===b,'≠':(a,b)=>a!==b,'≥':(a,b)=>a>=b,'>':(a,b)=>a>b,'≤':(a,b)=>a<=b,'<':(a,b)=>a<b};
export const alarmModes={off:'无',fail:'未满足条件',pass:'满足条件',loaded:'有货物响',empty:'无货物响',failLoaded:'未满足且有货物',failEmpty:'未满足且无货物'};
const goods=new Set(physical.map(item=>item.id));
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const defaults={seconds:6,target:300,operator:'≥',filter:null,alarm:'off',speaker:false};

/** 蓝图只保存读数条件和报警选择。外部文件可能来自其他存档，检查周期和目标范围后才按它们分配采样空间。 */
export function monitorConfig(settings){
  if(!settings||!Number.isInteger(settings.seconds*4)||settings.seconds<1||settings.seconds>60||
    !integer(settings.target)||settings.target>7200||!Object.hasOwn(comparisons,settings.operator)||
    !Object.hasOwn(alarmModes,settings.alarm)||typeof settings.speaker!=='boolean'||!(settings.filter===null||goods.has(settings.filter)))throw new Error('流速监测条件无效');
  const {seconds,target,operator,filter,alarm,speaker}=settings;
  return {seconds,target,operator,filter,alarm,speaker};
}
function resetWindow(m){
  const capacity=m.seconds*4;
  Object.assign(m,{buckets:Array(capacity).fill(0),pileBuckets:Array(capacity).fill(0),cursor:0,samples:0,phase:0,
    pending:0,pendingPiles:0,sum:0,pileSum:0,occupied:false,state:'waiting',alert:false});
}
export function newMonitor(settings=defaults){
  const m={...monitorConfig(settings),lifetime:0,lifetimePiles:0};resetWindow(m);return m;
}
function evaluate(m){
  if(m.samples<m.buckets.length){m.state='waiting';m.alert=false;return;}
  // 比较两侧的整数比例，避免 7.75 秒之类的周期让严格等号受浮点舍入影响。
  const pass=comparisons[m.operator](m.sum*60,m.target*m.seconds);
  m.state=pass?'pass':'fail';
  updateAlarm(m);
}
function updateAlarm(m){
  const fail=m.state==='fail';
  // 堵住的带头仍有实物，即使一整窗流量为零也应报“未满足且有货物”。
  const flags={off:false,fail,pass:m.state==='pass',loaded:m.occupied,empty:!m.occupied,
    failLoaded:fail&&m.occupied,failEmpty:fail&&!m.occupied};
  m.alert=flags[m.alarm];
}
/** 周期和筛选决定样本的含义，修改它们要重新采满一窗。改目标、运算符或警报可以直接用原窗口重算。 */
export function configureMonitor(m,field,value){
  if(!Object.hasOwn(defaults,field))throw new Error('未知监测设置');
  const config=monitorConfig({...m,[field]:value});
  if(m[field]===config[field])return;
  Object.assign(m,config);
  if(field==='seconds'||field==='filter'){m.lifetime+=m.pending;m.lifetimePiles+=m.pendingPiles;resetWindow(m);}else evaluate(m);
}
/** 只为实际安装的测点采样，每四分之一秒覆盖一个环形桶。读数单位是件/分，垛/分作为独立诊断数值。 */
export function sampleMonitor(belt,dt){
  const m=belt.monitor;
  if(!belt.power){
    if(m.state!=='offline'){m.lifetime+=m.pending;m.lifetimePiles+=m.pendingPiles;resetWindow(m);m.state='offline';}
    return;
  }
  if(m.state==='offline')m.state='waiting';
  const occupied=!!belt.cargo&&(!m.filter||m.filter===belt.cargo);
  if(m.occupied!==occupied){m.occupied=occupied;if(m.state!=='waiting')updateAlarm(m);}
  m.phase+=dt;
  if(m.phase+1e-9<.25)return;
  m.phase=Math.max(0,m.phase-.25);
  m.sum+=m.pending-m.buckets[m.cursor];m.buckets[m.cursor]=m.pending;m.lifetime+=m.pending;
  m.pileSum+=m.pendingPiles-m.pileBuckets[m.cursor];m.pileBuckets[m.cursor]=m.pendingPiles;m.lifetimePiles+=m.pendingPiles;
  m.pending=0;m.pendingPiles=0;m.cursor=(m.cursor+1)%m.buckets.length;
  m.samples=Math.min(m.samples+1,m.buckets.length);evaluate(m);
}
export function monitorRate(m){return m.sum*60/m.seconds;}
/** 恢复窗口时核对环形桶总和。由真实历史重新派生颜色与系统警报，防止损坏的数值持续传播。 */
export function validateMonitor(m){
  monitorConfig(m);
  if(m.occupied===undefined)m.occupied=false;
  if(typeof m.occupied!=='boolean')throw new Error('流速监测货位状态无效');
  const validRing=list=>Array.isArray(list)&&list.length===m.seconds*4&&list.every(integer);
  const sum=list=>list.reduce((a,b)=>a+b,0);
  if(!validRing(m.buckets)||!validRing(m.pileBuckets)||!integer(m.cursor)||m.cursor>=m.buckets.length||
    !integer(m.samples)||m.samples>m.buckets.length||!Number.isFinite(m.phase)||m.phase<0||m.phase>.25||
    ![m.pending,m.pendingPiles,m.lifetime,m.lifetimePiles].every(integer)||m.pendingPiles>m.pending||
    m.sum!==sum(m.buckets)||m.pileSum!==sum(m.pileBuckets)||m.pileSum>m.sum||m.lifetime<m.sum||m.lifetimePiles<m.pileSum)throw new Error('流速监测采样记录无效');
  if(m.state==='offline'&&!m.samples){m.alert=false;}else evaluate(m);
}
