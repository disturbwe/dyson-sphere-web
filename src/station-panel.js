import {physical,name} from './catalog.js';
import {exchangeFleet,setSlotItem,setSlotRule,setPort,setStationRule,stationTypes,maxSlot,chargeRate} from './stations.js';
import {portKey} from './freight.js';
import {bodyOf} from './navigation.js';
import {button,line,note,section} from './ui-format.js';
import {icon} from './icons.js';
import {count} from './stock.js';
import {inReach} from './actions.js';

const modeNames={storage:'仓储',supply:'供应',demand:'需求'};
const fmt=n=>Math.floor(n).toLocaleString('zh-CN');
function option(id,text,selected){return '<option value="'+id+'"'+(id===selected?' selected':'')+'>'+text+'</option>';}
function field(label,html){return '<label class="tower-field"><span>'+label+'</span>'+html+'</label>';}
function input(fieldName,value,min,max,step=1,aria=''){
  return '<input type="number" aria-label="'+(aria||fieldName)+'" data-terminal="'+fieldName+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'">';
}
function slotControls(game,t,slot,i){
  let h=field('物品','<select aria-label="仓位物品" data-terminal="item" data-warehouse="'+i+'">'+option('','空仓位',slot?.item)+physical.filter(it=>it.id===slot?.item||!t.station.slots.some(s=>s?.item===it.id)).map(it=>option(it.id,name(it.id),slot?.item)).join('')+'</select>');
  if(!slot)return h;
  for(const id of (stationTypes[t.type].vessels?['local','remote']:['local'])){
    const title=id==='local'?'本地':'星际';
    h+=field(title,'<select aria-label="'+title+'供需" data-terminal="'+id+'" data-warehouse="'+i+'">'+Object.entries(modeNames).map(([val,label])=>option(val,label,slot[id])).join('')+'</select>');
  }
  h+=field('仓储上限','<input type="number" aria-label="仓储上限" min="0" max="'+maxSlot(game,t)+'" value="'+slot.limit+'" data-terminal="limit" data-warehouse="'+i+'">');
  const inBag=count(game.bag,slot.item);
  if(inBag)h+=button('load',slot.item,'装入 '+name(slot.item)+' ×'+Math.min(50,inBag),'tower-compact');
  return h;
}
function cargoRows(game,t,ui){
  let h='<div class="cargo-ledger">';
  t.station.slots.forEach((slot,i)=>{
    let row='<span class="empty-slot">＋</span><span class="empty-name">选择物流物品</span>';
    if(slot){const have=count(t.output,slot.item);
      const mode=(id,prefix)=>'<span class="freight-mode '+slot[id]+'">'+prefix+modeNames[slot[id]]+'</span>';
      row='<span class="tower-icon">'+icon(slot.item)+'</span><span class="slot-stock"><b>'+name(slot.item)+'</b><em>'+fmt(have)+' <small>/ '+fmt(slot.limit)+'</small></em><i><u style="width:'+Math.min(100,100*have/Math.max(1,slot.limit))+'%"></u></i></span><span class="freight-modes">'+mode('local','本地')+(stationTypes[t.type].vessels?mode('remote','星际'):'')+'</span>';
    }
    h+=button('tower-slot',i,row,'cargo-row '+(ui.stationEdit===i?'active':''));
    if(slot&&(slot.incoming||slot.held))h+='<div class="cargo-book">'+(slot.incoming?'到货预订 +'+fmt(slot.incoming):'')+(slot.held?'　待提取 '+fmt(slot.held):'')+'</div>';
    if(ui.stationEdit===i)h+='<div class="slot-config">'+slotControls(game,t,slot,i)+'</div>';
  });
  return h+'</div>';
}
function fleetRow(game,t,kind,label){
  const s=t.station,spec=stationTypes[t.type],item=kind==='drone'?'logistics-drone':kind==='vessel'?'logistics-vessel':'space-warper';
  const stationed=s[kind==='warper'?'warpers':kind+'s'];
  const active=kind==='vessel'?s.awayVessel:kind==='drone'?s.awayDrone:0;
  const max=kind==='warper'?50:spec[kind+'s'];
  return '<div class="fleet-line">'+icon(item)+'<span>'+label+'</span><b title="停靠 / 配备">'+(stationed-active)+' <small>/ '+stationed+'</small></b>'+button('fleet-adjust',kind+',-1','−','tower-compact')+button('fleet-adjust',kind+',1','＋','tower-compact')+'<small title="站内容量">'+max+'</small></div>';
}
function settings(game,t){
  const s=t.station,spec=stationTypes[t.type];let h=field('最大充电功率 / MW',input('chargeMW',s.chargeMW,spec.vessels?30:1,spec.maxMW,1,'最大充电功率'))+field('运输机航程 / °',input('range',s.range,20,180,1,'运输机航程'))+field('运输机起运量 / %',input('minDrone',s.minDrone,1,100,1,'运输机起运量'));
  if(spec.vessels)h+=field('运输船起运量 / %',input('minVessel',s.minVessel,1,100,1,'运输船起运量'))+field('跃迁距离 / AU',input('warpAU',s.warpAU,.5,60,.5,'跃迁距离'))+field('远航需要翘曲器','<input aria-label="远航需要翘曲器" type="checkbox" data-terminal="requireWarp" '+(s.requireWarp?'checked':'')+'>');
  if(spec.vessels)h+=field('向轨道采集器取货','<input aria-label="向轨道采集器取货" type="checkbox" data-terminal="collectGas" '+(s.collectGas!==false?'checked':'')+'>');
  h+=section('传送带输出过滤');
  ['东','北','西','南'].forEach((n,i)=>{h+=field(n+'侧出口','<select aria-label="'+n+'侧出口" data-terminal="exit" data-warehouse="'+i+'">'+option('','关闭输出',s.exitItems[i])+s.slots.filter(Boolean).map(slot=>option(slot.item,name(slot.item),s.exitItems[i])).join('')+'</select>');});
  return h;
}
function manifest(game,t){
  const address=portKey(game.space.current,t),trips=game.freight.trips.filter(trip=>trip.source===address||trip.destination===address);
  if(!trips.length)return note('没有在途航班。');
  return trips.slice(0,40).map(f=>{
    const arrival=bodyOf(game,(f.destination===address?f.source:f.destination).split('/')[0]);
    const state=f.back?(f.collect?'载货返站':'空载返站'):(f.collect?'前往取货':'运送货物');
    return '<div class="manifest-row">'+icon(f.item)+'<span><b>'+name(f.item)+' ×'+f.amount+'</b><small>'+arrival.title+' · '+state+'</small></span><em>'+Math.ceil(f.remaining)+' s</em></div>';
  }).join('');
}
/** 以真实仓位、在途清单与电池读数绘制控制台。仓位和参数由下方命令校验后写入，同一面板既可巡检也能配置新塔。 */
export function stationPanel(game,t,ui){
  const s=t.station,spec=stationTypes[t.type],tab=ui.stationTab||'cargo';
  let h='<div class="tower-title">'+icon(t.type)+'<span><b>'+name(t.type)+'</b><small>'+bodyOf(game,game.space.current).title+'　('+t.x+', '+t.y+')</small></span></div>';
  h+='<div class="tower-tabs">'+[['cargo','物流仓储'],['settings','站点设置'],['manifest','运输清单']].map(([id,n])=>button('tower-tab',id,n,tab===id?'active':'')).join('')+'</div>';
  if(tab==='settings')return h+settings(game,t);
  if(tab==='manifest')return h+manifest(game,t);
  h+=cargoRows(game,t,ui)+section('运载器','停靠 / 配备')+fleetRow(game,t,'drone','运输机');
  if(spec.vessels)h+=fleetRow(game,t,'vessel','运输船')+fleetRow(game,t,'warper','翘曲器');
  h+=section('蓄电',(chargeRate(t)*t.power).toFixed(2)+' MW')+'<div class="tower-charge"><i style="width:'+(100*s.energy/spec.energy)+'%"></i></div>'+line('储能',s.energy>=1000?(s.energy/1000).toFixed(2)+' GJ':s.energy.toFixed(1)+' MJ');
  return h+'<div class="actions">'+button('take','','取回现货')+button('remove-selected','','拆除并回收','danger')+'</div>';
}
function writable(game,ui){
  const tile=game.planet.tiles[ui.selected];if(!tile?.station||!inReach(game,tile))throw new Error('请先靠近物流站');return tile;
}
export function stationClick(game,ui,command,id){
  if(command==='tower-tab'){ui.stationTab=id;ui.stationEdit=null;return;}
  if(command==='tower-slot'){const i=Number(id);ui.stationEdit=ui.stationEdit===i?null:i;return;}
  if(command==='fleet-adjust'){const [kind,n]=id.split(',');exchangeFleet(game,writable(game,ui),kind,Number(n));}
}
export function stationChange(game,ui,control){
  const tile=writable(game,ui),field=control.dataset.terminal,i=Number(control.dataset.warehouse);
  if(field==='item')setSlotItem(game,tile,i,control.value);
  else if(field==='exit')setPort(tile,i,control.value);
  else if(Number.isInteger(i))setSlotRule(game,tile,i,field,field==='limit'?Number(control.value):control.value);
  else setStationRule(tile,field,control.type==='checkbox'?control.checked:Number(control.value));
}
