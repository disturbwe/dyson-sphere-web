import {physical,name} from './catalog.js';
import {count} from './stock.js';
import {inReach,place,stackDepot} from './actions.js';
import {distributorType,botType,isDepot,slotsUsed,depotSlots,setDistributor,botChargeRate} from './depot.js';
import {transferBot,botsAway,ordersOf,addressOf,icarusPort,personalPlan,setPersonalRule,togglePersonal} from './distribution.js';
import {capabilitiesOf} from './upgrades.js';
import {button,section,line,note,powerText} from './ui-format.js';
import {icon} from './icons.js';

const labels={off:'关闭',auto:'供应与回收',supply:'供应',demand:'需求'};
const optionsCache=new Map();
function itemOptions(selected){
  // 物品目录在运行期间固定。读数会周期刷新，复用选项串避免每次打开菜单都重建整本目录。
  if(!optionsCache.has(selected))optionsCache.set(selected,'<option value="">选择物品</option>'+physical.map(it=>'<option value="'+it.id+'"'+(selected===it.id?' selected':'')+'>'+name(it.id)+'</option>').join(''));
  return optionsCache.get(selected);
}
const field=(title,control)=>'<label class="tower-field"><span>'+title+'</span>'+control+'</label>';
const tripDestination=t=>t.peer===icarusPort?'伊卡洛斯':'仓 '+t.peer;
function ruleSelect(dock,fieldName,modes){return '<select aria-label="'+(fieldName==='peers'?'仓间配送模式':'机甲配送模式')+'" data-distributor="'+fieldName+'">'+modes.map(mode=>'<option value="'+mode+'"'+(dock[fieldName]===mode?' selected':'')+'>'+(mode==='demand'&&fieldName==='player'?'回收':labels[mode])+'</option>').join('')+'</select>';}
/** 仓顶和仓体共用选中点。机库显示停靠/额定，调入的运输机和电网充入的能量分别记账。 */
export function depotControls(game,tile){
  if(!isDepot(tile.type))return '';
  const dock=tile.distributor,levels=tile.layers||1,limit=capabilitiesOf(game);
  let h='';
  if(dock){
    const away=botsAway(game.planet,tile),trips=ordersOf(game.planet).filter(trip=>trip.home===addressOf(tile)||trip.peer===addressOf(tile));
    h+='<div class="bot-console"><div class="bot-head">'+icon(distributorType)+'<b>物流配送器</b><span>覆盖 '+limit.botRange+'°</span></div>';
    h+=field('配送物品','<select aria-label="配送物品" data-distributor="item">'+itemOptions(dock.item)+'</select>');
    h+=field('伊卡洛斯',ruleSelect(dock,'player',['off','auto','supply','demand']));
    h+=field('其他配送器',ruleSelect(dock,'peers',['off','supply','demand']));
    h+='<div class="actions">'+button('bot-all','',dock.all?'✓ 回收所有物品':'回收所有物品',dock.all?'primary':'')+button('bot-inventory','','背包物流设置')+'</div>';
    h+='<div class="bot-hangar">'+icon(botType)+'<div><b>配送运输机</b><small>'+away+' 架出勤 · 单架载量 '+limit.botLoad+'</small></div><strong>'+(dock.bots-away)+' / '+dock.bots+'</strong>'+button('bot-minus','','−')+button('bot-plus','','＋')+'</div>';
    h+=line('蓄电',dock.energy.toFixed(1)+' / 27.0 MJ')+'<div class="meter"><i style="width:'+(dock.energy/27*100)+'%"></i></div>'+line('当前用电',powerText((18+botChargeRate(tile)*1000)*tile.power));
    h+=field('充电功率上限 · MW','<input type="number" aria-label="配送器充电功率上限" data-distributor="chargeMW" value="'+dock.chargeMW+'" min="0.9" max="9" step="0.1">');
    if(trips.length){h+=section('航班',trips.length+' 架');for(const t of trips.slice(0,3))h+=line(name(t.item)+' ×'+t.load,(t.back?'返航':'往 '+tripDestination(t))+' · '+Math.ceil(t.remaining)+' s');}
    for(const [id,n] of Object.entries(dock.overflow))h+=line('待入库 · '+name(id),n);
    h+='</div>';
  }
  h+=section('储物仓',slotsUsed(tile.output)+' / '+depotSlots(tile)+' 格')+line('垂直层数',levels+' / '+limit.storageLayers)+'<div class="actions">';
  if(levels<limit.storageLayers)h+=button('bot-stack','','加建一层储物仓');
  if(!dock&&game.techs.includes('distribution-logistics-system'))h+=button('bot-mount','','安装物流配送器');
  return h+'</div>';
}
export function inventoryTabs(game,ui){
  if(!game.techs.includes('distribution-logistics-system'))return '';
  return '<div class="pills">'+button('bag-stock','','背包物品','pill '+(!ui.botPlan?'active':''))+button('bot-inventory','','物流清单','pill '+(ui.botPlan?'active':''))+'</div>';
}
/** 清单允许设置背包中尚未拥有的物品。保留量留空表示不限，配送器只按当前库存与已预订数量派机。 */
export function personalPanel(game,ui){
  const plan=personalPlan(game),item=ui.botItem||Object.keys(plan.rules)[0]||'',r=plan.rules[item];
  let h=section('伊卡洛斯物流',plan.enabled?'启用':'暂停')+'<div class="actions">'+button('bot-toggle','',plan.enabled?'暂停机甲配送':'启用机甲配送',plan.enabled?'':'primary')+'</div>';
  h+='<div class="bot-rules">'+Object.entries(plan.rules).map(([id,rule])=>button('bot-edit',id,icon(id)+'<span><b>'+name(id)+'</b><small>补至 '+rule.low+'　保留 '+(rule.high??'不限')+'</small></span><strong>'+count(game.bag,id)+'</strong>',id===item?'selected':'')).join('')+'</div>';
  h+=section('物品设置')+field('物品','<select aria-label="个人物流物品" data-bot-item>'+itemOptions(item)+'</select>');
  if(item){
    h+=field('缺货时补至','<input type="number" aria-label="补货数量" id="bot-low" min="0" step="1" value="'+(r?.low??0)+'">');
    h+=field('超量时保留','<input type="number" aria-label="保留数量" id="bot-high" min="0" step="1" placeholder="不限" value="'+(r?.high??'')+'">');
    h+='<div class="actions">'+button('bot-rule',item,'保存物流设置','primary')+(r?button('bot-forget',item,'移除规则'):'')+'</div>';
  }
  return h+note('低于补货量时送来物品，高于保留量时回收入仓。两者之间的库存可自由使用。');
}
function selectedDock(game,ui){const tile=game.planet.tiles[ui.selected];if(!tile||!isDepot(tile.type)||tile.hull===0||!inReach(game,tile)||game.space.flight)throw new Error('请靠近完好的储物仓');return tile;}
export function deliveryChange(game,ui,element){
  if(element.hasAttribute('data-bot-item')){ui.botItem=element.value;return;}
  const k=element.dataset.distributor,value=k==='chargeMW'?Number(element.value):element.value||null;
  setDistributor(selectedDock(game,ui),k,value);
}
export function deliveryCommand(game,ui,action,id){
  if(action==='bot-inventory'){ui.panel='bag';ui.botPlan=true;return;}
  if(action==='bag-stock'){ui.botPlan=false;return;}
  if(action==='bot-toggle'){togglePersonal(game);return;}
  if(action==='bot-edit'){ui.botItem=id;return;}
  if(action==='bot-rule'){
    const low=document.getElementById('bot-low').value,high=document.getElementById('bot-high').value;
    setPersonalRule(game,id,Number(low),high===''?null:Number(high));return;
  }
  if(action==='bot-forget'){delete personalPlan(game).rules[id];return;}
  const tile=selectedDock(game,ui);
  if(action==='bot-mount')place(game,distributorType,tile);
  if(action==='bot-stack')stackDepot(game,tile);
  if(action==='bot-all')setDistributor(tile,'all',!tile.distributor.all);
  if(action==='bot-plus'||action==='bot-minus')transferBot(game,tile,action==='bot-minus');
}
