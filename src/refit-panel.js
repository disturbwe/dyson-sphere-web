import {items,belts,sorters,name,recipes,unlocked} from './catalog.js';
import {gradeFamily,refitQuantity} from './facility-grades.js';
import {sorterRate} from './sorter-motion.js';
import {capabilitiesOf} from './upgrades.js';
import {count} from './stock.js';
import {button,line,powerText,section} from './ui-format.js';

/** 带线已有独立的单节/整线报价。设备和分拣器按当前库存列出同组型号，执行端再次校验距离、配方和备件。 */
export function refitControls(game,part,index=null){
  const group=gradeFamily(part.type);
  if(!group||belts.includes(part.type)||part.hull===0)return '';
  const isArm=sorters.includes(part.type),cap=capabilitiesOf(game),qty=refitQuantity(part);
  const options=group.filter(id=>id!==part.type&&(count(game.bag,id)||unlocked(game,recipes[id])));
  let html=isArm?'':section('设备规格');
  if(isArm){
    html+=line(name(part.type),part.span+' 格 · '+sorterRate(part,cap).toFixed(1)+' 往返/秒');
    if(part.type==='sorter-4')html+=line('集装能力','取 '+cap.sorterLoad+' 件 · 卸 '+cap.sorterHeight+' 层');
    // 抓爪每秒可换向数十次。保留这一行的位置，避免刷新时将鼠标下的备件按钮换成另一条命令。
    html+=line('爪内货物',part.hand?name(part.hand.item)+' ×'+part.hand.size:'空');
  }else{
    const spec=items[part.type].machine;
    html+=line('额定工速','×'+spec.speed)+line('单层工作功耗',powerText(spec.usage));
  }
  if(!options.length)return html;
  html+=section('原位换装','领 '+qty+' 件新机 · 退 '+qty+' 件旧机')+'<div class="actions">';
  for(const id of options){
    const action=isArm?'refit-arm':'refit-machine';
    html+=button(action,isArm?index+'/'+id:id,name(id)+' · 备件 '+count(game.bag,id));
  }
  return html+'</div>';
}
