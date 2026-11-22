import {collector,gasProfile,gasRates,moorings} from './gas.js';
import {button,section,line,note} from './ui-format.js';
import {name} from './catalog.js';
import {icon} from './icons.js';
import {key,distance} from './world.js';
import {count} from './stock.js';

/** 云顶勘探列出气体基础产率和最近的空泊位。部署会经过同一套距离、占位与背包扣料校验。 */
export function cloudSurvey(game){
  const planet=game.planet,{gases,label}=gasProfile(planet);
  let h=section(label+'气体组分')+gases.map(g=>line(icon(g.item)+name(g.item),g.base.toFixed(3)+' /s')+button('sample-gas',g.item,game.mecha.intake===g.item?'结束采样':'手动采集'+name(g.item))).join('');
  const sites=moorings.map(x=>({x,y:0})).sort((a,b)=>distance(game.mecha,a)-distance(game.mecha,b));
  const free=sites.find(p=>!planet.tiles[key(p.x,0)]);
  h+=section('赤道同步轨道',Object.keys(planet.tiles).length+' / 40');
  if(free)h+=line('最近空泊位',Math.abs(free.x*2)+'° '+(free.x<0?'W':'E'))+button('moor-nearest',free.x,distance(game.mecha,free)>12?'飞往空泊位':'部署轨道采集器','primary');
  for(const p of sites){const addr=key(p.x,0),t=planet.tiles[addr];if(t)h+=button('inspect-machine',addr,icon(collector)+name(collector)+'　'+(p.x*2)+'°　'+t.status,'row');}
  return h;
}

/** 率表分别给出每分钟总收集量、自耗与净产，库存行显示驻外船已经预留的提货数量。 */
export function gasPanel(game,tile){
  const profile=gasProfile(game.planet),rows=gasRates(game,game.planet);
  let h='<div class="tower-title">'+icon(collector)+'<span><b>'+name(collector)+'</b><small>'+profile.label+' · 赤道 '+(tile.x*2)+'°</small></span></div>';
  h+=line('运行状态',tile.status)+line('维持轨道功率','30.0 MW')+section('气流平衡','个 / 分钟');
  h+='<table class="gas-ledger"><thead><tr><th>产物</th><th>采入</th><th>自耗</th><th>净产</th></tr></thead><tbody>';
  rows.forEach(r=>{h+='<tr><td>'+icon(r.item)+name(r.item)+'</td>'+[r.gross,r.used,r.net].map(n=>'<td>'+(n*60).toFixed(1)+'</td>').join('')+'</tr>';});
  h+='</tbody></table>'+section('轨道仓储');
  tile.station.slots.forEach((slot,i)=>{
    h+=line(icon(slot.item)+name(slot.item),count(tile.output,slot.item).toLocaleString()+' / '+slot.limit.toLocaleString());
    if(slot.held)h+=line('运输船预订','×'+slot.held);
    h+='<div class="pills">'+['supply','storage'].map(mode=>button('gas-mode',i+','+mode,mode==='supply'?'星际供应':'仓储','pill '+(slot.remote===mode?'active':''))).join('')+'</div>';
  });
  return h+note('在目的地星际塔设置星际需求，并为该塔配备运输船。')+'<div class="actions">'+button('take','','取回现货')+button('remove-selected','','拆除并回收','danger')+'</div>';
}
