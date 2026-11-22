import {name} from './catalog.js';
import {count} from './stock.js';
import {largeMiner,applyMineConfig,mineDuty,mineLoad,minePeak,mineRoom} from './advanced-miner.js';
import {capabilitiesOf} from './upgrades.js';
import {button,line,note,powerText,section} from './ui-format.js';
import {icon} from './icons.js';

/** 从同一采矿与货单账本显示额定和实际读数，提货途中已封存的矿与可取现货分别展示。 */
export function minePanel(game,tile){
  const slot=tile.station.slots[0], ore=slot?.item, stock=count(tile.output,ore), cap=capabilitiesOf(game);
  const live=tile.veins.map(id=>game.planet.veins[id]).filter(v=>v.amount>0&&!v.buried);
  const active=live.length>0&&mineRoom(tile)>0&&tile.hull!==0;
  const rate=live.length*60*cap.miningRate*tile.miner.speed/100;
  let html='<div class="readout"><h3>'+icon(largeMiner)+name(largeMiner)+'</h3>'+line('工作状态',tile.hull===0?'已损毁':tile.status)+line('开采矿脉',live.length+' 处 · '+(ore?name(ore):'无矿脉'))+'</div>';
  html+=section('开采速度',tile.miner.speed+'%')+'<input aria-label="开采速度" data-mine="speed" type="range" min="100" max="300" step="10" value="'+tile.miner.speed+'">';
  html+=line('额定产量',Math.round(rate).toLocaleString()+' /min')+line('当前产速',Math.round(active?rate*tile.power*mineDuty(tile):0).toLocaleString()+' /min');
  html+=line('满负荷功率',powerText(minePeak(tile)))+line('实际用电',powerText(tile.hull===0?0:mineLoad(tile,active)*tile.power));
  if(slot){
    html+=section('内置矿仓',slot.limit.toLocaleString()+' 件')+line('可取现货',stock.toLocaleString())+line('等待运输机取货',slot.held.toLocaleString());
    html+='<div class="pills">'+[['supply','本地供应'],['storage','仅存储']].map(([id,label])=>button('mine-mode',id,label,'pill '+(slot.local===id?'active':''))).join('')+'</div>';
  }
  if(cap.portHeight>1){
    const options=['使用科技上限（'+cap.portHeight+' 层）',...Array.from({length:cap.portHeight},(_,i)=>(i+1)+' 层')];
    html+=section('传送带输出')+'<select aria-label="矿机输出层数" data-mine="stack">'+options.map((label,i)=>'<option value="'+i+'" '+(i===tile.miner.stack?'selected':'')+'>'+label+'</option>').join('')+'</select>';
  }
  html+=note('机头三口、两侧各三口可直连传送带。本地供应允许需求塔派运输机来取矿。');
  return html+'<div class="actions">'+button('take','','取回产物','primary')+button('remove-selected','','拆除并回收','danger')+'</div>';
}
/** 设置事件先校验选中的实机及建造距离，避免切换面板后把延迟触发的滑条写入另一座设施。 */
export function changeMine(game,tile,field,value,withinReach){
  if(tile?.type!==largeMiner||tile.hull===0||!withinReach)throw new Error('请靠近完好的大型采矿机');
  if(!['speed','stack','mode'].includes(field))throw new Error('未知的矿机参数');
  applyMineConfig(game,tile,{...tile.miner,mode:tile.station.slots[0]?.local??'supply',[field]:value});
}
