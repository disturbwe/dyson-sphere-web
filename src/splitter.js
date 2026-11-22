import {cargoPoints,cargoSize,putCargo,takeCargo} from './belt-cargo.js';
import {items,physical} from './catalog.js';
import {add,count,receiveStock} from './stock.js';
import {beltPorts} from './liquid-ports.js';

export const splitter='splitter';
export const sides=['东','北','西','南'];
const goods=new Set(physical.map(item=>item.id));
const direction=n=>Number.isInteger(n)&&n>=0&&n<4;
const portSetting=n=>n===null||direction(n);
export const depotSlots=30;
const stackSize=id=>items[id].stack;
export const usedSlots=stock=>Object.entries(stock).reduce((slots,[id,qty])=>slots+Math.ceil(qty/stackSize(id)),0);

/** 方向以地理东、北、西、南为基准。设计只记录优先口、筛选和顶仓，轮询位置和真实货物属于运行中的设备。 */
export function newSplitter(){
  return {inFirst:null,outFirst:null,filter:null,depot:false,nextIn:0,nextOut:0,received:[0,0,0,0],sent:[0,0,0,0],clock:[0,0,0,0]};
}
export function splitterConfig(source){
  if(!source||!portSetting(source.inFirst)||!portSetting(source.outFirst)||typeof source.depot!=='boolean'||
     (source.inFirst!==null&&source.inFirst===source.outFirst)||
     !(source.filter===null||goods.has(source.filter)&&source.outFirst!==null))throw new Error('四向分流器端口配置无效');
  const {inFirst,outFirst,filter,depot}=source;
  return {inFirst,outFirst,filter,depot};
}
export function validateSplitter(tile){
  const state=tile.split;splitterConfig(state);
  const four=(list,ok)=>Array.isArray(list)&&list.length===4&&list.every(ok);
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  if(!direction(state.nextIn)||!direction(state.nextOut)||!four(state.sent,integer)||!four(state.received,integer)||
     !four(state.clock,n=>Number.isFinite(n)&&n>=0&&n<=1)||Object.keys(tile.input).length||tile.cargo||
     !Object.keys(tile.output).every(id=>goods.has(id))||usedSlots(tile.output)>(state.depot?depotSlots:0))throw new Error('四向分流器库存或调度状态无效');
}
/** 只能选择真实接入的端口。更换优先出口后清除附在旧端口的筛选，避免未选定的出口突然截走该货物。 */
export function setPriority(planet,tile,side){
  const port=beltPorts(planet,tile)[side];
  if(!port)throw new Error('请先在此端口连接传送带');
  const state=tile.split,field=port.inward?'inFirst':'outFirst';
  const previous=state[field];
  if(!port.inward||state.outFirst===side){state.outFirst=null;state.filter=null;}
  if(!port.inward&&state.inFirst===side)state.inFirst=null;
  // 调用方可以再次点击取消。先保留旧值比较，切换优先级不改变已经在带上的货物。
  state[field]=previous===side?null:side;
}
export function setOutputFilter(tile,id){
  if(id!==null&&(!goods.has(id)||tile.split.outFirst===null))throw new Error('请先选择优先出口和有效物品');
  tile.split.filter=id;
}
/** 顶仓按物品各自的堆叠上限计算 30 格；即使仓位全占，只要现有同类格尚有空间仍可收货。 */
export function depotAccepts(tile,id){
  return tile.split.depot && (count(tile.output,id)%stackSize(id)!==0||usedSlots(tile.output)<depotSlots);
}

function canSend(state,ports,side,id){
  const port=ports[side];
  if(!port||port.inward||port.belt.cargo||state.clock[side]>1e-8)return false;
  // 筛选出口独占匹配物品。指定物满带时保留背压，其他物品仍能走所有普通出口。
  return !state.filter||(state.filter===id)===(state.outFirst===side);
}
function outputFor(state,ports,id){
  const first=state.outFirst;
  if(first!==null&&canSend(state,ports,first,id))return first;
  for(let i=0;i<4;i++){
    const side=(state.nextOut+i)%4;
    if(canSend(state,ports,side,id))return side;
  }
  return -1;
}
function send(state,ports,side,id,qty=1,points=0){
  const belt=ports[side].belt;
  putCargo(belt,id,qty,points);state.sent[side]+=qty;
  // 相邻分拣器可以提前夹走货物，出口仍需满足下游这级带的最小发货间距。
  state.clock[side]+=1/items[belt.type].belt.speed;
  state.nextOut=(side+1)%4;
}
function fromBelt(tile,ports,side){
  const port=ports[side];
  if(!port?.inward||!port.belt.cargo||port.belt.travel<1)return false;
  const state=tile.split,id=port.belt.cargo,out=outputFor(state,ports,id);
  let quantity=cargoSize(port.belt);
  if(out>=0)send(state,ports,out,id,quantity,cargoPoints(port.belt));
  else if((!state.filter||state.filter===id)&&depotAccepts(tile,id)){
    // 仓按件存储，尾格未满时只吸入腾得出的件数，其余货物继续在带头等候。
    const held=count(tile.output,id),size=stackSize(id);
    const free=(depotSlots-usedSlots(tile.output))*size+(size-held%size)%size;
    quantity=Math.min(quantity,free);
    receiveStock(tile,'output',id,quantity,cargoPoints(port.belt,quantity));
  }else return false;
  takeCargo(port.belt,quantity);state.received[side]+=quantity;state.nextIn=(side+1)%4;
  return true;
}
/** 在带移动后结算一台四向。每个入口每步最多取一垛，优先处理现到的货物，只有腾出的出带才会抽取仓内库存。 */
export function runSplitter({tile,ports},dt){
  const state=tile.split;
  for(let i=0;i<4;i++)if(state.clock[i]>0)state.clock[i]-=dt;
  const first=state.inFirst,start=state.nextIn;
  let moved=first!==null&&fromBelt(tile,ports,first);
  for(let i=0;i<4;i++){
    const side=(start+i)%4;
    if(side!==first&&fromBelt(tile,ports,side))moved=true;
  }
  if(state.depot){
    for(const id of Object.keys(tile.output)){
      let out;
      while(tile.output[id]&&(out=outputFor(state,ports,id))>=0){
        send(state,ports,out,id,1,add(tile.output,id,-1));moved=true;
      }
    }
  }
  // 负余数仅补偿刚到时的离散步误差。闲置期间不积攒发送额度，暂停后不能突发倾倒库存。
  for(let i=0;i<4;i++)if(state.clock[i]<0)state.clock[i]=0;
  if(moved)tile.status='分流中';
  else tile.status=ports.some(p=>p?.inward&&p.belt.cargo&&p.belt.travel>=1)?'等待出口':'等待来料';
}
