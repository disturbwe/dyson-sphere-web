import {cellKey} from './belt-level.js';
import {name,physical} from './catalog.js';
import {icon} from './icons.js';
import {button,escapeText,line,note,powerText,section} from './ui-format.js';
import {scopes,captions,signalIndex,registeredMarks,resolveMark,markName,markId,visibleFrom,updateBeacon,beaconDemand,beamColor} from './beacons.js';
import {homeSystemOf} from './cluster.js';

const choose=(k,options,value)=>'<select aria-label="'+k+'" data-beacon="'+k+'">'+Object.entries(options).map(([id,title])=>'<option value="'+id+'" '+(value===id?'selected':'')+'>'+escapeText(title)+'</option>').join('')+'</select>';
const row=(label,body)=>'<label class="signal-field"><span>'+label+'</span>'+body+'</label>';
const textField=(field,label,value,max)=>row(label,'<input data-beacon="'+field+'" aria-label="'+label+'" maxlength="'+max+'" value="'+escapeText(value)+'">');
const iconNames=Object.fromEntries([['','无'],...physical.map(p=>[p.id,name(p.id)])]);
function rangeField(field,label,value,min,max){
  const fieldHtml='<span class="signal-range"><input aria-label="'+label+'" type="range" data-beacon="'+field+'" min="'+min+'" max="'+max+'" step="0.5" value="'+value+'"><output>'+value+' m</output></span>';
  return row(label,fieldHtml);
}
/** 图标和颜色属于记事本文法。其他用户输入一律转义，可从导入的存档安全显示。 */
export function formattedTask(text){
  const escaped=escapeText(text);
  return escaped.replace(/&lt;color=(#[0-9a-fA-F]{6})&gt;([^<>]*?)&lt;\/color&gt;/g,'<span style="color:$1">$2</span>')
    .replace(/\[item:([\w-]+)\]/g,(raw,id)=>Object.hasOwn(iconNames,id)&&id?icon(id):raw);
}
const checks=/^\s*(?:\[([ xX])\]|(☐|☑))\s*/;
function taskList(ref,body){
  return body.split('\n').map((text,i)=>{
    const match=checks.exec(text);
    if(!match)return text?'<div>'+formattedTask(text)+'</div>':'';
    const done=match[1]?.toLowerCase()==='x'||match[2]==='☑';
    return button('mark-check',ref+'/'+i,(done?'☑　':'☐　')+formattedTask(text.slice(match[0].length)),'signal-task '+(done?'done':''));
  }).join('');
}
/** 设施和总控都编辑同一个行星对象。远程表单只修改标记配置，当前位置由导航系统持有。 */
export function markEditor(game,ref,remote=false){
  const mark=resolveMark(game,ref);
  if(!mark)return note('信标已拆除或损坏。')+button('mark-directory','','返回信标列表');
  const {body,planet,tile}=mark,b=tile.beacon;
  const liveColor=beamColor(planet,tile),power=beaconDemand(b);
  let h='<div class="signal-head" style="--signal:'+liveColor+'"><i>⌖</i><div><h3>'+escapeText(b.title)+'</h3><small>'+markName(game,body)+'　'+tile.x+' / '+tile.y+'</small></div></div>';
  h+=line('投影功率',powerText(power*tile.power)+' / '+powerText(power));
  if(b.body)h+='<div class="signal-notes">'+taskList(ref,b.body)+'</div>';
  h+=textField('title','标题',b.title,64)+row('待办事项','<textarea data-beacon="body" aria-label="待办事项" maxlength="1800" rows="3" placeholder="[ ] 待办事项">'+escapeText(b.body)+'</textarea>');
  h+=textField('tag','标签',b.tag,120)+row('可见性',choose('scope',scopes,b.scope))+row('信息常显',choose('caption',captions,b.caption));
  h+=rangeField('height','投影高度',b.height,5,37.5)+rangeField('radius','投影半径',b.radius,0,5);
  h+=row('信标颜色','<input aria-label="信标颜色" data-beacon="color" type="color" value="'+b.color+'">')+row('显示图标',choose('icon',iconNames,b.icon||''));
  const meters={'':'独立颜色'};
  for(const t of signalIndex(planet).meters){const loc=cellKey(t);meters[loc]=name('traffic-monitor')+'　'+loc;}
  if(b.meter&&!meters[b.meter])meters[b.meter]='原测点已拆除　'+b.meter;
  h+=row('同步流速监测器',choose('meter',meters,b.meter||''));
  h+='<div class="actions">'+button('mark-directory','','信标总控')+(remote?'':button('remove-selected','','拆除并回收','danger'))+'</div>';
  return h;
}
/** 总控支持搜标题、星名及标签。单页三十行使大工厂的定时读数刷新不会创建数千个 DOM 节点。 */
export function markDirectory(game,ui){
  const query=(ui.markQuery||'').trim().toLowerCase(),matches=[];
  for(const mark of registeredMarks(game)){
    const b=mark.tile.beacon;
    if(!query||[b.title,b.tag,markName(game,mark.body)].some(s=>s.toLowerCase().includes(query)))matches.push(mark);
  }
  const pages=Math.max(1,Math.ceil(matches.length/30));const page=Math.min(ui.markPage||0,pages-1);
  let h='<input type="search" data-mark-search aria-label="搜索信标" placeholder="搜索标题、标签或星球" value="'+escapeText(ui.markQuery||'')+'">'+section('全星区信标',matches.length+' 座');
  for(const {body,planet,tile} of matches.slice(page*30,page*30+30)){
    const b=tile.beacon;
    h+=button('mark-open',markId(body,tile),'<i style="background:'+beamColor(planet,tile)+'"></i><span><b>'+escapeText(b.title)+'</b><small>'+markName(game,body)+'　'+tile.x+' / '+tile.y+(b.tag?'　'+escapeText(b.tag):'')+'</small></span>','signal-row');
  }
  if(!matches.length)h+=note('没有匹配的信标。可在建造菜单放置全息信标。');
  if(pages>1)h+='<div class="pills">'+button('mark-page',Math.max(0,page-1),'上一页')+(page+1)+' / '+pages+button('mark-page',Math.min(pages-1,page+1),'下一页')+'</div>';
  return h;
}
export function chartSignals(game,body,star=false){
  let h='',n=0;
  for(const m of registeredMarks(game)){
    if((star?homeSystemOf(m.body):m.body)!==body||!visibleFrom(game,m.body,m.tile,star?'cluster':'system'))continue;
    if(n++<6)h+=button('mark-open',markId(m.body,m.tile),escapeText(m.tile.beacon.title));
  }
  return section('全息信标',n?String(n):'')+h+button('mark-directory','','打开信标总控');
}
export function markCommand(game,ui,action,id){
  if(action==='mark-directory'){ui.markRef=null;ui.panel='marks';return;}
  if(action==='mark-page'){ui.markPage=Number(id);return;}
  if(action==='mark-open'){if(!resolveMark(game,id))throw new Error('该信标已拆除');ui.markRef=id;ui.panel='mark';return;}
  if(action==='mark-check'){
    const [ref,lineId]=id.split('/'),m=resolveMark(game,ref);if(!m)return;
    const rows=m.tile.beacon.body.split('\n'),i=Number(lineId),match=checks.exec(rows[i]||'');if(!match)return;
    const done=match[1]?.toLowerCase()==='x'||match[2]==='☑';rows[i]=(done?'[ ] ':'[x] ')+rows[i].slice(match[0].length);
    updateBeacon(m.planet,m.tile,{body:rows.join('\n')});
  }
}
export function editMark(game,ui,el){
  const ref=ui.panel==='machine'?game.space.current+'@'+ui.selected:ui.markRef;
  const m=resolveMark(game,ref);if(!m)throw new Error('该信标已拆除');
  const field=el.dataset.beacon;
  let value=el.value;if(field==='height'||field==='radius')value=Number(value);
  if((field==='icon'||field==='meter')&&!value)value=null;
  updateBeacon(m.planet,m.tile,{[field]:value});
}
