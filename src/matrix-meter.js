import {contributionPercent,sectorAddress} from './sector-rules.js';

export const matrices=['electromagnetic-matrix','energy-matrix','structure-matrix','information-matrix','gravity-matrix','universe-matrix'];
export const metaNames=['元电磁','元能量','元结构','元信息','元引力','元宇宙'];
export const sixZeros=()=>Array(6).fill(0);
export const homeAddress=game=>sectorAddress(game.seed,game.space.starCount,game.resource);
const madeTotals=game=>matrices.map(id=>game.stats.made[id]||0);
const natural=n=>Number.isSafeInteger(n)&&n>=0;
const six=v=>Array.isArray(v)&&v.length===6&&v.every(natural);
/** 旧档以现有累计产出为起点。历史产量没有发生时间，直接计入当前小时会凭空产生贡献。 */
export function newMeter(game){
  return {second:Math.floor(game.elapsed),last:madeTotals(game),buckets:{},total:sixZeros(),peak:sixZeros(),applied:0};
}
/** 按模拟秒统计过去 3600 秒的六色矩阵。只为实际出货的秒分配桶，达峰后停产或读回同址旧档不会增加余额。 */
export function sampleMatrices(game){
  const meter=game.meta,now=Math.floor(game.elapsed+1e-7);
  if(game.scenario!=='landing'||meter.foreign||meter.second===now)return;
  const last=meter.second;
  // 普通步进只会过一秒。大时间差最多清理 3600 个桶，离开页面的现实时间不进入统计。
  for(let sec=Math.max(last+1,now-3599);sec<=now;sec++){
    const key=sec%3600,expired=meter.buckets[key];
    if(expired){for(let i=0;i<6;i++)meter.total[i]-=expired[i];delete meter.buckets[key];}
  }
  const made=madeTotals(game),delta=made.map((n,i)=>n-meter.last[i]);
  if(delta.some(n=>n>0)){
    meter.buckets[now%3600]=delta;
    const percent=contributionPercent(game.resource,game.fogMode);
    for(let i=0;i<6;i++){
      meter.total[i]+=delta[i];
      meter.peak[i]=Math.max(meter.peak[i],Math.floor(meter.total[i]*percent/6000));
    }
  }
  meter.second=now;meter.last=made;
}
/** 从外部 JSON 进入模拟前核对窗口总量，避免伪造负桶导致过期后增加贡献。 */
export function validMeter(game){
  const m=game.meta;
  if(!m||!natural(m.second)||m.second>Math.ceil(game.elapsed)||!natural(m.applied)||!six(m.last)||!six(m.total)||!six(m.peak)||!m.buckets||Array.isArray(m.buckets)||typeof m.buckets!=='object')return false;
  if(m.foreign!==undefined&&typeof m.foreign!=='boolean'||m.used!==undefined&&typeof m.used!=='boolean'||m.origin!==undefined&&(typeof m.origin!=='string'||m.origin.length>100))return false;
  const sum=sixZeros();
  for(const [key,counts] of Object.entries(m.buckets)){
    const index=Number(key);
    if(!natural(index)||String(index)!==key||index>=3600||!six(counts))return false;
    for(let i=0;i<6;i++)sum[i]+=counts[i];
  }
  return m.total.every((n,i)=>n===sum[i]&&n<=m.last[i]&&m.last[i]<=(game.stats?.made?.[matrices[i]]||0));
}
