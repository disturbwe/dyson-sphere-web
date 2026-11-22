import {belts,items,name} from './catalog.js';
import {beltLine} from './belt-line.js';
import {count} from './stock.js';
import {button,line,note,section} from './ui-format.js';

/** 检查面板共用带网索引，选择范围只改变改造目标。换件库存按本次点击重新核对。 */
export function beltControls(game,tile,ui){
  if(tile.hull===0)return '';
  const path=beltLine(game.planet,tile);
  const whole=!!ui.chainBelts;
  let html=section('输送线路',path.members.length+' 节'+(path.circular?' · 环线':''));
  html+=line('本节带速',items[tile.type].belt.speed+' 垛/秒');
  html+='<div class="actions">'+button('belt-turn','','反转整条线路')+'</div>';
  html+=section('原位换带')+'<div class="actions">'+button('belt-scope','one','选中一节',whole?'':'primary')+button('belt-scope','line','范围内整线',whole?'primary':'')+'</div>';
  html+='<div class="actions">'+belts.filter(id=>whole||id!==tile.type).map(id=>button('belt-swap',id,name(id)+' ×'+count(game.bag,id))).join('')+'</div>';
  if(whole)html+=note('按建造范围逐节计算替换件，原带节返回背包。');
  return html;
}
