import {items, recipes, name, recipeName, ingredientList, handRecipe, unlocked, forMachine, buildable, sorters, machines, extractors, stores, belts, physical, productionRecipes} from './catalog.js';
import {count,total,accepts,planCraft} from './actions.js';
import {distance,environments} from './world.js';
import {panelReading} from './grid-power.js';
import {skyAt,sunCosine} from './ephemeris.js';
import {bodyOf} from './cluster.js';
import {emptyCell,exchanger,exchangeModes} from './energy.js';
import {tankCapacity} from './liquid-ports.js';
import {availableSite,isSeep} from './oil.js';
import {nearestTree,forestOf} from './forest.js';
import {capabilitiesOf} from './upgrades.js';
import {profiles} from './frame-budget.js';
import {icon} from './icons.js';
import {productionPanel} from './production-desk.js';
import {metadataPanel} from './metadata-panel.js';
import {homeAddress} from './matrix-meter.js';
import {savedGames} from './save.js';

import {escapeText,button,section,note,line,powerText,timeText} from './ui-format.js';
import {spherePanel} from './sphere-panel.js';
import {starChart} from './star-chart.js';
import {gasPanel,cloudSurvey} from './gas-panel.js';
import {collector} from './gas.js';
import {minePanel} from './mine-panel.js';
import {largeMiner} from './advanced-miner.js';
import {stationPanel} from './station-panel.js';
import {depotControls,inventoryTabs,personalPanel} from './distribution-panel.js';
import {coaterPanel,recipeCoating,markLabel} from './coater-panel.js';
import {gradeOf} from './proliferation.js';
import {markDirectory,markEditor} from './beacon-panel.js';
import {meterPanel,pilerPanel} from './traffic-panel.js';
import {cargoSize} from './belt-cargo.js';
import {refitControls} from './refit-panel.js';
import {beltControls} from './belt-panel.js';
import {splitterPanel} from './splitter-panel.js';
import {reformPanel} from './reform-panel.js';
import {battlePanel,defensePanel} from './fog-panel.js';
import {shieldReadout} from './shield-panel.js';
import {scenarios} from './mission-record.js';
import {blueprintPanel} from './blueprint-panel.js';
export {button,powerText,timeText} from './ui-format.js';
const row=(action,id,label,detail)=>button(action,id,'<span>'+label+'</span><small>'+detail+'</small>','row-btn');
const list=bag=>Object.entries(bag).map(([id,n])=>line(name(id)+markLabel(gradeOf(bag,id)),'× '+n)).join('');
const card=(action,id,n)=>button(action,id,icon(id)+'<b>'+escapeText(name(id))+'</b>'+(n===null?'':'<em>'+n+'</em>'),'item-card');
const grid=html=>'<div class="grid-items">'+html+'</div>';
const matches=(id,q)=>!q||name(id).includes(q)||id.toLowerCase().includes(q.toLowerCase());
const search=q=>'<input class="search" id="catalog-search" placeholder="搜索名称" aria-label="搜索名称" value="'+escapeText(q)+'">';
export const hotkeys=['mining-machine','conveyor-belt-1','sorter-1','arc-smelter','wind-turbine','tesla-tower','storage-1','assembling-machine-1','matrix-lab'];

function inventory(s,ui){
 const tabs=inventoryTabs(s,ui);
 if(tabs&&ui.botPlan)return tabs+personalPanel(s,ui);
 const bag=Object.entries(s.bag).filter(([,n])=>n>0);let h=tabs+section('机甲背包',bag.length+' 种物品')+grid(bag.map(([id,n])=>card('inspect-item',id,n).replace('</button>',markLabel(gradeOf(s.bag,id))+'</button>')).join(''));
 if(ui.item){const id=ui.item;h+='<div class="readout"><h3>'+icon(id)+name(id)+'</h3>'+line('数量',count(s.bag,id))+line('堆叠上限',items[id]?.stack||'—')+'<div class="actions">';
 if(id==='foundation')h+=button('soil-open','','打开地形改造','primary');
 if(buildable.includes(id))h+=button('tool',id,'开始建造','primary');if(recipes[id]&&handRecipe(recipes[id]))h+=button('open-recipe',id,'在复制器查看');
 if(items[id]?.fuel)h+=button('fuel',id,'装入燃料仓 ×1');h+='</div></div>';}
 h+=line('沙土储备',s.mecha.soil.toLocaleString());
 h+=section('燃料仓',s.mecha.energy.toFixed(1)+' / '+capabilitiesOf(s).coreMJ+' MJ')+(Object.keys(s.mecha.fuel).length?list(s.mecha.fuel):note('选择背包中的煤等燃料可给机甲核心充能。'));
 if(capabilitiesOf(s).drive&&!s.space.flight)h+='<div class="actions">'+button('flight','',s.mecha.flying?'降落　G':'低空飞行　G')+'</div>';
 if(s.scenario==='sandbox') h+=section('沙盒物品','点击添加一组')+search(ui.query)+grid(physical.filter(i=>matches(i.id,ui.query)).map(i=>card('sandbox-item',i.id,null)).join(''));
 return h;
}
function craft(s,ui){
 let html='';if(s.queue.length){html+=section('制作队列',s.queue.length+' 批次')+s.queue.map((j,i)=>row('cancel-craft',i,name(j.id)+' ×'+j.cycles,Math.ceil(j.time-j.progress)+' 秒 · 取消')).join('');}
 const id=ui.recipe,r=recipes[id];if(r){let cost;try{const job=planCraft(s,id,1);cost='从背包取用 '+ingredientList(job.reserved)+'，共 '+job.time+' 秒';}catch(e){cost=escapeText(e.message);}
 html+='<div class="recipe-card"><h3>'+icon(id)+recipeName(id)+'</h3>'+line('单次耗时',r.time+' s')+line('产出',ingredientList(r.out))+note('原料　'+ingredientList(r.in))+'<div class="muted">'+cost+'</div><div class="actions">'+[1,5,10].map(n=>button('craft',n,'制作 ×'+n,n===1?'primary':'')).join('')+'</div></div>';}
 html+=search(ui.query)+section('可用复制器配方')+grid(productionRecipes.filter(r=>handRecipe(r)&&unlocked(s,r)&&matches(r.id,ui.query)).map(r=>card('recipe',r.id,null)).join(''));
 return html;
}
function build(s,ui){const allowed=buildable.filter(id=>count(s.bag,id)||unlocked(s,recipes[id]));return search(ui.query)+section('建造菜单','点击设施后在地表放置')+grid(allowed.filter(id=>matches(id,ui.query)).map(id=>card('tool',id,count(s.bag,id))).join(''))+(allowed.length?'':note('先研究电磁学，再用复制器制造第一台采矿机和风力涡轮机。'))+'<div class="divider"></div><div class="actions">'+button('soil-open','','地形改造　J')+button('tool','remove','拆除模式　X','danger')+'</div>';}
function machinePanel(s,ui){
 const t=s.planet.tiles[ui.selected];if(!t)return note('选择地表设施查看运行情况。');
 if(t.beacon)return markEditor(s,s.space.current+'@'+ui.selected);
 if(t.coater)return coaterPanel(s,t)+beltControls(s,t,ui);
 if(t.monitor)return meterPanel(s,t)+beltControls(s,t,ui);
 if(t.piler)return pilerPanel(s,t);
 if(t.type==='splitter')return splitterPanel(s,t);
 if(t.type===collector)return gasPanel(s,t);
 if(t.type===largeMiner)return minePanel(s,t);
 if(t.station)return stationPanel(s,t,ui);
 let h='<div class="readout"><h3>'+icon(t.type)+name(t.type)+'</h3>'+line('工作状态',escapeText(t.status))+line('网格坐标',t.x+' / '+t.y)+(belts.includes(t.type)?line('输送高度',(t.h||0)+' 层'+(t.rise?' → '+((t.h||0)+t.rise)+' 层':'')):'')+(belts.includes(t.type)||stores.includes(t.type)?'':line('电力满足率',Math.round(t.power*100)+'%'))+'</div>';
 if(belts.includes(t.type))h+=beltControls(s,t,ui);
 else h+=refitControls(s,t);
 h+=depotControls(s,t)+defensePanel(t)+shieldReadout(s,t);
 if(t.type==='em-rail-ejector') h+=section('目标太阳帆轨道')+'<select aria-label="弹射轨道" id="launch-orbit">'+s.dyson.orbits.map((o,i)=>'<option value="'+o.id+'" '+(t.orbit===o.id?'selected':'')+'>轨道 '+(i+1)+' · '+o.radius+' m</option>').join('')+'</select>'+line('当前仰角',(t.pitch??0).toFixed(1)+'°');
 if(t.type==='vertical-launching-silo') h+=line('发射充能',Math.round(t.progress*100)+'%')+button('sphere','','查看待建结构');
 if(t.type==='ray-receiver') {
   h+=section('接收模式')+'<div class="pills">'+button('receive-mode','power','直接发电','pill '+(t.mode==='power'?'active':''));
   if(s.techs.includes('dirac-inversion-mechanism'))h+=button('receive-mode','photon','临界光子','pill '+(t.mode==='photon'?'active':''));
   h+='</div>'+line('连续接收',(t.continuous*100).toFixed(1)+'%')+line('可用功率',powerText(t.received))+line('工作透镜',t.lensTime>0?name(t.lensType||'graviton-lens'):'空')+line('透镜剩余',Math.ceil(t.lensTime)+' s');
 }
 if(t.type==='solar-panel'){
   const sun=skyAt(s,bodyOf(s,s.space.current));
   const altitude=Math.asin(Math.max(-1,Math.min(1,sunCosine(t,sun))))*180/Math.PI;
   const reading=panelReading(t);
   h+=section('光伏发电')+line('太阳高度',altitude.toFixed(1)+'°')+line('光能利用率',Math.round(environments[s.planet.biome].solar*100)+'%');
   h+=line('可发功率',powerText(reading?.available||0))+line('实际供电',powerText(reading?.delivered||0));
 }
 if(t.type==='geothermal-power-station')h+=section('地热发电')+line('热能效率',(t.efficiency*100).toFixed(1)+'%')+line('可发功率',powerText(t.efficiency*4800));
 if(t.type===emptyCell||t.type===exchanger){
   if(t.type===exchanger)h+=section('能量交换')+'<div class="pills">'+Object.entries(exchangeModes).map(([id,label])=>button('exchange-mode',id,label,'pill '+(id===t.mode?'active':''))).join('')+'</div>';
   const stored=t.energyMJ===null?'等待电芯':t.energyMJ.toFixed(1)+' / 540 MJ';
   h+=line('电芯能量',stored)+line(t.flowKW>0?'送入电网':'电网输入',powerText(Math.abs(t.flowKW)))+'<div class="meter"><i style="width:'+((t.energyMJ||0)/5.4)+'%"></i></div>';
   if(t.type===exchanger)h+=note('传送带朝向枢纽以投入电芯，背向枢纽以运走产物。充电时只使用电网余电。');
 }
 if(t.type==='fractionator'){
   h+=section('氢循环')+line('最近分馏概率',((t.fraction.lastChance||.01)*100)+'%')+line('累计通过',t.fraction.passed.toLocaleString())+line('分离重氢',t.fraction.converted.toLocaleString());
   h+=note('侧口接入氢，对侧排回氢。将正面出口接到独立传送带收集重氢。');
 }
 if(t.type.endsWith('lab')){
   const limit=capabilitiesOf(s).labLayers;
   h+=section('垂直研究站')+line('层数',t.layers+' / '+limit)+line('全塔研究速度',(capabilitiesOf(s).labHashes*t.layers*items[t.type].machine.speed)+' Hash/s');
   if(t.layers<limit)h+=button('stack-lab','','加建一层研究站');
 }
 if(t.type==='storage-tank'){
   const levels=t.layers||1,limit=capabilitiesOf(s).storageLayers;
   h+=section('储液罐')+line('容量',total(t.output).toLocaleString()+' / '+tankCapacity(t).toLocaleString())+line('垂直层数',levels+' / '+limit);
   if(levels<limit)h+=button('stack-tank','','加建一层');
   h+=note('将传送带朝向罐体以填装液体，背向罐体以排出。');
 }
 if(t.type==='oil-extractor')h+=line('油泉流量',s.planet.veins[t.seep].rate.toFixed(3)+' /s');
 if(t.veins){
   const live=t.veins.map(i=>s.planet.veins[i]).filter(v=>v.amount>0&&!v.buried);
   const cap=capabilitiesOf(s),baseRate=30;
   // 额定产量按有效矿脉计算，停电和出料堵塞会降低实际产量，矿耗显示独立的科技倍率。
   h+=line('覆盖矿脉',live.length+' 处')+line('矿脉余量',s.resource==='infinite'?'无限':live.reduce((sum,v)=>sum+v.amount,0).toLocaleString());
   h+=line('额定产量',(baseRate*live.length*cap.miningRate).toFixed(1)+' /min')+line('矿脉消耗率',(s.resource==='infinite'?0:100*cap.orePerItem).toFixed(2)+'%');
 }
 if(machines.includes(t.type)){const options=forMachine(t.type).filter(r=>unlocked(s,r)).map(r=>[r.id,recipeName(r.id)]);if(t.type.endsWith('lab'))options.unshift(['research','研究模式']);
 h+=section('工作配方')+'<select aria-label="工作配方" id="machine-recipe">'+options.map(([id,n])=>'<option value="'+id+'" '+(t.recipe===id?'selected':'')+'>'+n+'</option>').join('')+'</select>';
 if(recipes[t.recipe])h+=note('原料　'+ingredientList(recipes[t.recipe].in)+'<br>产出　'+ingredientList(recipes[t.recipe].out))+'<div class="meter"><i style="width:'+Math.min(100,t.progress*100)+'%"></i></div>';
 if(recipes[t.recipe]&&(t.inputPoints||s.techs.includes('proliferator-1-technology')))h+=recipeCoating(t);}
 h+=section('输入缓存')+(total(t.input)?list(t.input):'<span class="muted">空</span>');
 const available=Object.keys(s.bag).filter(id=>accepts(t,id,s));if(available.length)h+=section('从背包装填','每次最多 50 件')+'<div class="actions">'+available.map(id=>button('load',id,name(id)+' ×'+count(s.bag,id))).join('')+'</div>';
 h+=section('输出与存储')+(total(t.output)?list(t.output):t.cargo?line(name(t.cargo),cargoSize(t)):'<span class="muted">空</span>');
 h+='<div class="actions">'+button('take','','取回产物','primary')+button('remove-selected','','拆除并回收','danger')+'</div>';
 const links=s.planet.links.map((l,i)=>[l,i]).filter(([l])=>l.from===ui.selected||l.to===ui.selected);
 if(links.length){h+=section('关联分拣器');for(const [l,i] of links){h+=line(l.from+' → '+l.to,Math.round(l.power*100)+'%')+refitControls(s,l,i)+'<select aria-label="分拣器过滤" data-link="'+i+'"><option value="">全部物品</option>'+physical.map(p=>'<option value="'+p.id+'" '+(l.filter===p.id?'selected':'')+'>'+name(p.id)+'</option>').join('')+'</select>'+button('unlink',i,'收回这台分拣器');}}
 return h;
}
function survey(s){
 if(s.planet.biome==='gas')return cloudSurvey(s);
 const nearest=new Map(),subsurface=new Map();
 const scan=s.techs.some(id=>/^universe-exploration-[1-4]$/.test(id));
 for(const [i,v] of s.planet.veins.entries()){
   // 露头可直接采集，埋藏矿点通过扫描定位到地基格。已耗尽的固体矿不再列入两种导航目标。
   const targets=v.buried&&scan&&(isSeep(v)||v.amount>0)?subsurface:nearest;
   if(targets===nearest&&!availableSite(v))continue;
   const d=distance(s.mecha,v);
   if(!targets.has(v.item)||targets.get(v.item).d>d)targets.set(v.item,{v,d,i});
 }
 let h=section('最近资源','选择目标后机甲自动前往');
 const tree=nearestTree(s.planet,s.mecha);
 if(tree>=0)h+=row('harvest',tree,icon('log')+'采伐树木',distance(s.mecha,forestOf(s.planet).trees[tree]).toFixed(1)+' 格 · 原木');
 for(const [id,{v,d,i}] of [...nearest].sort((a,b)=>a[1].d-b[1].d)){
   const amount=isSeep(v)?v.rate.toFixed(2)+' /s · 需要萃取站':s.resource==='infinite'?'无限':v.amount.toLocaleString();
   h+=row('mine',i,icon(id)+name(id),d.toFixed(1)+' 格 · '+amount);
 }
 if(subsurface.size){h+=section('埋藏资源','定位后可用地基露出矿脉');
   for(const [id,{v,d,i}] of [...subsurface].sort((a,b)=>a[1].d-b[1].d))h+=row('locate-seam',i,icon(id)+name(id),d.toFixed(1)+' 格 · '+(isSeep(v)?v.rate.toFixed(2)+' /s':s.resource==='infinite'?'无限':v.amount.toLocaleString()));
 }
 h+=section('已建设施',Object.keys(s.planet.tiles).length+' 座');for(const [k,t] of Object.entries(s.planet.tiles).filter(([,t])=>!belts.includes(t.type)))h+=row('inspect-machine',k,icon(t.type)+name(t.type),k+'　'+escapeText(t.status));return h;
}
function stats(s,ui){
 const tab=ui.statsTab||'production';
 const tabs=[['production','生产'],['power','电力'],['metadata','元数据']];
 const bar='<div class="pills stat-tabs">'+tabs.map(([id,label])=>button('stats-tab',id,label,'pill '+(tab===id?'active':''))).join('')+'</div>';
 if(tab==='production')return bar+productionPanel(s,ui.statDesk);
 if(tab==='metadata')return bar+metadataPanel(s,ui);
 return bar+section('全行星电网')+'<div class="readout">'+line('发电能力',powerText(s.grid?.supply||0))+line('设备需求',powerText(s.grid?.demand||0))+line('实际供电',powerText(s.grid?.delivered||0))+line('独立网络',s.grid?.networks||0)+line('储能充电',powerText(s.grid?.charging||0))+line('储能放电',powerText(s.grid?.discharging||0))+line('固定电池储能',(s.grid?.stored||0).toFixed(1)+' / '+(s.grid?.capacity||0)+' MJ')+'</div>'+'<details><summary>历史总产出与采集</summary>'+list(s.stats.made)+list(s.stats.mined)+'</details>';}
function system(s,ui){let h=section('本次着陆',timeText(s.elapsed))+'<div class="actions">'+button('save','','立即保存','primary')+button('export','','导出存档')+button('import','','导入存档')+button('menu','','保存并返回标题')+button('galaxy','','银河系 · 本机记录')+(s.science.completion?button('mission-record','','主线交付记录'):'')+'</div>';
 h+=line('星区地址',homeAddress(s));
 h+=section('画面与性能',(ui.fps?Math.round(ui.fps)+' FPS':'采样中')+' · '+((ui.pixels||0)/1e6).toFixed(2)+' MP')+'<div class="pills">'+Object.entries(profiles).map(([id,p])=>button('graphics',id,p.name+' '+p.fps+' 帧','pill '+(ui.graphics===id?'active':''))).join('')+'</div>';
 h+=section('操作')+'<div class="hotkey-help"><kbd>W A S D</kbd><span>移动机甲</span><kbd>右键拖动</kbd><span>旋转镜头，滚轮缩放</span><kbd>左键</kbd><span>选择设施、采矿、前往地面</span><kbd>1 – 9 / R</kbd><span>选择设施 / 调整朝向</span><kbd>R / Tab</kbd><span>切换传送带折线方向</span><kbd>↑ ↓ / 0</kbd><span>升降带端点 / 回到地面</span><kbd>X · Shift 点击</kbd><span>拆除建造范围内相连的输送带</span><kbd>Esc / 右键</kbd><span>退出当前操作</span><kbd>M / 空格</kbd><span>行星视图 / 暂停时间</span></div>';
 let slots=[];try{slots=savedGames();}catch{}if(slots.length){h+=section('本机存档');for(const slot of slots)h+=row('read-slot',slot.slot,(scenarios[slot.scenario]||'存档')+' · '+Number(slot.seed),new Date(slot.date).toLocaleString('zh-CN'));}return h;
}
export const panelNames={marks:'信标总控',mark:'远程信标设置',battle:'地面战况',reform:'地形改造',blueprint:'工厂蓝图',chart:'星图',sphere:'戴森球编辑器',bag:'机甲背包',craft:'复制器',tech:'科技树',build:'建造',machine:'设施控制',survey:'地表勘探',stats:'统计面板',system:'系统菜单'};
const pages={marks:markDirectory,mark:(s,ui)=>markEditor(s,ui.markRef,true),battle:battlePanel,reform:reformPanel,blueprint:blueprintPanel,chart:starChart,sphere:spherePanel,bag:inventory,craft,build,machine:machinePanel,survey,stats,system};
/** 面板内容由状态生成，外层只在可见数据发生变化时替换，保留输入焦点和滚动位置。 */
export function panelBody(s,ui){return pages[ui.panel]?.(s,ui)||'';}
