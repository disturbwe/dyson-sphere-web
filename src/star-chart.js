import {AU,starSystem,bodyOf,positionAt,mechaPosition,separation,description} from './navigation.js';
import {heightOf} from './surface-motion.js';
import {rotationOf} from './ephemeris.js';
import {clusterOf,activeStar,starOf,spectra,LY,distanceLY} from './cluster.js';
import {makePlanet,environments} from './world.js';
import {capabilitiesOf} from './upgrades.js';
import {button,section,line,note} from './ui-format.js';
import {name} from './catalog.js';
import {gasProfile} from './gas.js';
import {isSeep} from './oil.js';
import {icon} from './icons.js';
import {chartSignals} from './beacon-panel.js';

const untouched=new WeakMap();
const formatDistance=m=>m>=LY*.5?(m/LY).toFixed(2)+' 光年':m>=4000?(m/AU).toFixed(2)+' AU':Math.round(m).toLocaleString()+' m';
/** 已访问行星报告实际余矿。未访问天体只在解锁探测并首次选中时求一次初始矿量，之后从缓存读取。 */
function survey(game,body) {
  const env=environments[body.biome];
  const local=game.space.current===body.id&&!game.space.flight;
  const here=activeStar(game),star=starOf(game,body.star);
  const level=local?1:star===here?2:distanceLY(star,here)<=6?3:4;
  const scan=game.techs.some(id=>/^universe-exploration-[1-4]$/.test(id)&&Number(id.at(-1))>=level);
  if(!scan)return note('扫描此天体的矿脉需要宇宙探索 '+['','I','II','III','IV'][level]+'。');
  if(!env)return gasProfile(body).gases.map(g=>line('<span class="scan-item">'+icon(g.item)+name(g.item)+'</span>',g.base.toFixed(3)+' /s')).join('');
  const state=body.id===game.space.current?game.planet:game.space.parked[body.id];
  function countOres(planet){const ores={};for(const vein of planet.veins)ores[vein.item]=(ores[vein.item]||0)+(isSeep(vein)?vein.rate:vein.amount);return ores;}
  let ores;
  if(state)ores=countOres(state);
  else {ores=untouched.get(body);if(!ores){ores=countOres(makePlanet(body.seed,body.biome,game.resource,body.id==='home'));untouched.set(body,ores);}}
  return Object.entries(ores).map(([id,n])=>line('<span class="scan-item">'+icon(id)+name(id)+'</span>',id==='crude-oil'?n.toFixed(2)+' /s':game.resource==='infinite'?'无限':n.toLocaleString())).join('');
}

function clusterPanel(game,ui){
  const here=activeStar(game),selected=starOf(game,ui.chartStar)||here,stars=clusterOf(game).stars;
  const systems=starSystem(game,selected.id),flight=game.space.flight;
  let html='<h3 class="chart-title">'+selected.title+'</h3><div class="chart-sub">'+spectra[selected.kind][0]+'</div>';
  html+=line('星团规模',stars.length+' 颗恒星')+line('恒星光度',selected.luminosity.toFixed(3)+' L☉')+line('距所在恒星',distanceLY(here,selected).toFixed(2)+' 光年');
  // 选框为键盘和窄屏提供同一真实目录，鼠标可直接在星图中点选星点。
  html+='<label class="body-select"><span>目标恒星</span><select id="star-select" aria-label="目标恒星">'+stars.map(star=>'<option value="'+star.id+'" '+(star===selected?'selected':'')+'>'+star.title+' · '+spectra[star.kind][0]+'</option>').join('')+'</select></label>';
  html+=button('show-system',selected.id,'查看恒星系','primary')+chartSignals(game,selected.id,true);
  html+=section('环绕天体');
  for(const body of systems)html+=button('inspect-body',body.id,body.title+' · '+description(body));
  if(flight){html+=section('航线')+line('目的地',bodyOf(game,flight.to)?.title||'自由帆航')+line('航行状态',flight.warp?'曲速中':'常规航行')+button('follow-ship','','跟随机甲');}
  return html;
}
/** 星图展示正在选择的天体，并分开报告当前位置和飞行目标。起飞/着陆交给航行模拟，面板可随时收起。 */
export function starChart(game,ui){
  if(ui.cluster&&!ui.followShip)return clusterPanel(game,ui);
  const flight=game.space.flight,body=bodyOf(game,ui.destination)||bodyOf(game,game.space.current);
  const env=environments[body.biome],distance=separation(mechaPosition(game),positionAt(game,body));
  let h=button('show-cluster','','‹ 星团总览')+'<label class="body-select"><span>目标天体</span><select aria-label="目标天体" id="body-select">'+starSystem(game,body.star).map(b=>'<option value="'+b.id+'" '+(b.id===body.id?'selected':'')+'>'+b.title+' · '+description(b)+'</option>').join('')+'</select></label>';
  h+='<h3 class="chart-title">'+body.title+'</h3><div class="chart-sub">'+description(body)+(body.parent?' · 卫星':' · 行星')+'</div>';
  if(flight){
    const destination=bodyOf(game,flight.to);
    h+=section('伊卡洛斯航行')+line('驾驶模式',flight.heading?'手动帆航':'航线导航');
    if(destination)h+=line('航标天体',destination.title)+line('航标距离',formatDistance(separation(flight.position,positionAt(game,destination))));
    h+=line('航行速度',Math.round(flight.speed)+' m/s')+line('核心能量',game.mecha.energy.toFixed(1)+' MJ');
    // 选择天体只查看星历，按导航按钮才改变航向，便于滑行中查看别的工厂。
    if(flight.heading||flight.to!==body.id)h+=button('set-course',body.id,'导航至'+body.title,'primary');
    if(!flight.heading)h+=button('take-helm','','接管手动帆航');
    h+=button('follow-ship','',ui.followShip?'切换至星图':'跟随机甲飞行');
    if(capabilitiesOf(game).warpMS)h+=button('warp','',flight.warp?'退出曲速 Caps Lock':'启动曲速 Caps Lock');
  }else if(body.id===game.space.current)h+=line('机甲位置',!env?'云顶悬浮':game.mecha.flying||game.mecha.lift?'离地 '+heightOf(game.mecha).toFixed(1)+' m':'已着陆')+button('chart','',env?'返回地表':'返回同步轨道','primary');
  else{h+=line('机甲距离',formatDistance(distance));
    h+=capabilitiesOf(game).sailMS?button('depart',body.id,env?'启航至该行星':'启航至巨星云顶','primary'):note('星际航行需要驱动引擎 II');
    if(distance>LY*.25&&capabilitiesOf(game).warpMS)h+=button('warp-depart',body.id,'曲速航行 · 1 枚翘曲器');}
  if(!env)h+=line('可用同步轨道','赤道 · 40 个站位');
  h+=chartSignals(game,body.id)+section('资源探测')+survey(game,body);
  if(env)h+=line('海洋类型',env.ocean==='lava'?'熔岩':env.ocean?name(env.ocean):'无')+line('风能利用率',Math.round(env.wind*100)+'%')+line('光能利用率',Math.round(env.solar*100)+'%');
  const spin=rotationOf(game,body);
  h+=section('轨道参数')+line('轨道半径',(body.radius/AU).toFixed(3)+' AU')+line('公转周期',body.period.toLocaleString()+' s')+line('轨道倾角',(body.tilt*180/Math.PI).toFixed(2)+'°')+line('恒星自转日',Math.round(Math.abs(spin.period))+' s'+(spin.period<0?' · 逆行':''))+line('自转轴倾角',(Math.abs(spin.tilt)*180/Math.PI).toFixed(2)+'°');
  return h;
}
