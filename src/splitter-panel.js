import {name,physical} from './catalog.js';
import {beltPorts} from './liquid-ports.js';
import {usedSlots,depotSlots,sides} from './splitter.js';
import {icon} from './icons.js';
import {button,section,line,note,escapeText} from './ui-format.js';

const arrowsIn=['←','↓','→','↑'];
const arrowsOut=['→','↑','←','↓'];
/** 四方位按钮直接对应相邻的真实传送带。实际端口决定输入输出，按钮只切换该类端口的优先级。 */
export function splitterPanel(game,tile){
  const ports=beltPorts(game.planet,tile),state=tile.split;
  let html='<div class="split-title">'+icon(tile.type)+'<div><h3>'+name(tile.type)+'</h3><span>'+escapeText(tile.status)+'　'+tile.x+' / '+tile.y+'</span></div></div>';
  html+=section('传送带优先级')+'<div class="split-compass"><b aria-hidden="true">'+icon(tile.type)+'</b>';
  for(const [side,port] of ports.entries()){
    if(!port){html+='<span class="sp-empty side-'+side+'">'+sides[side]+' · 空</span>';continue;}
    const inward=port.inward,priority=side===(inward?state.inFirst:state.outFirst);
    const symbol=(inward?arrowsIn:arrowsOut)[side],action=(inward?'入口':'出口');
    const label=sides[side]+action;
    html+='<button data-action="split-priority" data-id="'+side+'" class="side-'+side+' '+(inward?'inlet':'outlet')+(priority?' priority':'')+'" aria-label="'+label+'优先" aria-pressed="'+priority+'"><i>'+symbol+'</i><span>'+label+'</span><small>'+(priority?'优先':'轮流')+'</small></button>';
  }
  html+='</div>';
  if(state.outFirst!==null){
    html+='<label class="tower-field">'+sides[state.outFirst]+'口筛选<select aria-label="优先出口筛选" id="split-filter"><option value="">全部物品</option>'+
      physical.map(item=>'<option value="'+item.id+'" '+(state.filter===item.id?'selected':'')+'>'+escapeText(name(item.id))+'</option>').join('')+'</select></label>';
  }else html+=note('点选出口设为优先，再选择筛出物品。');
  html+=section('端口累计')+'<table class="gas-ledger"><thead><tr><th>连接</th><th>进入</th><th>送出</th></tr></thead><tbody>';
  for(const [side,port] of ports.entries()){
    if(port||state.received[side]||state.sent[side])html+='<tr><td>'+sides[side]+'口</td><td>'+state.received[side].toLocaleString()+'</td><td>'+state.sent[side].toLocaleString()+'</td></tr>';
  }
  html+='</tbody></table>'+section('顶部缓存仓',state.depot?usedSlots(tile.output)+' / '+depotSlots+' 格':'未安装');
  if(state.depot){
    const stored=Object.entries(tile.output);
    html+=stored.length?stored.map(([id,qty])=>line(name(id),String(qty))).join(''):'<span class="muted">空仓</span>';
    if(stored.length)html+=button('take','','取回库存');
  }else html+=button('split-mount','','安装小型储物仓');
  html+='<div class="actions">'+button('remove-selected','',state.depot?'拆下顶部缓存仓':'拆除分流器','danger')+'</div>';
  return html;
}
