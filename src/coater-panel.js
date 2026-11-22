import {sprays,coaterType} from './coater.js';
import {name,productiveRecipes,recipes,items} from './catalog.js';
import {extraRate,ingredientGrade,speedMode,speedRate,loadRate} from './proliferation.js';
import {cargoSize} from './belt-cargo.js';
import {icon} from './icons.js';
import {section,line,button,powerText} from './ui-format.js';

const directions=['东','北','西','南'];
export function markLabel(points){
  return points?'<span class="spray-mark" aria-label="增产点数 '+points+'">'+'▴'.repeat(Math.min(3,points))+'</span>':'';
}
/** 储罐显示剩余喷涂次数。上下货位为独立实物，玩家可由此查出上层错接或剂型不一致。 */
export function coaterPanel(game,tile){
  const c=tile.coater,feed=c.feed,grade=c.fluid?sprays[c.fluid].points:0;
  const label=t=>t.cargo?name(t.cargo)+' ×'+cargoSize(t)+' '+markLabel(Math.floor((t.inc||0)/cargoSize(t))):'空';
  let html='<div class="readout"><h3>'+icon(coaterType)+'喷涂机</h3>'+line('工作状态',tile.status)+line('供电满足率',Math.round(tile.power*100)+'%')+'</div>';
  html+=section('喷剂储罐',c.fluid?name(c.fluid):'空罐')+'<div class="spray-tank"><b>'+c.doses+' <small>/ 600 次</small></b><i style="width:'+c.doses/6+'%"></i></div>';
  html+=line('喷涂等级',markLabel(grade)||'—')+line('累计喷涂',c.applied.toLocaleString()+' 件');
  html+=section('带面与侧孔')+line('下层物料　→ '+directions[tile.dir],label(tile))+line('上层补液　→ '+directions[feed.dir],label(feed));
  html+=button('reverse-coater','','反转上层带向');
  const stocked=Object.keys(sprays).filter(id=>game.bag[id]);
  if(stocked.length)html+=section('手动加入喷剂')+'<div class="actions">'+stocked.map(id=>button('fill-coater',id,name(id)+' ×'+game.bag[id])).join('')+'</div>';
  return html+'<div class="actions">'+button('remove-selected','','拆除喷涂机','danger')+'</div>';
}
export function recipeCoating(tile){
  const r=recipes[tile.recipe];
  if(!r)return '';
  const grade=ingredientGrade(tile,r.in),fast=speedMode(tile);
  const allowed=productiveRecipes.has(r.id);
  let html=section('增产设置',markLabel(grade)||'普通原料');
  if(allowed){
    html+='<div class="pills">'+button('spray-mode','extra','额外产出','pill '+(!fast?'active':''))+button('spray-mode','speed','生产加速','pill '+(fast?'active':''))+'</div>';
  }else html+=line('配方支持','生产加速');
  const speed=fast?speedRate[grade]:1,yieldRate=fast?0:extraRate[grade];
  html+=line('额外产出','+'+(yieldRate*100)+'%')+line('生产速度','×'+speed.toFixed(2))+line('满负荷功率',powerText(items[tile.type].machine.usage*loadRate[grade]*(tile.layers||1)));
  if(!fast)html+=line('额外批次进度',((tile.bonusWork||0)*100).toFixed(1)+'%')+line('累计额外批次',tile.bonusCycles||0);
  return html;
}
