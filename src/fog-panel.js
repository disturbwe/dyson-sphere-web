import {name} from './catalog.js';
import {total} from './stock.js';
import {distance,delta,wrap,clamp} from './world.js';
import {equipment,ammoStats,signal,jammer} from './defense-equipment.js';
import {wireless} from './tower-power.js';
import {fogModes,laser,analysisBase,maxHull,coreHealth,restoreRuin} from './fog-rules.js';
import {shieldReadout,hiveReadout} from './shield-panel.js';
import {stationed} from './space-hive.js';
import {collectNearby} from './ground-combat.js';
import {section,button,note,line} from './ui-format.js';
import {inReach,place} from './actions.js';
import {applyGround} from './reform.js';

const orders={off:'待机',guard:'自卫',base:'攻击基地',relay:'攻击驻空中继'};
const activeClass=active=>active?'pill active':'pill';
function baseState(f){
  if(f.vacant)return '当前无地面基地';
  if(f.sealed)return f.well?'地热井已接管':'钻孔已封闭';
  if(!f.base.hp)return f.relayMatter>=600?'中继站重建中':'钻孔暴露';
  if(f.units.length)return '地面袭击';
  return '行星基地';
}
/** 左侧战况条兼作地面指挥入口，波次、等级和威胁全部来自所在星球。 */
export function fogSignal(game){
  const f=game.planet.fog;
  const label=f.units.length?f.units.length+' 个来袭目标':f.sealed?'解除':f.threat.toFixed(1)+'%';
  return button('panel','battle','<span><b>'+baseState(f)+'</b><small>Lv.'+f.base.level+'</small><strong>'+label+'</strong></span><i><em style="width:'+Math.min(100,f.units.length?100:f.threat)+'%"></em></i>','fog-signal'+(f.units.length?' alert':''));
}
const radarInstallations=new WeakMap();
function radar(game){
  const f=game.planet.fog,home=f.base;
  let entry=radarInstallations.get(game.planet);
  // 读数刷新与建造频率不同。面板仅在拓扑变动后重新收集图符位置。
  if(entry?.revision!==game.planet.revision){
    entry={revision:game.planet.revision,defenses:Object.values(game.planet.tiles).filter(t=>t.defense&&t.hull!==0)};
    radarInstallations.set(game.planet,entry);
  }
  const def=entry.defenses;
  const radius=Math.max(8,Math.min(28,distance(home,game.mecha)+2));
  // 图以基地为中心。只提交当前范围内的图符，跨经度缝的单位按最短弧显示。
  function blip(point,kind,label){
    const [dx,dy]=delta(home,point),x=dx/radius*.46,y=dy/radius*.46;
    if(Math.abs(x)>.48||Math.abs(y)>.48)return '';
    return '<i class="blip '+kind+'" style="left:'+((.5+x)*100).toFixed(2)+'%;top:'+((.5-y)*100).toFixed(2)+'%" title="'+label+'"></i>';
  }
  return '<div class="fog-radar" role="img" aria-label="基地与地面单位相对位置"><span>北 ↑</span>'+blip(home,'camp',baseState(f))+def.slice(0,50).map(t=>blip(t,'outpost',name(t.type))).join('')+f.units.map(u=>blip(u,u.kind,'黑雾单位')).join('')+blip(game.mecha,'icarus','伊卡洛斯')+'</div>';
}
export function battlePanel(game){
  const f=game.planet.fog;if(!f)return note('当前星球处于和平状态。');
  let html='<div class="fog-id"><span>'+baseState(f)+'</span><strong>Lv. '+f.base.level+'</strong></div>'+radar(game);
  html+=line('威胁度',f.threat.toFixed(2)+'%')+line('基地耐久',Math.ceil(f.base.hp)+' / '+coreHealth(f.base.level))+line('已集结单位',Math.floor(f.ready))+line('当前来袭',f.units.length)+'<div class="actions">'+(f.sealed?'':button('fog-approach','','前往基地外围'))+'</div>';
  if(!f.base.hp&&!f.sealed)html+=section('核心钻孔',f.relayMatter>=600?'重建倒计时 '+Math.ceil(f.rebuild)+' s':'中继物资耗尽')+note('靠近后可接管钻孔发电，或铺设一格地基封闭。')+'<div class="actions">'+button('fog-well','','建造地热站')+button('fog-fill','','铺地基封孔')+'</div>';
  html+=section('机甲指令',game.mecha.energy.toFixed(1)+' MJ')+'<div class="pills">'+Object.entries(orders).filter(([id])=>id!=='relay'||stationed(f)).map(([id,label])=>button('fog-order',id,label,activeClass((game.mecha.battle||'off')===id))).join('')+'</div>';
  const nearby=f.debris.filter(p=>distance(game.mecha,p)<=3).reduce((sum,p)=>sum+p.count,0);
  html+=button('fog-collect','','拾取附近残骸 · '+nearby)+'<div class="divider"></div>';
  html+=section('战况记录',fogModes[game.fogMode])+line('已发起波次',f.wave)+line('摧毁单位',f.kills)+line('设施损毁 / 重建',f.fallen+' / '+f.repaired)+line('已回收物品',total(f.loot))+line('已回收沙土',f.soil);
  if(game.scenario==='defense')html+='<div class="actions">'+button('inspect-machine','-1,-1','检查战场分析基站')+button('inspect-machine','-3,-1','检查回收仓储')+'</div>';
  return html+shieldReadout(game)+hiveReadout(game);
}
export function defensePanel(tile){
  if(tile.type===wireless)return line('机甲充电',((tile.chargeKW||0)/1000).toFixed(2)+' MW');
  if(!maxHull(tile))return '';
  let html=line('设施耐久',Math.ceil(tile.hull??maxHull(tile))+' / '+maxHull(tile));
  if(tile.hull===0)return html+button('fog-repair','','使用同型备件重建','primary');
  if(!tile.defense)return html;
  const d=tile.defense;
  html+=section(tile.type===analysisBase?'战场作业':'警戒状态')+button('fog-setting','enabled',d.enabled?'停用设施':'启用设施');
  const rule=equipment[tile.type];
  if(rule){
    html+=line('已装填',d.ammo?name(d.ammo):'空')+line(tile.type===jammer?'胶囊剩余干扰次数':'弹匣剩余发数',d.rounds+' / '+(ammoStats[d.ammo]?.rounds??ammoStats[rule.ammo[0]].rounds))+line(tile.type===jammer?'累计脉冲':'累计发射',d.shots);
    if(tile.type===jammer)html+=line('累计干扰单位',d.contacts||0);
    if(rule.orbital){
      html+=section('目标高度')+'<div class="pills">';
      if(rule.far)html+=button('fog-setting','ground','地面',activeClass(d.ground!==false));
      html+=button('fog-setting','high','高空中继',activeClass(d.high))+button('fog-setting','space','太空编队',activeClass(d.space!==false))+'</div>';
    }
  }
  if(tile.type===signal)html+=line('标记目标',d.marked||0)+line('电网覆盖 / 信号半径','14 m / 64 m')+line('机甲充电',((tile.chargeKW||0)/1000).toFixed(2)+' MW');
  if(tile.type===laser)html+=line('累计照射伤害',Math.floor(d.shots));
  if(tile.type===analysisBase)html+='<div class="pills">'+button('fog-setting','collect','回收残骸',activeClass(d.collect))+button('fog-setting','mend','修理与重建',activeClass(d.mend))+'</div>';
  return html;
}
/** 战场指令沿用地表建造、铺面和拾取的库存及距离校验。前往外围只下达步行目标，不移动摄像机或瞬移。 */
export function fogCommand(game,ui,action,id,notify){
  const p=game.planet,f=p.fog,m=game.mecha;
  if(game.space.flight)throw new Error('需先抵达地面');
  if(action==='fog-setting'||action==='fog-repair'){
    const tile=p.tiles[ui.selected];if(!tile||!inReach(game,tile))throw new Error('请靠近设施');
    if(action==='fog-repair'){restoreRuin(p,tile,game.bag);notify('设施已重建');return;}
    const d=tile.defense,rule=equipment[tile.type];
    if(!d)throw new Error('所选设施不支持此作业');
    if(id==='enabled'||tile.type===analysisBase&&['collect','mend'].includes(id))d[id]=!d[id];
    else if(rule?.orbital&&(id==='space'||id==='high'||id==='ground'&&rule.far))d[id]=id==='high'?!d[id]:d[id]===false;
    else throw new Error('这座设施不能选择此目标');
    d.target=0;return;
  }
  if(!f)throw new Error('本行星没有地面战区');
  if(action==='fog-order'&&Object.hasOwn(orders,id)){m.battle=id==='off'?null:id;return;}
  if(action==='fog-collect'){notify('已回收 '+collectNearby(game)+' 件物品');return;}
  if(action==='fog-approach'){
    const [dx,dy]=delta(f.base,m),length=Math.hypot(dx,dy)||1;
    const target={x:wrap(f.base.x+dx/length*3.6),y:clamp(f.base.y+dy/length*3.6,-43,43)};
    Object.assign(m,{target,mining:null,timber:null,progress:0});return;
  }
  if(!f.base.hp&&!f.sealed){
    if(action==='fog-well'){place(game,'geothermal-power-station',f.base);notify('地热站已接管钻孔');}
    if(action==='fog-fill'){applyGround(game,f.base,1,1,false);notify('已填平核心钻孔');}
  }
}
