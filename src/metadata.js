import {matrices,metaNames,homeAddress,sixZeros} from './matrix-meter.js';
import {buyoutCost,receiveBuyout} from './research.js';
import {add} from './stock.js';

const key='dyson-metadata-v1',ownerKey=key+'-owner';
const fresh=()=>({sectors:{},claims:{}});
let cached;
export function nativeOrigin(){
  let id=localStorage.getItem(ownerKey);
  if(!id){id=crypto.randomUUID();localStorage.setItem(ownerKey,id);}
  return id;
}
/** 导入本机备份仍可贡献。外部档继续运行工厂，但它此前的产能与领取流水不属于本机星区账户。 */
export function bindMetadata(game,imported=false){
  if(game.scenario!=='landing')return;
  const owner=nativeOrigin();
  if(imported){game.meta.applied=0;if(game.meta.origin!==owner)game.meta.foreign=true;}
  if(!game.meta.foreign)game.meta.origin=owner;
}
const eligible=game=>game.scenario==='landing'&&!game.meta.foreign;
function load(){
  const text=localStorage.getItem(key);
  if(!text)return fresh();
  const wallet=JSON.parse(text);
  if(!wallet?.sectors||!wallet.claims)throw new Error('元数据账户无法读取');
  return wallet;
}
function change(wallet){localStorage.setItem(key,JSON.stringify(wallet));cached=wallet;}
export function walletView(){return cached??=load();}
if(typeof window!=='undefined')window.addEventListener('storage',e=>{if(e.key===key||e.key===null)cached=null;});
function locked(task){
  // Web Locks 串行所有标签的余额更新。无锁的浏览器仍可游玩单档，避免并发覆盖已经付款的记录。
  if(!globalThis.navigator?.locks?.request)return Promise.reject(new Error('此浏览器缺少跨窗口元数据锁'));
  return navigator.locks.request(key,task);
}
/** 同址多档只上报每种颜色的峰值。账面消费独立保存，重新载入高产档不会补回已花额度。 */
export function postPeak(wallet,game){
  if(!eligible(game))return false;
  const address=homeAddress(game),sector=wallet.sectors[address]||{earned:sixZeros(),spent:sixZeros()};
  let changed=false;
  for(let i=0;i<6;i++)if(game.meta.peak[i]>sector.earned[i]){sector.earned[i]=game.meta.peak[i];changed=true;}
  if(changed)wallet.sectors[address]=sector;
  return changed;
}
export async function publishPeak(game){
  if(!eligible(game)||!game.meta.peak.some(n=>n>0))return;
  const sector=walletView().sectors[homeAddress(game)];
  if(sector&&game.meta.peak.every((n,i)=>n<=sector.earned[i]))return;
  await locked(()=>{const wallet=load();if(postPeak(wallet,game))change(wallet);else cached=wallet;});
}
/** 按来源保留已花额度。本星区贡献即使尚未花费，也只出现在贡献列。 */
export function holdings(wallet,address){
  const available=sixZeros(),earned=sixZeros();
  for(const [source,row] of Object.entries(wallet.sectors))for(let i=0;i<6;i++){
    earned[i]+=row.earned[i];if(source!==address)available[i]+=row.earned[i]-row.spent[i];
  }
  return {available,earned,local:wallet.sectors[address]?.earned||sixZeros()};
}
// 元宇宙支持提取成套五色矩阵，或按原版组合提取黑雾产物。组合中的数量均为一份收据的交付量。
export const universeGifts={spectrum:Object.fromEntries(matrices.slice(0,5).map(id=>[id,1])),fogMatrix:{'df-dark-fog-matrix':20},shard:{'df-energy-shard':60},relics:{'df-silicon-based-neuron':10,'df-negentropy-singularity':10,'df-matter-recombinator':10},core:{'df-core-element':10}};
function quote(game,order){
  if(order.tech)return {cost:buyoutCost(game,order.tech),tech:order.tech};
  const {item,quantity}=order;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000)throw new Error('提取数量须为 1 至 1,000,000');
  const gift=Object.hasOwn(universeGifts,item)?universeGifts[item]:null;
  if(!gift&&!matrices.includes(item))throw new Error('未知的元数据提取物');
  const output=Object.fromEntries(Object.entries(gift||{[item]:1}).map(([id,n])=>[id,n*quantity]));
  return {cost:{[gift?matrices[5]:item]:quantity},output};
}
/** 先查齐六色价格，再按来源扣除并把收据绑定到目的存档。调用方只持久化整份成功的账户。 */
export function reserveClaim(wallet,game,slot,order){
  if(!eligible(game))throw new Error('元数据仅在本机标准存档中可用');
  const address=homeAddress(game),{available}=holdings(wallet,address),{cost,...grant}=quote(game,order);
  for(const [item,need] of Object.entries(cost)){
    const i=matrices.indexOf(item);if(available[i]<need)throw new Error(metaNames[i]+'不足，还需 '+(need-available[i]));
  }
  for(const [item,need] of Object.entries(cost)){
    let left=need;const i=matrices.indexOf(item);
    for(const [source,row] of Object.entries(wallet.sectors)){
      if(source===address||!left)continue;
      const take=Math.min(left,row.earned[i]-row.spent[i]);row.spent[i]+=take;left-=take;
    }
  }
  (wallet.claims[slot]??=[]).push({address,...grant});
}
/** 付款收据先于背包持久化。两次写入之间关页，重入相同槽位只补发未记录序号的实物或科技。 */
export function deliverClaims(wallet,game,slot){
  const claims=wallet.claims[slot]||[];
  let delivered=false;
  while(game.meta.applied<claims.length){
    const claim=claims[game.meta.applied];
    if(claim.address!==homeAddress(game))throw new Error('领取记录与当前星区不符');
    if(claim.tech)receiveBuyout(game,claim.tech);
    else for(const [id,n] of Object.entries(claim.output))add(game.bag,id,n);
    game.meta.applied++;game.meta.used=true;delivered=true;
  }
  return delivered;
}
/** 先保存扣款前的游戏，再同步提交账户并交付。配额失败时账户留有可复核收据，重进该槽可续领。 */
export function redeem(game,slot,order,checkpoint,stillHere){
  return locked(()=>{
    if(!stillHere())throw new Error('已切换存档，请重新选择');
    const wallet=load();deliverClaims(wallet,game,slot);postPeak(wallet,game);
    reserveClaim(wallet,game,slot,order);checkpoint(slot,game);change(wallet);
    deliverClaims(wallet,game,slot);checkpoint(slot,game);
  });
}
