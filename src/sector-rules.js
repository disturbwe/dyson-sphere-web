// 资源档位和元数据贡献来自开档设置。极少模式的母星保留标准矿量的 10%，外星保留 7%。
export const resourceModes = [
  ['scarce','极少',.1,400,250], ['0.3','0.3×',.3,300,200], ['0.5','0.5×',.5,200,150],
  ['0.8','0.8×',.8,150,125], ['1','1×',1,100,100], ['1.5','1.5×',1.5,90,95],
  ['2','2×',2,80,90], ['3','3×',3,70,85], ['5','5×',5,60,80],
  ['8','8×',8,50,75], ['infinite','无限',1,40,70]
];
const modes = new Map(resourceModes.map(row=>[row[0],row]));
const fogFactor = {off:0, passive:.25, normal:1, sharp:1.125};
export const validResource = mode => modes.has(mode);
export const resourceLabel = mode => modes.get(mode)[1];
export function oreMultiplier(mode,home){return mode==='scarce'&&!home? .07 : modes.get(mode)[2];}
export function oilHours(mode){
  if(mode==='infinite')return Infinity;
  return mode==='scarce'||mode==='0.3'?5:12*modes.get(mode)[2];
}
/** 统计与兑换按种子、星数和资源档位识别星区。同址不同敌情只改变贡献倍率，不能互相兑换。 */
export function sectorAddress(seed,stars,mode){
  const suffix=mode==='infinite'?'99':mode==='scarce'?'01':String(Math.round(modes.get(mode)[2]*10)).padStart(2,'0');
  return String(seed).padStart(8,'0')+'-'+stars+'-Z'+suffix;
}
export function contributionPercent(mode,fog){
  const [,,,base,extra]=modes.get(mode);
  return Math.round(base+extra*fogFactor[fog]);
}
