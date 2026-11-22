import {name,physical} from './catalog.js';
import {icon} from './icons.js';
import {button,escapeText,line,note,section} from './ui-format.js';
import {pilerPorts} from './piler.js';
import {alarmModes,comparisons,configureMonitor,monitorRate} from './traffic.js';
import {cargoSize} from './belt-cargo.js';
import {bodyOf} from './navigation.js';
import {distance} from './world.js';

const stateLabels={offline:'未供电',waiting:'正在采样',pass:'满足条件',fail:'未满足条件'};
const units=value=>Number(value.toFixed(1)).toLocaleString('zh-CN');
const partNames=[[-3,'上料'],[0,'一级集装'],[2,'二级集装']];
const fields={seconds:'监测周期',target:'目标流量',operator:'监测条件',filter:'货物过滤',alarm:'系统警报'};

function options(field,value,entries){
  return '<select data-meter="'+field+'" aria-label="'+fields[field]+'">'+entries.map(([id,label])=>
    '<option value="'+escapeText(id)+'"'+(value===id?' selected':'')+'>'+escapeText(label)+'</option>').join('')+'</select>';
}
const itemsMenu=physical.map(item=>[item.id,name(item.id)]);
function numberField(m,field,range){
  return '<input type="number" data-meter="'+field+'" aria-label="'+fields[field]+'" '+range+' value="'+m[field]+'">';
}

/** 读取至多 240 个环形样本，合并为 24 根柱。每根柱从左到右按采样时刻排列，未采满窗口时左端留空。 */
function history(m){
  const width=Math.min(m.buckets.length,24),grouped=Array(width).fill(0);
  for(let i=0;i<m.buckets.length;i++){
    const column=Math.floor(i*width/m.buckets.length);
    grouped[column]+=m.buckets[(m.cursor+i)%m.buckets.length];
  }
  const peak=Math.max(1,...grouped);
  return '<div class="flow-history" aria-label="最近一个监测周期的流量走势">'+grouped.map(n=>
    '<i style="height:'+Math.max(2,100*n/peak)+'%"></i>').join('')+'</div>';
}

/** 测点读取本带实际通过的货物和垛数。监测期间修改阈值只重算状态，修改周期或筛选才清空窗口。 */
export function meterPanel(game,tile){
  const m=tile.monitor,optionsForOps=Object.keys(comparisons).map(op=>[op,op]);
  const rate=monitorRate(m),piles=m.pileSum*60/m.seconds;
  let html='<div class="readout"><h3>'+icon('traffic-monitor')+'流速监测器</h3><div class="flow-read '+m.state+'"><span><i></i>'+stateLabels[m.state]+'</span><b>'+units(rate)+'</b><small>件 / 分</small></div>'+history(m)+
    line('货垛流量',units(piles)+' 垛/分')+line('平均垛高',m.pileSum?units(m.sum/m.pileSum)+' 件/垛':'—')+
    line('当前带头',tile.cargo?name(tile.cargo)+' ×'+cargoSize(tile):'空')+'</div>';
  if(game.scenario==='piling')html+=comparisonPanel(game,tile);
  html+=section('监测设置',tile.x+' / '+tile.y)+'<div class="flow-fields">'+
    '<label>监测周期 · 秒'+numberField(m,'seconds','min="1" max="60" step="0.25"')+'</label>'+
    '<label>目标 · 件/分'+numberField(m,'target','min="0" max="7200" step="1"')+'</label>'+
    '<label>监测条件'+options('operator',m.operator,optionsForOps)+'</label>'+
    '<label>货物过滤'+options('filter',m.filter||'',[['','全部物品'],...itemsMenu])+'</label>'+
    '<label>系统警报'+options('alarm',m.alarm,Object.entries(alarmModes))+'</label>'+
    '<label class="flow-check"><input type="checkbox" aria-label="本地声音警报" data-meter="speaker" '+(m.speaker?'checked':'')+'>本地声音警报</label></div>'+
    '<div class="actions">'+button('remove-selected','','拆下流速监测器','danger')+'</div>';
  return html;
}
function comparisonPanel(game,tile){
  return section('产线测点','件/分 · 垛/分')+'<div class="flow-comparison">'+partNames.map(([x,label])=>{
    const key=x+',1',other=game.planet.tiles[key]?.monitor;
    if(!other)return '';
    return button('inspect-machine',key,'<span>'+label+'</span><b>'+units(monitorRate(other))+' / '+units(other.pileSum*60/other.seconds)+'</b>',x===tile.x?'selected':'');
  }).join('')+'</div>';
}
export function pilerPanel(game,tile){
  const p=tile.piler,ports=pilerPorts(game.planet,tile);
  return '<div class="readout"><h3>'+icon(tile.type)+name(tile.type)+'</h3>'+line('工作状态',tile.status)+line('工作方向',ports.reverse?'高口进 · 拆垛':'低口进 · 集装')+
    line('机内货物',p.item?name(p.item)+' ×'+p.size:'空')+line('累计进料',p.loaded+' 件')+line('累计输出',p.delivered+' 件 / '+p.piles+' 垛')+line('最大输出高度',p.maxHeight+' 层')+'</div>'+
    (game.scenario==='piling'?comparisonPanel(game,tile):'')+note('同类货垛可堆到四层。反向接带会分成两垛，断电时货物直通。')+
    '<div class="actions">'+button('remove-selected','','拆除并回收','danger')+'</div>';
}
/** 输入控件提交时由模拟层统一校验，错误会在通用操作提示中显示，并恢复上次合法的配置。 */
export function changeMeter(game,tile,element){
  if(!tile?.monitor)throw new Error('请选择已安装的流速监测器');
  const field=element.dataset.meter;
  let value=element.value;
  if(field==='target'||field==='seconds')value=element.valueAsNumber;
  if(field==='speaker')value=element.checked;
  if(field==='filter')value=value||null;
  configureMonitor(tile.monitor,field,value);
}
let audio,nextTone=0;
/** 全星区显示触发的测点。扬声器只在本行星近处响，页面隐藏、浏览器未交互或冷却中都不启动音频。 */
export function flowSignal(game){
  let count=0,local,remote;
  const current=game.planet.flowAlert;
  if(current){count+=current.count;local=current.first;}
  for(const [id,planet] of Object.entries(game.space.parked)){
    if(planet.flowAlert){count+=planet.flowAlert.count;remote??=id;}
  }
  if(!count)return '';
  const speaker=current?.speaker&&game.planet.tiles[current.speaker];
  if(speaker&&!game.space.flight&&distance(game.mecha,speaker)<=10&&!document.hidden&&navigator.userActivation?.hasBeenActive&&performance.now()>=nextTone){
    nextTone=performance.now()+5000;
    if(globalThis.AudioContext){
      audio??=new AudioContext();
      if(audio.state==='running'){
        const oscillator=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime;
        oscillator.frequency.value=665;gain.gain.setValueAtTime(.028,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.13);
        oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(time);oscillator.stop(time+.14);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      }
    }
  }
  const label='流速警报 ×'+count;
  return local?button('inspect-machine',local,label+' · '+local,'flow-alarm'):'<span class="flow-alarm">'+label+' · '+escapeText(bodyOf(game,remote).title)+'</span>';
}
