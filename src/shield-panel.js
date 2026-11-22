import {shieldType,capacitorMJ,shieldMap} from './planet-shield.js';
import {hiveHere,stationed,relayHealth} from './space-hive.js';
import {bodyOf} from './cluster.js';
import {button,section,line,note,powerText} from './ui-format.js';

const energy=mj=>(mj/1000).toFixed(2)+' GJ';
const percent=fraction=>(fraction*100).toFixed(1)+'%';
/** 活动星球共用的覆盖读数。设施面板另外列出该塔的维持功率与本机电容，便于判断是供电不足还是池已满。 */
export function shieldReadout(game,tile){
  const p=game.planet;
  if(!p.shield||tile&&tile.type!==shieldType)return '';
  const map=shieldMap(p);
  let html=section('行星护盾',map.sources.length+' 座发生器');
  if(tile){
    html+=line('发生器输入',powerText(tile.fieldKW))+line('本机蓄能',energy(tile.capacitorMJ)+' / '+energy(capacitorMJ));
    html+='<div class="meter"><i style="width:'+percent(tile.capacitorMJ/capacitorMJ)+'"></i></div>';
  }
  html+=line('防降落覆盖',percent(map.coverage))+line('满支撑面积',percent(map.full))+line('行星能量池',energy(p.shield.fieldMJ)+' / '+energy(map.capacity));
  html+=line('拒止中继',p.shield.repelled+' 次')+line('抵挡轨道伤害',Math.round(p.shield.absorbed))+'<div class="actions">'+button('shield-overview','','观察轨道覆盖')+'</div>';
  return html;
}
/** 读出当前星系船坞及已派出的实体，各航线按目的星标注。已有航班在离开该星时仍由模拟推进。 */
export function hiveReadout(game){
  const h=hiveHere(game),f=game.planet.fog;
  if(!h)return '';
  let html=section('太空巢穴','威胁 '+percent(h.threat/100))+line('巢穴物质 / 能量',h.matter.toLocaleString()+' / '+energy(h.energyMJ));
  const yard=h.frame<0?'空闲':h.frame<600?'加工骨架　'+h.frame+' / 600 s':'注入能量　'+(h.frame-600)+' / 300 s';
  html+=line('中继船坞',yard)+line('待命中继 / 枪骑',h.docked+' / '+h.lancers)+line('运回物质',h.delivered.toLocaleString());
  if(h.lostLancers||h.lostRelays)html+=line('拦截枪骑 / 中继',(h.lostLancers||0)+' / '+(h.lostRelays||0));
  if(h.flight){const trip=h.flight;html+=line(trip.leg==='approach'?'中继接近':'中继返航',bodyOf(game,trip.body).title+' · '+trip.left+' s');}
  if(h.raid){const a=h.raid;html+=line('枪骑编队',a.ships+' 艘 · '+({approach:'接近',fire:'对地齐射',return:'撤离'})[a.leg]+' '+a.left+' s');}
  if(stationed(f))html+=line('驻空中继耐久',Math.ceil(f.relayHP??relayHealth(f.base.level)))+note('接近中继后可命令机甲攻击。攻击驻空中继会大幅增加太空巢穴威胁。');
  return html;
}
