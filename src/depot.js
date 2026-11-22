import {items,physical} from './catalog.js';
import {moveStock,receiveStock,sharePoints,count} from './stock.js';

export const distributorType='logistics-distributor';
export const botType='logistics-bot';
export const isDepot=type=>type==='storage-1'||type==='storage-2';
const realItems=new Set(physical.map(item=>item.id));
export const deliveryItem=id=>realItems.has(id);
export const depotSlots=t=>(t.type==='storage-1'?30:60)*(t.layers||1);
const stackOf=id=>items[id]?.stack||1;
export function slotsUsed(stock){
  let used=0;
  for(const [id,n] of Object.entries(stock))used+=Math.ceil(n/stackOf(id));
  return used;
}
/** 同种货能补齐未满的一格，其他货必须另占整格。旧版按件计量的超额库存仍可取出。 */
export function depotRoom(t,item){
  const stack=stackOf(item),used=slotsUsed(t.output),n=count(t.output,item);
  return Math.max(0,(depotSlots(t)-used)*stack+Math.ceil(n/stack)*stack-n);
}
/** 缩减层数后，按现有物品顺序保留放得下的货物，多出的随上层仓体一起进入背包。 */
export function shrinkDepot(t,game){
  t.layers--;
  let slots=depotSlots(t);
  for(const [item,n] of Object.entries(t.output)){
    const stack=stackOf(item),keep=Math.min(n,slots*stack),excess=n-keep;
    slots-=Math.ceil(keep/stack);
    if(excess)moveStock(t.output,game,'bag',item,excess);
  }
}
export function newDistributor(tile){
  return {item:Object.keys(tile.output)[0]||null,player:'auto',peers:'off',all:false,chargeMW:1.8,
    energy:0,bots:0,overflow:{}};
}
export const playerModes=['off','auto','supply','demand'];
export const peerModes=['off','supply','demand'];
/** 蓝图和存档只接受实物过滤器。全部回收独占配送器，避免回收来的杂物继续污染指定仓线。 */
export function distributorConfig(source){
  if(!(source.item===null||deliveryItem(source.item))||!playerModes.includes(source.player)||!peerModes.includes(source.peers)||
    typeof source.all!=='boolean'||source.all&&(source.player!=='demand'||source.peers!=='off')||
    !Number.isFinite(source.chargeMW)||source.chargeMW<.9||source.chargeMW>9)throw new Error('配送器设置无效');
  const {item,player,peers,all,chargeMW}=source;
  return {item,player,peers,all,chargeMW};
}
export function setDistributor(tile,field,value){
  const dock=tile?.distributor;
  if(!dock)throw new Error('请选择装有配送器的储物仓');
  const updated={...distributorConfig(dock),[field]:value};
  if(field==='all'&&value){updated.player='demand';updated.peers='off';}
  if((field==='player'&&value!=='demand')||(field==='peers'&&value!=='off'))updated.all=false;
  Object.assign(dock,distributorConfig(updated));
}
export function botChargeRate(tile){
  const d=tile.distributor;
  return d.energy>=27?0:Math.min(1,1.05-d.energy/27)*d.chargeMW;
}
export function chargeDistributor(tile,dt){
  const dock=tile.distributor;
  dock.energy=Math.min(27,dock.energy+botChargeRate(tile)*tile.power*dt);
}
/** 航班若遇手动塞满的仓库，先进入塔头暂存区。有空间后优先还仓，再继续该品种的请求。 */
export function deliverDepot(tile,item,amount,points=0){
  const fit=Math.min(amount,depotRoom(tile,item));
  const deposited=sharePoints(points,amount,fit);
  if(fit)receiveStock(tile,'output',item,fit,deposited);
  if(fit<amount)receiveStock(tile.distributor,'overflow',item,amount-fit,points-deposited);
}
export function clearOverflow(tile){
  const overflow=tile.distributor.overflow;
  for(const [item,qty] of Object.entries(overflow)){
    const fit=Math.min(qty,depotRoom(tile,item));
    if(fit)moveStock(overflow,tile,'output',item,fit);
  }
}
