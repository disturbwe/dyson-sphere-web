import {newStatsDesk,paintProduction,inspectColumn} from './production-desk.js';
import {WorldView} from './view.js';
import {relicObjective} from './relic-lesson.js';
import {shieldObjective} from './shield-lesson.js';
import {signalObjective} from './signal-lesson.js';
import {geologyObjective,geologySite,oceanBody} from './geology-lesson.js';
import {refitObjective} from './refit-lesson.js';
import {miningObjective} from './mining-lesson.js';
import {changeMine} from './mine-panel.js';
import {veinsObjective} from './veins-lesson.js';
import {fogSignal,fogCommand} from './fog-panel.js';
import {brushCommand,brushQuote,coastObjective,openBrush} from './reform-panel.js';
import {coastSurvey} from './coast-lesson.js';
import {newPlanDesk,handlePlanPoint,selectArea,planCommand,importPattern} from './blueprint-controls.js';
import {cancelWorks} from './construction-orders.js';
import {enterEditor,exitEditor,editorCommand,editGlobe} from './sphere-controls.js';
import {readLayerDesign,storeLayerDesign,designByteLimit} from './layer-design.js';
import {collector,snapMooring,sampleGas,setCollectionMode,gasProfile} from './gas.js';
import {deliveryChange,deliveryCommand} from './distribution-panel.js';
import {fillCoater,upperDirection,coaterType} from './coater.js';
import {monitorType} from './traffic.js';
import {moveStock} from './stock.js';
import {productiveRecipes} from './catalog.js';
import {markCommand,editMark} from './beacon-panel.js';
import {changeMeter,flowSignal} from './traffic-panel.js';
import {setPriority,setOutputFilter} from './splitter.js';
import {exchangeMode,exchanger,emptyCell,fullCell,heatAt} from './energy.js';
import {layerById} from './sphere.js';
import {designHint,stellarDock} from './sphere-panel.js';
import {recoverSorter} from './sorter-motion.js';
import {canRefit} from './facility-grades.js';
import {items,name,belts,sorters,recipes,ingredientList} from './catalog.js';
import {studyName,jobSpec} from './research-levels.js';
import {bridgeObjective,connectBridge} from './bridge-lesson.js';
import {replaceBelts,reverseLine,removeBeltLine} from './belt-line.js';
import {cellKey,maxBeltLevel} from './belt-level.js';
import {newGame,beltQuote,queueCraft,cancelCraft,count,add,place,mountDepot,stackTank,stackLab,layBelt,linkSorter,remove,tileAt,changeRecipe,takeOutput,loadMachine,inReach,placeError,coverage,requireRule} from './actions.js';
import {nearestTree,startFelling} from './forest.js';
import {isSeep,availableSite} from './oil.js';
import {walk,tick,STEP} from './simulation.js';
import {profiles} from './frame-budget.js';
import {stationClick,stationChange} from './station-panel.js';
import {capabilitiesOf} from './upgrades.js';
import {activeStar,homeSystemOf,starOf,starSystem} from './cluster.js';
import {AU,bodyOf,description,depart,toggleWarp,toggleFlight,positionAt,separation} from './navigation.js';
import {wrap,clamp,key,distance} from './world.js';
import {savedGames,storeGame,readGame,decode} from './save.js';
import {panelBody,panelNames,button,timeText,powerText,hotkeys} from './panels.js';
import {icon} from './icons.js';
import {GalaxyMap} from './galaxy-map.js';
import {TechDesk} from './tech-desk.js';
import {setupSector} from './metadata-panel.js';
import {bindMetadata,walletView,deliverClaims,publishPeak,redeem} from './metadata.js';
import {matrices} from './matrix-meter.js';
import {updateMarkup as setHtml} from './dom-update.js';

const $=id=>document.getElementById(id);
const canvas=$('world');
const syncSector=setupSector();
const ui={view:'menu',panel:null,tool:null,dir:0,start:null,vertical:false,selected:null,item:null,recipe:'magnetic-coil',query:'',hover:null,walking:false,paused:false};
let world,s,slot,techDesk,galaxy,toastTimer,lastPanel='',pointer=null,held=null;
const keys=new Set();
const nav=[['bag','背包','F'],['craft','复制器','E'],['tech','科技','T'],['build','建造','B'],['blueprint','蓝图','0'],['survey','勘探','V'],['stats','统计','P']];
function notify(message,error=false){const el=$('toast');el.textContent=message;el.className='toast'+(error?' error':'');el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3200);}
function save(quiet=false){try{storeGame(slot,s);publishPeak(s).catch(e=>notify(e.message,true));if(!quiet)notify('已保存本次进度');return true;}catch(e){notify('本机保存失败，可从系统菜单导出：'+e.message,true);return false;}}
function latest(){try{return savedGames()[0];}catch{return null;}}
function slotId(){return globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);}
function start(state,id,imported=false){
  // 先续发这个保存槽尚未落盘的收据；导入文件创建新槽，不重放原槽的交易。
  if(state.scenario==='landing'){bindMetadata(state,imported);deliverClaims(walletView(),state,id);}
  s=state;slot=id;ui.statsTab='production';ui.statDesk=newStatsDesk();ui.metaCount=1;ui.metaItem=matrices[0];ui.markRef=null;ui.markQuery='';ui.markPage=0;ui.bp=newPlanDesk();ui.brush=null;ui.botPlan=false;ui.botItem=null;Object.assign(ui,{view:'surface',panel:null,selected:null,start:null,tool:null,hover:null,walking:false,paused:false,query:'',recipe:'magnetic-coil',item:null});
  ui.destination=s.space.flight?.to||s.space.current;ui.chartStar=homeSystemOf(ui.destination);ui.cluster=false;ui.followShip=!!s.space.flight;
  if(s.space.flight){ui.view='systemMap';ui.panel='chart';}
  if(s.scenario==='shield'&&!s.space.flight){ui.view='orbit';world.mapAngle=0;world.mapLat=1;world.mapZoom=182;}
  keys.clear();world.setState(s);const overview=['freight','refinery','energy','gas','sorting','piling','coating','distribution','mission','relic','veins','mining','geology','defense','shield','bridge','signal','refit'].includes(s.scenario);world.zoom=overview?24:17;world.yaw=s.scenario==='defense'?-.12:overview?-.28:0;world.pitch=s.scenario==='refinery'?1:overview?.63:.82;if(s.scenario==='signal'){world.zoom=29;world.yaw=-.23;world.pitch=.59;}if(s.scenario==='bridge'){world.zoom=20;world.yaw=.31;world.pitch=.48;}if(s.scenario==='refit'){world.zoom=17.8;world.yaw=-.32;world.pitch=.70;}$('menu').hidden=true;$('hud').hidden=false;save(true);renderUI(true);
}
function surface(){
  requireRule(!s.space.flight,'抵达目的地后才能操作地表');
  if(ui.view==='sphere')exitEditor(ui);
  if(['orbit','sky','systemMap'].includes(ui.view))ui.view='surface';
}
/** 飞行存档只能从航行视图恢复。飞行中 U 切换跟随与星图，两种模式都不能远程操作出发地的设施。 */
function toggleChart(){
  if(ui.view==='sphere')exitEditor(ui);
  if(ui.view==='systemMap'&&ui.panel==='chart'){
    if(!s.space.flight){surface();ui.panel=null;}
    else ui.followShip=!ui.followShip;
  }else{
    ui.view='systemMap';ui.panel='chart';ui.destination=s.space.flight?.to||s.space.current;ui.chartStar=homeSystemOf(ui.destination);ui.cluster=false;
    ui.followShip=false;ui.hover=null;ui.start=null;ui.tool=null;
  }
  $('hover').hidden=true;renderUI(true);
}
function selectBody(id){
  const body=bodyOf(s,id);if(!body)return;
  Object.assign(ui,{destination:id,chartStar:body.star,cluster:false,followShip:false,panel:'chart'});
}
function selectStar(id){
  if(!starOf(s,id))return;
  ui.chartStar=id;ui.cluster=true;ui.followShip=false;ui.panel='chart';
}
function openSystem(id){
  const bodies=starSystem(s,id);if(!bodies.length)return;
  selectBody(bodies.find(body=>body.id===s.space.current)?.id||bodies[0].id);
}
function beginFlight(id,warp=false){depart(s,id,warp);ui.destination=id;ui.chartStar=homeSystemOf(id);ui.cluster=false;ui.view='systemMap';ui.panel='chart';ui.followShip=true;ui.tool=null;ui.start=null;notify('航线已设定，正在加速');}
function openPanel(id){
 if(ui.view==='sky')surface();
 if(s.space.flight&&['build','survey','machine','blueprint','reform','battle'].includes(id)){notify('抵达目的地后才能操作地表',true);return;}
 if(id==='battle'){surface();}
 if(id==='reform'){surface();openBrush(s,ui);ui.hover=null;}
 if(id==='blueprint'){surface();ui.bp.mode='library';ui.bp.first=null;}
 if(ui.view==='systemMap'&&!s.space.flight&&id!=='chart')surface();
 if(ui.view==='sphere')exitEditor(ui);if(ui.panel!==id)ui.query='';ui.panel=id;ui.tool=null;ui.start=null;$('hover').hidden=true;renderUI(true);}
function chooseTool(type){surface();if(type!=='remove'&&!count(s.bag,type)){ui.recipe=type;openPanel('craft');notify('背包中没有'+name(type)+'，可在复制器查看配方');return;}
  ui.panel=null;ui.tool=type;ui.start=null;ui.beltLevel=0;ui.hover=null;renderUI(true);
}
function watchSky(){
  if(ui.view==='sky'){surface();return;}
  surface();world.startSkyWatch();Object.assign(ui,{view:'sky',panel:null,tool:null,start:null,hover:null});
  $('hover').hidden=true;
}
function toggleOrbit(){if(s.space.flight){notify('抵达后可查看行星地表');return;}if(ui.view==='sphere')exitEditor(ui);ui.panel=null;ui.tool=null;ui.start=null;ui.hover=null;world.mapAngle=s.mecha.x;world.mapLat=s.mecha.y+7;ui.view=ui.view==='orbit'?'surface':'orbit';renderUI(true);}
/** 勘探点和地表点击共享同一采集指令。油泉可导航，抵达后需要架设萃取站。 */
function mine(i){
  surface();
  const vein=s.planet.veins[i];
  requireRule(vein&&availableSite(vein),'矿脉已耗尽');
  Object.assign(s.mecha,{timber:null,mining:isSeep(vein)?null:i,progress:0,target:{x:vein.x,y:vein.y}});
  ui.panel=null;
  notify(isSeep(vein)?'正在前往油泉，抵达后可放置原油萃取站':'正在前往'+name(vein.item)+'矿脉');
}
function harvest(id){surface();startFelling(s,Number(id));ui.panel=null;notify('正在前往树旁采伐');}
function treeAt(p){return nearestTree(s.planet,{x:p.realX,y:p.realY},.62);}
function inspect(k){if(ui.selected!==k){
  // 同一检查窗换到另一座设施时从标题往下读；同一设施的实时读数刷新应保留玩家正在查看的位置。
  lastPanel='';ui.chainBelts=false;ui.stationTab='cargo';ui.stationEdit=null;}ui.selected=k;ui.panel='machine';ui.query='';ui.tool=null;ui.start=null;renderUI(true);}
function cancel(){if(ui.panel==='blueprint'&&ui.bp.mode!=='library'){ui.bp.mode='library';ui.bp.first=null;ui.bp.last=null;}else if(ui.view==='sphere'){if(ui.panorama)ui.panorama=false;else if(ui.chain.length)ui.chain=[];else exitEditor(ui);}else if(ui.view==='systemMap'){if(s.space.flight){ui.followShip=false;ui.panel='chart';}else{surface();ui.panel=null;}}else if(ui.start){ui.start=null;}else if(ui.tool){ui.tool=null;}else if(ui.panel){ui.panel=null;}else if(ui.view==='orbit'||ui.view==='sky'){ui.view='surface';}else{openPanel('system');}renderUI(true);}
function displayMenu(){if(!save(true))return;ui.view='menu';ui.panel=null;ui.tool=null;ui.hover=null;ui.paused=false;keys.clear();$('hud').hidden=true;$('panel').hidden=true;$('menu').hidden=false;$('continue').hidden=!latest();}
function exportGame(){const file=new Blob([JSON.stringify(s)],{type:'application/json'}),url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='行星工厂-'+s.seed+'-'+Math.floor(s.elapsed)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
/** 银河和交付窗口共享同一份本机目录。窗口盖住三维世界时继续推进工厂，返回时恢复原本视角。 */
function closeGalaxy(){
  const shell=$('galaxy');
  if(!shell.open)return;
  if(galaxy.shownCompletion&&s.science.completion&&!s.science.completion.read){s.science.completion.read=true;save(true);}
  shell.close();shell.hidden=true;keys.clear();renderUI(true);
}
function openGalaxy(record=null){
  const inGame=ui.view!=='menu';
  if(inGame)save(true);
  let rows=[];
  try{rows=savedGames();}catch(error){notify('无法读取本机存档目录：'+error.message,true);}
  galaxy??=new GalaxyMap($('galaxy'),closeGalaxy);
  keys.clear();galaxy.show(rows,s,inGame?slot:null,record);
}
$('galaxy').addEventListener('cancel',event=>{event.preventDefault();closeGalaxy();});
const actions={
  galaxy(){openGalaxy();},
  'mission-record'(){if(s.science.completion)openGalaxy(s.science.completion);},
  lesson(){actions.new($('lesson-select').value);},
  new(id){const seed=Number($('seed').value);requireRule(Number.isInteger(seed)&&seed>0&&seed<=99999999,'种子范围为 1 至 99999999');start(newGame(seed,id,Number($('star-count').value),$('fog-mode').value,$('resource-mode').value),slotId());},
  seed(){const seed=1+Math.floor(Math.random()*99999998);$('seed').value=seed;syncSector();s=newGame(seed);world.setState(s);},
  continue(){const last=latest();requireRule(last,'还没有存档');start(readGame(last.slot),last.slot);},
  'read-slot'(id){const next=readGame(id);if(slot!==id&&!save(true))return;start(next,id);},
  panel(id){openPanel(ui.panel===id?null:id);},close(){if(ui.view==='sphere')exitEditor(ui);else ui.panel=null;},
  'watch-sky':watchSky,chart:toggleChart,'select-body':selectBody,'inspect-body':selectBody,'select-star':selectStar,
  'show-system':openSystem,'show-cluster'(){selectStar(ui.chartStar||activeStar(s).id);},
  depart(id){beginFlight(id);},'warp-depart'(id){beginFlight(id,true);},warp(){toggleWarp(s);},
  'follow-ship'(){if(s.space.flight)ui.followShip=!ui.followShip;},
  flight(){toggleFlight(s);notify(s.mecha.flying?'开启低空飞行':'机甲已着陆');},
  sphere(){if(s.space.flight){notify('抵达地表后可进入戴森球编辑器');return;}if(ui.view==='sphere')exitEditor(ui);else enterEditor(s,ui);},
  'soil-open'(){openPanel('reform');},
  'locate-seam'(id){
    const vein=s.planet.veins[Number(id)];
    requireRule(vein?.buried,'该资源点已经露出');
    const point={x:wrap(Math.round(vein.x)),y:Math.round(vein.y)};
    surface();Object.assign(s.mecha,{mining:null,timber:null,progress:0,target:point});
    if(s.techs.includes('environment-modification')){
      openPanel('reform');ui.brush.anchor=point;ui.brush.bury=false;ui.brush.cache=null;ui.hover=null;
    }
    notify('已定位埋藏资源　'+point.x+' / '+point.y);
  },
  'refit-machine'(type){
    const tile=s.planet.tiles[ui.selected];requireRule(canRefit(tile,type),'请选择同系列设备');
    const old=tile.type;place(s,type,tile,tile.dir);notify('已安装'+name(type)+'，回收'+name(old)+' ×'+(tile.layers||1));
  },
  'refit-arm'(id){
    const [index,type]=id.split('/'),arm=s.planet.links[index];
    requireRule(arm&&(arm.from===ui.selected||arm.to===ui.selected)&&canRefit(arm,type),'请选择此设施的分拣器');
    linkSorter(s,type,s.planet.tiles[arm.from],s.planet.tiles[arm.to]);notify('已换装'+name(type));
  },
  'belt-scope'(id){ui.chainBelts=id==='line';},
  'belt-turn'(){const n=reverseLine(s,s.planet.tiles[ui.selected]);notify('已反转 '+n+' 节传送带');},
  'belt-swap'(id){const n=replaceBelts(s,s.planet.tiles[ui.selected],id,ui.chainBelts);notify('已换装 '+n+' 节传送带');},
  'belt-bridge'(){connectBridge(s,layBelt);notify('已铺设 5 节绿带');},
  'geology-bed'(){
    requireRule(s.scenario==='geology'&&s.space.current===oceanBody&&!s.space.flight,'请前往水世界勘查区');
    const site=geologySite(s.planet);openPanel('reform');
    Object.assign(ui.brush,{anchor:{...site.center},size:3,bury:false,cache:null});ui.hover=null;
  },
  'geology-miner'(){
    requireRule(s.scenario==='geology'&&s.space.current===oceanBody&&!s.space.flight,'请前往水世界勘查区');
    const {intake}=geologySite(s.planet);place(s,'mining-machine',intake,0);inspect(key(intake.x,intake.y));
  },
  'coast-store'(){
    requireRule(s.scenario==='coast'&&s.space.current==='home','需要先抵达教学海岸');
    const point=coastSurvey(s.seed).fill;
    place(s,'storage-1',point);inspect(key(point.x,point.y));
    notify('仓储已建在新地坪上');
  },
  'sample-gas'(id){sampleGas(s,id);},
  'moor-nearest'(id){
    requireRule(s.planet.biome==='gas'&&!s.space.flight,'需要先进入巨星轨道');
    const p={x:Number(id),y:0};
    if(!inReach(s,p)){s.mecha.target=p;notify('正在飞往赤道泊位');return;}
    place(s,collector,p);inspect(key(p.x,p.y));
  },
  'gas-mode'(id){const [i,mode]=id.split(',');const tile=s.planet.tiles[ui.selected];requireRule(tile&&inReach(s,tile),'需要靠近采集器');setCollectionMode(tile,Number(i),mode);},
  'exchange-mode'(id){const t=s.planet.tiles[ui.selected];requireRule(t&&inReach(s,t),'需要靠近能量枢纽');exchangeMode(t,id);},
  'mine-mode'(id){setMineField('mode',id);},
  'receive-mode'(id){const t=s.planet.tiles[ui.selected];requireRule(t?.type==='ray-receiver'&&inReach(s,t),'需要靠近射线接收站');requireRule(id==='power'||(id==='photon'&&s.techs.includes('dirac-inversion-mechanism')),'需要研究狄拉克逆变机制');t.mode=id;},
  'sandbox-item'(id){requireRule(s.scenario==='sandbox'&&['components','buildings'].includes(items[id]?.category),'仅沙盒可以生成物品');add(s.bag,id,items[id].stack||100);notify('已添加一组'+name(id));},
  tool:chooseTool,view:toggleOrbit,
  'shield-overview'(){
    if(s.space.flight)throw new Error('抵达后可观察行星护盾');
    if(ui.view!=='orbit')toggleOrbit();ui.panel=null;
    if(s.scenario==='shield'&&s.space.current==='home'){world.mapAngle=0;world.mapLat=1;world.mapZoom=182;}
  },
  speed(){s.speed=s.speed===4?1:s.speed*2;ui.paused=false;},mine:id=>mine(Number(id)),harvest,
  'focus-tech'(id){openPanel('tech');techDesk.focus(id);},
  'inspect-machine':inspect,'inspect-item'(id){ui.item=id;},recipe(id){ui.recipe=id;},'open-recipe'(id){ui.recipe=id;openPanel('craft');},
  craft(id){queueCraft(s,ui.recipe,Number(id));notify(name(ui.recipe)+'已加入制作队列');},
  'cancel-craft'(id){cancelCraft(s,Number(id));notify('已取消制作，预留材料已返还');},
  'fill-coater'(id){const t=s.planet.tiles[ui.selected];requireRule(t?.coater&&inReach(s,t),'请靠近喷涂机');fillCoater(s,t,id);},
  'reverse-coater'(){const t=s.planet.tiles[ui.selected];requireRule(t?.coater&&inReach(s,t),'请靠近喷涂机');
    const c=t.coater;c.reverse=!c.reverse;c.feed={...c.feed,dir:upperDirection(t,c.reverse),travel:0};s.planet.revision++;},
  'spray-mode'(id){const t=s.planet.tiles[ui.selected];requireRule(t&&inReach(s,t)&&productiveRecipes.has(t.recipe),'该配方只支持加速生产');t.accelerate=id==='speed';},
  'split-priority'(id){setPriority(s.planet,s.planet.tiles[ui.selected],Number(id));},
  'split-mount'(){mountDepot(s,s.planet.tiles[ui.selected]);},
  'stack-tank'(){stackTank(s,s.planet.tiles[ui.selected]);},
  'stack-lab'(){stackLab(s,s.planet.tiles[ui.selected]);},
  'stop-mining'(){Object.assign(s.mecha,{mining:null,timber:null,target:null,progress:0});},fuel(id){requireRule(items[id]?.fuel&&count(s.bag,id)>0,'燃料不足');moveStock(s.bag,s.mecha,'fuel',id,1);},
  load(id){loadMachine(s,s.planet.tiles[ui.selected],id);},take(){takeOutput(s,s.planet.tiles[ui.selected]);notify('产物已放入背包');},
  'remove-selected'(){remove(s,s.planet.tiles[ui.selected]);ui.panel=null;notify('设施及库存已回收');},
  unlink(id){const idx=Number(id),l=s.planet.links[idx];requireRule(l&&inReach(s,s.planet.tiles[l.to]),'需要靠近分拣器');recoverSorter(s,l);s.planet.links.splice(idx,1);s.planet.revision++;},
  'graphics'(id){world.budget.select(id);world.resize();},
  'stats-tab'(id){ui.statsTab=id;},
  'stat-focus'(id){ui.statDesk.focus=id;ui.statDesk.relation='';},
  'stat-rel'(kind){Object.assign(ui.statDesk,{relation:kind,query:'',page:0});},
  'stat-clear'(){Object.assign(ui.statDesk,{focus:null,relation:'',page:0,query:''});},
  'stat-page'(change){ui.statDesk.page=Math.max(0,ui.statDesk.page+Number(change));},
  'meta-claim'(){claimMetadata({item:ui.metaItem,quantity:ui.metaCount});},
  save(){save();},menu:displayMenu,export:exportGame,import(){$('import').click();},
};
function claimMetadata(order){
  const game=s,id=slot;
  redeem(game,id,order,storeGame,()=>game===s&&slot===id&&ui.view!=='menu').then(()=>{notify(order.tech?'已用元数据完成研究':'实物已发至机甲背包');renderUI(true);}).catch(e=>notify(e.message,true));
}
function setMineField(field,value){
  const tile=s.planet.tiles[ui.selected];
  changeMine(s,tile,field,value,tile&&inReach(s,tile));
}
function guarded(fn){try{fn();}catch(e){if(ui.view==='menu')$('boot').textContent=e.message;notify(e.message,true);}renderUI(true);}
document.addEventListener('click',e=>{const el=e.target.closest('button[data-action]');if(el)guarded(()=>{const {action,id}=el.dataset;if(actions[action])actions[action](id);else if(action.startsWith('mark-'))markCommand(s,ui,action,id);else if(action.startsWith('bot-')||action==='bag-stock')deliveryCommand(s,ui,action,id);else if(action.startsWith('fog-'))fogCommand(s,ui,action,id,notify);else if(action.startsWith('soil-')&&ui.panel==='reform')brushCommand(s,ui,action,id,notify);else if(action.startsWith('bp-')){if(ui.panel!=='blueprint')openPanel('blueprint');planCommand(s,ui.bp,action,id,notify);}else if(['tower-tab','tower-slot','fleet-adjust'].includes(action))stationClick(s,ui,action,id);else if(ui.view==='sphere')editorCommand(s,ui,action,id);});});
document.addEventListener('input',e=>{
  if(e.target.hasAttribute('data-stat-query')){ui.statDesk.query=e.target.value;ui.statDesk.page=0;renderPanel(true);}
  if(e.target.id==='meta-count')ui.metaCount=e.target.valueAsNumber;
  if(e.target.hasAttribute('data-mark-search')){ui.markQuery=e.target.value;ui.markPage=0;renderPanel(true);}
  if(e.target.type==='range'&&e.target.dataset.beacon)e.target.nextElementSibling.textContent=e.target.value+' m';
  if(e.target.dataset.orbital&&ui.view==='sphere')ui.draft[e.target.dataset.orbital]=e.target.value;
  if(ui.panel==='blueprint'&&['title','description'].includes(e.target.dataset.planField)&&ui.bp.pattern){
    ui.bp.pattern={...ui.bp.pattern,[e.target.dataset.planField]:e.target.value};
  }
  if(e.target.id==='catalog-search'){ui.query=e.target.value;renderPanel(true);}});
document.addEventListener('change',e=>{if(e.target.dataset.terminal)guarded(()=>stationChange(s,ui,e.target));
  if(e.target.dataset.mine)guarded(()=>setMineField(e.target.dataset.mine,Number(e.target.value)));
  if(e.target.dataset.statField){
    const key=e.target.dataset.statField;
    ui.statDesk[key]=key==='span'?Number(e.target.value):e.target.value;ui.statDesk.page=0;renderPanel(true);
  }
  if(e.target.id==='meta-item'){ui.metaItem=e.target.value;renderPanel(true);}
  if(e.target.id==='star-select')guarded(()=>selectStar(e.target.value));
  if(e.target.id==='body-select')guarded(()=>selectBody(e.target.value));
  if(e.target.dataset.distributor||e.target.hasAttribute('data-bot-item'))guarded(()=>deliveryChange(s,ui,e.target));
  if(e.target.dataset.beacon)guarded(()=>editMark(s,ui,e.target));
  if(e.target.dataset.meter)guarded(()=>changeMeter(s,s.planet.tiles[ui.selected],e.target));
  if(e.target.id==='split-filter')guarded(()=>setOutputFilter(s.planet.tiles[ui.selected],e.target.value||null));
  if(e.target.id==='machine-recipe')guarded(()=>changeRecipe(s,s.planet.tiles[ui.selected],e.target.value));
  if(e.target.id==='launch-orbit')guarded(()=>{const t=s.planet.tiles[ui.selected];requireRule(t?.type==='em-rail-ejector'&&inReach(s,t),'需要靠近弹射器');t.orbit=Number(e.target.value);});
  if(e.target.dataset.link!==undefined){const l=s.planet.links[Number(e.target.dataset.link)];if(l)l.filter=e.target.value||null;}
});
$('import').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;requireRule(f.size<=12000000,'存档超过大小限制');const next=decode(await f.text());if(!save(true))return;start(next,slotId(),true);notify('已从文件导入独立存档');}catch(err){notify('导入失败：'+err.message,true);}finally{e.target.value='';}});
$('layer-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    requireRule(file.size<=designByteLimit,'壳层图纸超过大小限制');
    // 导入只更新剪贴板，玩家亲自选择空轨道粘贴，读取文件期间切换存档也不会覆盖工地。
    ui.layerPrint=storeLayerDesign(readLayerDesign(await file.text()));
    notify('壳层图纸已读入剪贴板');renderPanel(true);
  }catch(err){notify(err.message,true);}finally{e.target.value='';}
});
$('bp-file').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{await importPattern(f,ui.bp);notify('蓝图已存入本机图纸库');renderPanel(true);}
  catch(err){notify(err.message,true);}finally{e.target.value='';}
});
function renderPanel(force) {
  const panel=$('panel');
  if(ui.panel==='tech' && ui.view!=='menu'){
    panel.hidden=true;lastPanel='';
    techDesk??=new TechDesk($('research-desk'),()=>openPanel(null),notify,id=>claimMetadata({tech:id}));
    techDesk.sync(s);return;
  }
  if(techDesk && !techDesk.root.hidden)techDesk.hide();
  panel.hidden=!ui.panel || ui.view==='menu' || (ui.view==='sphere' && ui.panorama);
  if(panel.hidden) {lastPanel='';return;}
  // 用户操作数值或下拉框时暂停面板读数刷新；完成选择后命令会立即反映在模拟和界面上。
  if(!force && panel.contains(document.activeElement) && ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  panel.classList.toggle('stats-panel',ui.panel==='stats'&&ui.statsTab==='production');
  panel.classList.toggle('bp-panel',ui.panel==='blueprint');
  panel.classList.toggle('terminal-panel',ui.panel==='machine'&&!!s.planet.tiles[ui.selected]?.station);
  const switched=lastPanel!==ui.panel;
  const html='<header class="panel-header"><h2>'+panelNames[ui.panel]+'</h2>'+button('close','','×')+'</header><div class="panel-body">'+panelBody(s,ui)+'</div>';
  setHtml(panel,html,switched);
  if(ui.panel==='stats'&&ui.statsTab==='production')paintProduction(panel,s,ui.statDesk);
  lastPanel=ui.panel;
}
function lineForDelivery(flow){return '<p>送至背包 '+(flow?.toPlayer||0)+'　回收 '+(flow?.fromPlayer||0)+'　仓间 '+(flow?.between||0)+'</p>';}
function objective(){const m=s.mecha;
 if(s.scenario==='shield'&&s.space.current==='home')return shieldObjective(s);
 if(s.scenario==='signal'&&s.space.current==='home')return signalObjective(s);
 if(s.scenario==='bridge'&&s.space.current==='home')return bridgeObjective(s);
 if(s.scenario==='geology'){const text=geologyObjective(s);if(text)return text;}
 if(s.scenario==='relic'&&s.space.current==='home')return relicObjective(s);
 if(s.scenario==='veins'&&s.space.current==='home')return veinsObjective(s);
 if(s.scenario==='mining'&&s.space.current==='home')return miningObjective(s);
 if(s.scenario==='refit'&&s.space.current==='home')return refitObjective(s);
 if(s.scenario==='defense'&&s.space.current==='home'){
   const f=s.planet.fog;
   if(f.sealed)return '<small>黑雾地面防守</small><strong>钻孔已处置</strong><p>回收仓储继续接收本次防守留下的物资。</p>'+button('inspect-machine','-3,-1','检查回收仓储 →');
   if(f.kills>0&&!f.units.length)return '<small>黑雾地面防守</small><strong>检查战场回收</strong><p>分析基站已回收 '+Object.values(f.loot).reduce((a,b)=>a+b,0)+' 件物品。检查仓储，或前往基地外围处置钻孔。</p>'+button('inspect-machine','-3,-1','检查回收仓储 →');
   return '<small>黑雾地面防守</small><strong>守住开采区</strong><p>高斯机枪塔使用弹箱，激光塔由电网供能。分析基站负责回收与修理。</p>'+button('inspect-machine','-2,2','检查机枪塔 →');
 }
 if(s.scenario==='coast'&&s.space.current==='home')return coastObjective(s);
 if(s.scenario==='mission'&&s.space.current==='home'&&s.research?.id==='mission-completed'){
   const receiver=s.planet.tiles['-5,1'];
   const paid=s.research.paid['universe-matrix']||0;
   return '<small>主线交付 · 接管末批生产</small><strong>'+paid.toLocaleString()+' / 4,000 宇宙矩阵</strong><p>'+(receiver?.mode==='photon'?'已生成 '+(s.stats.made['critical-photon']||0)+' 枚临界光子，合成 '+(s.stats.made['universe-matrix']||0)+' 个宇宙矩阵。':'前 3,996 份已上传。把西侧接收站切到光子模式，另一个接收站为工厂供电。')+'</p>'+(receiver?button('inspect-machine','-5,1','查看光子接收站 →'):'')+button('panel','tech','查看研究 →');
 }
 if(s.science.completion&&!s.research)return '<small>主线任务完成</small><strong>宇宙矩阵已交付</strong><p>工厂继续生产，可以扩建戴森球和研究后续升级。</p>'+button('mission-record','','查看交付记录 →');
 if(s.research){const j=s.research,spec=jobSpec(j);return '<small>当前研究</small><strong>'+studyName(j.id)+'</strong><p>'+Math.floor(j.hash)+' / '+spec.hashes.toLocaleString()+' Hash</p>'+button('panel','tech','查看研究 →');}
 if(m.timber!==null)return '<small>机甲采集</small><strong>采伐树木</strong><p>'+ (m.progress>0?'采伐进度 '+Math.min(100,Math.floor(m.progress/1.6*100))+'%':'前往目标树木')+'</p>'+button('stop-mining','','停止采集');
 if(m.mining!==null){const v=s.planet.veins[m.mining];return '<small>机甲采集</small><strong>'+name(v.item)+'</strong><p>背包 '+count(s.bag,v.item)+'　矿脉余量 '+v.amount.toLocaleString()+'</p>'+button('stop-mining','','停止采集');}
 if(s.planet.biome==='gas'){
   const lead=gasProfile(s.planet).gases[0].item;
   return '<small>巨星同步轨道</small><strong>赤道采集</strong><p>已部署 '+Object.keys(s.planet.tiles).length+' / 40 座采集器。已运抵 '+(s.freight.delivered[lead]||0)+' 份'+name(lead)+'。</p>'+button('panel','survey','查看气体与泊位 →');
 }
 if(s.scenario==='gas')return '<small>巨星轨道采集</small><strong>接收入港气体</strong><p>在星际物流站查看货物，或打开星图前往巨星。</p>'+button('chart','','查看星图 →');
 if(s.scenario==='sandbox')return '<small>恒星工程沙盒</small><strong>完成在建壳面</strong><p>两枚火箭到达后框架合龙，节点开始吸收太阳帆。点击发射井或接收站可查看供料和能量。</p>'+button('sphere','','进入戴森球编辑器 →');
 if(s.scenario==='energy'){
   const cell=Object.entries(s.planet.tiles).find(([,t])=>t.type===exchanger)?.[0];
   const full=s.freight.delivered[fullCell]||0,empty=s.freight.delivered[emptyCell]||0;
   return '<small>跨星球输电</small><strong>追踪蓄电器往返</strong><p>熔岩星充电，初始行星放电。已送达 '+full+' 只满电池，返还 '+empty+' 只空壳。</p>'+(cell?button('inspect-machine',cell,'查看能量枢纽 →'):'');
 }
 if(s.scenario==='refinery')return '<small>原油精炼与分馏</small><strong>追踪氢的两条去路</strong><p>沿回流带查看分馏塔。矩阵研究站从同一股氢流取料，与高能石墨合成能量矩阵。</p>'+button('inspect-machine','-1,1','检查分馏塔 →');
 if(s.scenario==='distribution'){
   const flow=s.planet.distribution;
   return '<small>仓储与机甲配送</small><strong>查看仓顶运输机</strong><p>西仓向机甲送铁、向东仓补货。南仓回收超额石料。</p>'+lineForDelivery(flow)+button('inspect-machine','-4,1','查看供应仓 →')+button('bot-inventory','','设置背包供需 →');
 }
 if(s.scenario==='coating'){
   const plates=y=>s.planet.tiles['3,'+y]?.output['iron-ingot']||0;
   return '<small>喷涂与冶炼对照</small><strong>每条线各投入 120 铁矿</strong><p>额外产出线已入库 '+plates(0)+' 铁块，加速线已入库 '+plates(2)+' 铁块。</p>'+button('inspect-machine','-2,0','检查喷涂机 →')+button('inspect-machine','1,0','检查冶炼倍率 →');
 }
 if(s.scenario==='piling')return '<small>集装与流速监测</small><strong>比较三个测点的件数和垛数</strong><p>左罐供水，两台集装机连续堆叠，末台反向拆垛后送入右罐。</p>'+button('inspect-machine','2,1','检查二级集装出口 →')+(s.planet.tiles['-1,0']?.beacon?button('inspect-machine','-1,0','查看流速信标'): '');
 if(s.scenario==='sorting')return '<small>双矿分流与筛选</small><strong>沿主带追踪铁矿与铜矿</strong><p>两台矿机共用一条主带。打开下游分流器，查看西口筛出的铁矿和东口送出的铜矿。</p>'+button('inspect-machine','0,-1','检查筛选出口 →');
 if(s.scenario==='blueprint')return '<small>蓝图与建设机</small><strong>复制一段冶炼线</strong><p>框选熔炉和仓储，把图纸放在空地，观察建设机逐台送去设备。</p>'+button('bp-example','','框选示例产线 →');
 if(s.scenario==='freight')return '<small>跨星球物流线</small><strong>从熔岩星运回钛石</strong><p>星际塔派船取货，行星塔派运输机分拨，传送带送入仓储。</p>'+button('inspect-machine','-3,3','查看星际物流站 →');
 if(s.scenario==='foundry')return '<small>示例工厂</small><strong>检查第一条冶炼线</strong><p>选中仓储，取出由矿机、传送带和冶炼炉送达的铁块。</p>'+button('inspect-machine','3,0','检查仓储 →');
 if(!s.techs.includes('electromagnetism'))return '<small>着陆任务</small><strong>研究电磁学</strong><p>采集 10 铁矿与 5 铜矿，在复制器制作 10 个磁线圈，再上传研究。</p>'+button('panel','survey','寻找矿脉 →');
 return '<small>工业起步</small><strong>建立自动化产线</strong><p>在复制器制造采矿机和风机。用传送带输出矿石，再用分拣器送入冶炼炉。</p>'+button('panel','build','打开建造菜单 →');}
function toolHint(){if(ui.view==='sky')return '恒星高度 '+(world.solarAltitude??0).toFixed(1)+'° · 拖动环视 · 滚轮变焦 · H 返回';if(ui.view==='systemMap')return ui.followShip?'U 切换星图 · 自动追踪着陆点':'拖动旋转 · 滚轮缩放 · 点击天体查看资源';if(ui.view==='sphere')return designHint(ui)+' · Y 返回地表';if(ui.view==='orbit')return '拖动旋转行星 · 滚轮缩放 · M 返回地表';if(ui.paused)return '时间暂停 · 空格继续';
 if(ui.panel==='reform')return '左键铺设 · − / ＋ 调整范围 · 右键退出';
 if(ui.panel==='blueprint')return ({select:'左键拖动框选 · 也可依次点选两个角',paste:'左键放置 · R 旋转 · F 镜像 · Esc 返回图纸库',review:'点击选区设施以剔除或恢复',library:'Ctrl+C 复制选区 · Ctrl+V 粘贴蓝图'})[ui.bp.mode];
 if(!ui.tool)return '左键交互或移动　·　右键拖动旋转　·　滚轮缩放';if(ui.tool==='remove')return '拆除模式 · 点击回收 · Shift 点击连锁拆带 · Esc 退出';
 if(belts.includes(ui.tool))return name(ui.tool)+'　'+(ui.start?'选择终点':'选择起点')+' · 高度 '+(ui.beltLevel||0)+' 层 · ↑ ↓ 升降 · 0 落地 · R 切换折线';
 let hint='单击放置';if(sorters.includes(ui.tool))hint=ui.start?'选择送入端（直线 1–3 格）':'选择取货端';
 return name(ui.tool)+'　'+hint+'　·　R 旋转　·　右键取消';}
function renderUI(force=false){if(!s||ui.view==='menu')return;
 ui.graphics=world.budget.profile;
 ui.fps=world.budget.fps;
 ui.pixels=world.renderer.domElement.width*world.renderer.domElement.height;
 const stellar=ui.view==='sphere',chart=ui.view==='systemMap',body=bodyOf(s,s.space.current);
 document.body.classList.toggle('sky-watch',ui.view==='sky');
 $('sky-mode').hidden=!['surface','sky'].includes(ui.view);$('sky-mode').textContent=ui.view==='sky'?'返回地表 H':'观星 H';
 document.body.classList.toggle('chart-view',chart);document.body.classList.toggle('ship-follow',chart&&ui.followShip&&!!s.space.flight);
 $('map-labels').hidden=!chart||ui.followShip;$('chart-mode').textContent=chart?(s.space.flight?'航行镜头 U':'返回地表 U'):'星图 U';
 $('flight-mode').hidden=ui.view!=='surface'||s.planet.biome==='gas'||!capabilitiesOf(s).drive;
 $('flight-mode').textContent=s.mecha.flying?'降落 G':'低空飞行 G';
 const f=s.space.flight;$('flight-hud').hidden=!chart||!f;
 if(f){$('nav-speed').textContent=Math.round(f.speed);$('nav-range').textContent=(separation(f.position,positionAt(s,bodyOf(s,f.to)))/AU).toFixed(2);$('nav-target').textContent=bodyOf(s,f.to).title;$('nav-energy').style.width=(s.mecha.energy/capabilitiesOf(s).coreMJ*100)+'%';}
 
 document.body.classList.toggle('stellar',stellar);
 document.body.classList.toggle('panorama',stellar&&ui.panorama);
 document.body.classList.toggle('designing',stellar&&ui.sTab==='layers');
 $('stellar-dock').hidden=!stellar;
 if(stellar)setHtml($('stellar-dock'),stellarDock(s,ui));
 canvas.setAttribute('aria-label',ui.view==='sky'?'机甲视角观星，拖动调整朝向':chart?'恒星系星图，可选择天体或旋转查看航线':stellar?'恒星与戴森球，可拖动观察和选中壳层节点':'三维行星地表，可点击矿脉、设施或移动目标');
 $('sphere-mode').textContent=ui.view==='sphere'?'返回地表 Y':'戴森球 Y';
 $('sector').textContent='SECTOR '+String(s.seed).padStart(8,'0');$('location-title').textContent=ui.view==='sphere'?activeStar(s).title+' · 戴森球':chart?(f?(f.warp?'曲速航行':'太空航行'):ui.cluster?'星团总览':starOf(s,ui.chartStar||activeStar(s).id).title+'系'):body.title+' · '+(ui.view==='orbit'?'轨道视图':description(body));
 $('coordinate').textContent=(Math.abs(s.mecha.y)*2).toFixed(2)+'° '+(s.mecha.y>=0?'N':'S')+'　'+(Math.abs(s.mecha.x)*2).toFixed(2)+'° '+(s.mecha.x>=0?'E':'W');
 $('view-mode').textContent=ui.view==='orbit'?'返回地表 M':'行星视图 M';$('speed').textContent=ui.paused?'暂停':'×'+s.speed;
 $('energy-text').textContent=s.mecha.energy.toFixed(1)+' MJ';$('energy').style.width=s.mecha.energy/capabilitiesOf(s).coreMJ*100+'%';$('clock').textContent=timeText(s.elapsed);$('grid-text').textContent='供电 '+powerText(s.grid?.delivered||0);
 setHtml($('objective'),objective()+flowSignal(s)+(s.planet.fog&&!stellar&&!chart?fogSignal(s):''));$('tool-hint').textContent=toolHint();
 setHtml($('hotbar'),(s.planet.biome==='gas'?[collector]:hotkeys).map((id,i)=>'<button class="slot '+(ui.tool===id?'active ':'')+(count(s.bag,id)?'':'empty')+'" title="'+name(id)+' ['+(i+1)+']" aria-label="建造'+name(id)+'" data-action="tool" data-id="'+id+'"><kbd>'+(i+1)+'</kbd>'+icon(id)+'<em>'+count(s.bag,id)+'</em></button>').join(''));
 renderPanel(force);
}
function pickedCell(x,y){
 const placing=ui.view==='surface'&&belts.includes(ui.tool);
 const selectRaised=ui.view==='surface'&&(!ui.tool||ui.tool==='remove'||sorters.includes(ui.tool)||ui.tool===monitorType||ui.tool===coaterType)&&(!ui.panel||ui.panel==='machine'||ui.panel==='blueprint'&&ui.bp.mode==='review');
 return world.pick(x,y,placing?(ui.beltLevel||0):0,selectRaised);
}
function hover(x,y){if(ui.view==='sky'||ui.view==='menu'||ui.view==='sphere'||ui.view==='systemMap')return;const picked=pickedCell(x,y),p=ui.tool===collector&&s.planet.biome==='gas'?snapMooring(picked):picked;ui.hover=p;const tip=$('hover');tip.hidden=true;if(!p||ui.view==='orbit')return;
 if(ui.panel==='blueprint'&&ui.bp.mode==='paste'){ui.bp.anchor={x:p.x,y:p.y};return;}
 if(ui.panel==='reform'){
   const {plan}=brushQuote(s,ui);
   tip.textContent=plan.error||('地基 '+plan.cost+'　沙土 '+(plan.soil>0?'+':'')+plan.soil.toLocaleString());
   tip.hidden=false;tip.style.left=clamp(x+14,0,innerWidth-tip.offsetWidth-8)+'px';tip.style.top=clamp(y+15,0,innerHeight-tip.offsetHeight-8)+'px';return;
 }
 const t=tileAt(s,p),vein=s.planet.veins[world.veinAt(p)];
 let label='';
 if(t)label=name(t.type)+(t.h?' · 第 '+t.h+' 层':'')+' · '+t.status;
 else if(!ui.tool&&s.planet.fog&&!s.planet.fog.sealed&&distance(p,s.planet.fog.base)<1.7)label='黑雾基地 · 查看地面战况';
 else if(vein)label=name(vein.item)+' · '+(isSeep(vein)?vein.rate.toFixed(2)+' /s':vein.amount.toLocaleString());
 else if(!ui.tool&&treeAt(p)>=0)label='树木 · 点击采伐';
 if(ui.tool&&ui.tool!=='remove'&&!sorters.includes(ui.tool)){label=placeError(s,ui.tool,p,ui.dir)||name(ui.tool);if(ui.tool==='geothermal-power-station'&&heatAt(s.planet,p)>0)label+=' · 热能效率 '+(heatAt(s.planet,p)*100).toFixed(0)+'%';if(ui.tool.includes('mining-machine'))label+=' · 覆盖 '+coverage(s,p,ui.dir,ui.tool).length+' 矿脉';}
 if(belts.includes(ui.tool)){
   if(ui.start){const quote=beltQuote(s,ui.tool,ui.start,p,ui.vertical,ui.dir);label=quote.error||('铺设 '+quote.cost+' 节 · 最高 '+Math.max(...quote.path.map(n=>n.h||0))+' 层');}
   else if(t&&belts.includes(t.type))label=canRefit(t,ui.tool)?'点击换带 · Shift 换整线 · Alt 从此续接':'点击续带 · Shift 换整线';
 }
 if(t&&canRefit(t,ui.tool)&&!belts.includes(ui.tool))label=placeError(s,ui.tool,p,ui.dir)||('换装'+name(ui.tool)+' · 回收'+name(t.type));
 if(label){tip.textContent=label;tip.hidden=false;tip.style.left=clamp(x+14,0,innerWidth-tip.offsetWidth-8)+'px';tip.style.top=clamp(y+15,0,innerHeight-tip.offsetHeight-8)+'px';}}
function useWorld(x,y,chain=false,extend=false){if(ui.view==='sky')return;if(ui.view==='systemMap'){const id=world.systemMap?.pick(x,y);if(id&&!ui.followShip){if(ui.cluster)selectStar(id);else selectBody(id);}return;}if(ui.view==='sphere'){if(!ui.panorama)editGlobe(s,ui,world.stellar?.pick(x,y,layerById(s.dyson,ui.layer)));return;}const picked=pickedCell(x,y),p=ui.tool===collector&&s.planet.biome==='gas'?snapMooring(picked):picked;if(!p||ui.view==='menu')return;
 if(ui.view==='orbit'){s.mecha.target={x:p.realX,y:p.realY};s.mecha.mining=null;s.mecha.timber=null;notify('已设置地表目的地');return;}
 const cell={x:p.x,y:p.y,...(p.h?{h:p.h}:{})};
 if(ui.panel==='reform'){brushCommand(s,ui,'soil-apply','',notify,cell);return;}
 if(ui.panel==='blueprint'&&ui.bp.mode!=='library'){handlePlanPoint(s,ui.bp,cell,notify);return;}
 if(ui.tool==='remove'){if(s.planet.construction?.sites[cellKey(p)]){cancelWorks(s,cellKey(p));notify('已撤回此工地');return;}if(chain&&belts.includes(tileAt(s,p)?.type)){const n=removeBeltLine(s,tileAt(s,p));notify('已回收 '+n+' 节传送带');}
 else {remove(s,p);notify('已拆除并回收');}return;}
 if(belts.includes(ui.tool)){if(!ui.start){const t=tileAt(s,p);
   // 不同型号覆盖原位换带。Alt 仍可从异色旧带续接，终点的旧带可继续作为合流口。
   if(t&&belts.includes(t.type)&&!extend&&(chain||canRefit(t,ui.tool))){
     const n=replaceBelts(s,t,ui.tool,chain);notify('已换装 '+n+' 节传送带');return;
   }
   const msg=t&&belts.includes(t.type)&&t.hull!==0&&inReach(s,p)?'':placeError(s,ui.tool,p,ui.dir);requireRule(!msg,msg);ui.start=cell;}else{layBelt(s,ui.tool,ui.start,cell,ui.vertical,ui.dir);ui.start=null;}return;}
 if(sorters.includes(ui.tool)){if(!ui.start){requireRule(tileAt(s,p),'选择取货设施或传送带');ui.start=cell;}else{linkSorter(s,ui.tool,ui.start,cell);ui.start=null;}return;}
 if(ui.tool){const swap=canRefit(tileAt(s,cell),ui.tool);place(s,ui.tool,cell,ui.dir);notify((swap?'已换装':'已放置')+name(ui.tool));return;}if(tileAt(s,p)){inspect(cellKey(p));return;}
 if(s.planet.fog&&!s.planet.fog.sealed&&distance(p,s.planet.fog.base)<1.7){openPanel('battle');return;}
 const vein=world.veinAt(p);if(vein>=0){mine(vein);return;}
 const tree=treeAt(p);if(tree>=0){harvest(tree);return;}
 ui.panel=null;s.mecha.mining=null;s.mecha.timber=null;s.mecha.target={x:p.realX,y:p.realY};
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(ui.view==='menu')return;pointer={x:e.clientX,y:e.clientY};held={...pointer,lastX:e.clientX,lastY:e.clientY,button:e.button,drag:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(ui.view==='menu')return;pointer={x:e.clientX,y:e.clientY};if(held){const dx=e.clientX-held.lastX,dy=e.clientY-held.lastY;if(Math.hypot(e.clientX-held.x,e.clientY-held.y)>4)held.drag=true;
 if(held.drag&&held.button===0&&ui.panel==='blueprint'&&ui.bp.mode==='select'){
   ui.bp.first??=world.pick(held.x,held.y);ui.bp.last=world.pick(e.clientX,e.clientY);
 }else if(held.drag&&(held.button!==0||e.pointerType==='touch'||ui.view==='orbit'||ui.view==='sphere'||ui.view==='sky'||ui.view==='systemMap')){if(ui.view==='sky'){world.watchYaw+=dx*.005;world.watchPitch=clamp(world.watchPitch+dy*.005,-1.25,1.49);}else if(ui.view==='systemMap'&&world.systemMap){const map=world.systemMap;if(ui.followShip){map.chaseYaw-=dx*.006;map.chasePitch=clamp(map.chasePitch+dy*.005,-1.35,1.35);}else{map.yaw-=dx*.006;map.lat=clamp(map.lat+dy*.005,-1.39,1.39);}}else if(ui.view==='sphere'&&world.stellar){world.stellar.yaw-=dx*.007;world.stellar.latitude=clamp(world.stellar.latitude+dy*.007,-1.5,1.5);}else if(ui.view==='orbit'){world.mapAngle=wrap(world.mapAngle-dx*.16);world.mapLat=clamp(world.mapLat+dy*.14,-43,43);}else{world.yaw-=dx*.009;world.pitch=clamp(world.pitch+dy*.006,.24,1.49);}}
 held.lastX=e.clientX;held.lastY=e.clientY;}$('hover').hidden=true;if(!held?.drag)hover(e.clientX,e.clientY);});
canvas.addEventListener('pointerup',e=>{if(!held)return;const click=!held.drag;held=null;
 if(!click&&e.button===0&&ui.panel==='blueprint'&&ui.bp.mode==='select'&&ui.bp.first&&ui.bp.last){guarded(()=>selectArea(s,ui.bp,ui.bp.first,ui.bp.last));return;}
 if(click){if(e.button===2){if(ui.tool||ui.start||ui.panel)cancel();}else if(e.button===0)guarded(()=>useWorld(e.clientX,e.clientY,e.shiftKey,e.altKey));}});
canvas.addEventListener('pointercancel',()=>held=null);canvas.addEventListener('pointerleave',()=>{ui.hover=null;$('hover').hidden=true;});
canvas.addEventListener('wheel',e=>{if(ui.view==='menu')return;e.preventDefault();if(ui.view==='sky')world.watchFov=clamp(world.watchFov*Math.exp(e.deltaY*.0008),18,78);else if(ui.view==='systemMap'&&world.systemMap){const map=world.systemMap;if(ui.followShip)map.chaseRange=clamp(map.chaseRange*Math.exp(e.deltaY*.001),.006,.043);else map.distance=clamp(map.distance*Math.exp(e.deltaY*.001),14,155);}else if(ui.view==='sphere'&&world.stellar)world.stellar.distance=clamp(world.stellar.distance*Math.exp(e.deltaY*.001),1.3,7);else if(ui.view==='orbit')world.mapZoom=clamp(world.mapZoom*Math.exp(e.deltaY*.001),76,255);else world.zoom=clamp(world.zoom*Math.exp(e.deltaY*.001),6,56);},{passive:false});
$('panel').addEventListener('pointermove',event=>{
  const plot=event.target;if(!plot.hasAttribute('data-stat-plot'))return;
  const rect=plot.getBoundingClientRect();inspectColumn(plot,$('panel'),Math.floor(60*(event.clientX-rect.left)/rect.width));
});
window.addEventListener('keydown',e=>{
  if(e.target.hasAttribute?.('data-stat-plot')&&['ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();inspectColumn(e.target,$('panel'),Number(e.target.dataset.column??59)+(e.key==='ArrowLeft'?-1:1));return;
  }
  if($('galaxy').open||ui.view==='menu'||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.altKey)return;
 const k=e.key.toLowerCase();
 if(e.ctrlKey||e.metaKey){
   if(ui.view==='surface'&&!e.repeat&&['c','v'].includes(k)){e.preventDefault();guarded(()=>{if(ui.panel!=='blueprint')openPanel('blueprint');planCommand(s,ui.bp,k==='c'?'bp-copy':'bp-paste','',notify);});}return;
 }
 if(belts.includes(ui.tool)&&['arrowup','arrowdown','0'].includes(k)){
   e.preventDefault();ui.beltLevel=k==='0'?0:clamp((ui.beltLevel||0)+(k==='arrowup'?1:-1),0,maxBeltLevel(s));
   if(pointer)hover(pointer.x,pointer.y);renderUI(true);return;
 }
 if(ui.panel==='blueprint'&&ui.bp.mode==='paste'&&['r','f'].includes(k)){if(!e.repeat)guarded(()=>planCommand(s,ui.bp,k==='r'?'bp-turn':'bp-mirror','',notify));return;}
 if(k==='z'&&!e.repeat&&ui.view==='surface'&&s.planet.fog){openPanel(ui.panel==='battle'?null:'battle');return;}
 if(k==='j'&&!e.repeat){guarded(()=>openPanel(ui.panel==='reform'?null:'reform'));return;}
 if(ui.panel==='reform'&&['-','+','='].includes(k)){e.preventDefault();guarded(()=>brushCommand(s,ui,'soil-size',k==='-'?'-1':'1',notify));return;}
 if('wasd'.split('').includes(k)){keys.add(k);return;}if(e.repeat)return;
 const panel=nav.find(n=>n[2].toLowerCase()===k);if(panel){actions.panel(panel[0]);return;}
 if(k==='escape')cancel();else if(k==='capslock'&&s.space.flight&&!e.repeat)guarded(actions.warp);else if(k==='u')actions.chart();else if(k==='g'&&ui.view==='surface')guarded(actions.flight);else if(k==='h'&&['surface','sky'].includes(ui.view))watchSky();else if(k==='h'&&ui.view==='sphere')editorCommand(s,ui,'panorama');else if(k==='y')actions.sphere();else if(k==='m')toggleOrbit();else if(k==='r'&&ui.tool){if(belts.includes(ui.tool))ui.vertical=!ui.vertical;ui.dir=(ui.dir+1)%4;}else if(k==='tab'&&ui.tool){e.preventDefault();ui.vertical=!ui.vertical;}
 else if(k==='x')guarded(()=>chooseTool('remove'));else if(k===' '){e.preventDefault();ui.paused=!ui.paused;}else if(/^[1-9]$/.test(k))guarded(()=>{const type=(s.planet.biome==='gas'?[collector]:hotkeys)[Number(k)-1];if(type)chooseTool(type);});renderUI(true);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
let prev=0,acc=0,uiAge=0,saveAge=0,realTime=0,frameId=0,nextDraw=0;
function scheduleFrame(){if(!document.hidden&&!frameId)frameId=requestAnimationFrame(frame);}
function frame(ms){
 frameId=0;if(document.hidden)return;
 const scienceOpen=ui.view!=='menu'&&ui.panel==='tech';
 const covered=scienceOpen||$('galaxy').open;
 const limit=ui.view==='menu'?24:covered?30:profiles[world.budget.profile].fps,interval=1000/limit;
 // 通过绝对绘制时刻限帧，高刷显示器不会让 GPU 满速空转，相邻刷新率的取整误差也不会累积。
 if(ms+.6<nextDraw){scheduleFrame();return;}
 nextDraw=nextDraw&&ms-nextDraw<interval?nextDraw+interval:ms+interval;
 const actual=prev?(ms-prev)/1000:0,dt=Math.min(.2,actual);prev=ms;realTime+=dt;
 if(!covered && world.budget.record(actual,limit))world.resize();
 if(ui.view!=='menu'&&!ui.paused){acc+=dt*s.speed;
   // 四倍速和很慢的 CPU 同时出现时，单帧最多补八步，额外积压舍弃避免输入被追帧堵住。
   let steps=0;const deadline=performance.now()+8;
   while(acc>=STEP && steps<8 && (!steps||performance.now()<deadline)){steps++;const dx=Number(keys.has('d'))-Number(keys.has('a')),dy=Number(keys.has('w'))-Number(keys.has('s'));ui.walking=ui.view==='surface'&&!covered&&!!(dx||dy);
     if(ui.walking){s.mecha.target=null;s.mecha.mining=null;s.mecha.timber=null;const a=world.yaw;walk(s,dx*Math.cos(a)-dy*Math.sin(a),dx*Math.sin(a)+dy*Math.cos(a),STEP);}
     const previousBody=s.space.current;
     tick(s);acc-=STEP;
     if(previousBody!==s.space.current){
       ui.view='surface';ui.panel=null;ui.followShip=false;ui.selected=null;ui.hover=null;
       ui.destination=s.space.current;ui.chartStar=activeStar(s).id;ui.cluster=false;world.cameraReady=false;notify((s.planet.biome==='gas'?'已进入云顶轨道 ':'已着陆 ')+bodyOf(s,s.space.current).title);renderUI(true);
     }
   }
   if(acc>=STEP)acc%=STEP;
   saveAge+=dt;if(saveAge>15){saveAge=0;save(true);} }
 if((uiAge+=dt)>.22){
   uiAge=0;
   if(ui.view!=='menu'&&s.science.completion&&!s.science.completion.read&&!$('galaxy').open)openGalaxy(s.science.completion);
   if(!$('galaxy').open){if(scienceOpen)renderPanel(false);else renderUI();}
 }
 // 图谱不透明，模拟仍推进，三维背景无需提交绘制或更新动态网格。
 if(!covered)world.draw(ui,realTime,dt);
 scheduleFrame();
}
document.addEventListener('visibilitychange',() => {
  if(document.hidden){cancelAnimationFrame(frameId);frameId=0;if(slot&&ui.view!=='menu')save(true);}
  prev=0;nextDraw=0;acc=0;keys.clear();world?.budget.reset();if(world)scheduleFrame();
});
window.addEventListener('pagehide',()=>{if(slot&&ui.view!=='menu')save(true);});
try{
 s=newGame(Number($('seed').value));world=new WorldView(canvas);world.setState(s);$('nav').innerHTML=nav.map(([id,n,k])=>button('panel',id,n+' <kbd>'+k+'</kbd>')).join('');
 $('boot').hidden=true;$('menu').hidden=false;$('continue').hidden=!latest();scheduleFrame();
}catch(e){$('boot').hidden=false;$('boot').textContent='无法启动三维场景，请确认浏览器支持 WebGL 2。'+e.message;console.error(e);}