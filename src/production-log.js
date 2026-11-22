import {physical} from './catalog.js';

export const spans=[60,600,3600,36000,360000];
export const binCount=60;
export const flow={made:0,used:1,arrival:2,departure:3,starArrival:4,starDeparture:5};
const channels=6, cache=new WeakMap();
const allowedItems=new Set(physical.map(item=>item.id));
const whole=n=>Number.isSafeInteger(n)&&n>=0;
const record=obj=>obj!==null&&typeof obj==='object'&&!Array.isArray(obj);
const bump=(bag,key,n)=>{bag[key]=(bag[key]||0)+n;};
// 固定步长的 30 次相加可能差一个浮点尾数。整秒是前一柱的右端点，暂停或重载不应平移一秒。
const sampleSecond=time=>Math.max(0,Math.ceil(time-1e-7)-1);
function newHistory(){return {items:[],total:{},rings:spans.map(()=>({}))};}

/** 在实物产出、消耗或跨境交割时记正整数件数。planet 是实际工厂的星球，time 只取模拟时钟。
 * 每个有交易的星球按需开账，同秒事件复用五个桶。未开工星球和停产期间均无需轮询或填零。 */
export function recordFlow(planet,time,item,channel,amount=1){
  const log=planet.production??=newHistory();
  let memo=cache.get(log);
  if(!memo){
    memo={ids:new Map(log.items.map((id,i)=>[id,i])),second:-1,bags:[]};cache.set(log,memo);
  }
  let index=memo.ids.get(item);
  if(index===undefined){index=log.items.length;log.items.push(item);memo.ids.set(item,index);}
  const second=sampleSecond(time);
  if(memo.second!==second){
    for(let i=0;i<spans.length;i++){
      const epoch=Math.floor(second/(spans[i]/binCount)),slot=epoch%binCount,ring=log.rings[i];
      if(ring[slot]?.[0]!==epoch)ring[slot]=[epoch,{}];
      memo.bags[i]=ring[slot][1];
    }
    memo.second=second;
  }
  const key=index*channels+channel;
  bump(log.total,key,amount);
  for(const bag of memo.bags)bump(bag,key,amount);
}

/** 只对真实完成的转换批次记账。增产只扩大产物，分馏回流和缓存间搬运不产生新物品。 */
export function recordBatch(planet,time,inputs,outputs,batches=1){
  for(const item in inputs)recordFlow(planet,time,item,flow.used,inputs[item]);
  for(const item in outputs)recordFlow(planet,time,item,flow.made,outputs[item]*batches);
}

/** 按选定星球集合归并一档 60 柱。0 表示从开账起累计。跨行星或跨恒星系时仅显示穿过所选边界的货运。
 * 返回原始件数，窗口平均值由界面统一除以完整窗口长度，停工和开局未采满的区间也占用时间。 */
export function flowReport(planets,time,span,boundary='planet'){
  const tier=spans.indexOf(span),width=tier<0?0:span/binCount;
  const end=width?Math.floor(sampleSecond(time)/width):0,first=end-binCount+1;
  const rows=new Map();
  function collect(log,bag,col){
    for(const k in bag){
      const code=Number(k),type=code%channels;
      let lane=type;
      if(type>=flow.arrival){
        if(boundary==='cluster'||(boundary==='star')!==(type>=flow.starArrival))continue;
        lane=flow.arrival+(type%2);
      }
      const id=log.items[Math.floor(code/channels)];
      let row=rows.get(id);
      if(!row){row={id,counts:[0,0,0,0],columns:new Map()};rows.set(id,row);}
      row.counts[lane]+=bag[k];
      if(col>=0){
        let bars=row.columns.get(col);
        if(!bars){bars=[0,0,0,0];row.columns.set(col,bars);}
        bars[lane]+=bag[k];
      }
    }
  }
  for(const planet of planets){
    const log=planet.production;if(!log)continue;
    if(tier<0){collect(log,log.total,-1);continue;}
    for(const [epoch,bag] of Object.values(log.rings[tier])){
      if(epoch>=first&&epoch<=end)collect(log,bag,epoch-first);
    }
  }
  return {rows,first,width,endTime:time};
}

/** 校验外部存档的物品字典、桶的世代与件数。过期桶允许保留至覆写，但未来数据及超出累计值的曲线无效。 */
export function validProduction(log,time){
  if(log===undefined)return true; // 老存档只有全局总数，缺少产地和时刻，不能回填到当前星球。
  if(!record(log)||!Array.isArray(log.items)||log.items.length>allowedItems.size||
     new Set(log.items).size!==log.items.length||!log.items.every(id=>allowedItems.has(id))||
     !Array.isArray(log.rings)||log.rings.length!==spans.length)return false;
  const validBag=bag=>record(bag)&&Object.entries(bag).every(([k,n])=>{
    const code=Number(k);return whole(code)&&String(code)===k&&code<log.items.length*channels&&whole(n)&&n>0;
  });
  if(!validBag(log.total))return false;
  return log.rings.every((ring,i)=>{
    if(!record(ring)||Object.keys(ring).length>binCount)return false;
    const end=Math.floor(sampleSecond(time)/(spans[i]/binCount)),sum={};
    for(const [key,entry] of Object.entries(ring)){
      if(!Array.isArray(entry)||entry.length!==2)return false;
      const [epoch,bag]=entry;
      if(!whole(epoch)||epoch>end||String(epoch%binCount)!==key||!validBag(bag))return false;
      for(const k in bag)bump(sum,k,bag[k]);
    }
    return Object.entries(sum).every(([key,n])=>n<=(log.total[key]||0));
  });
}
