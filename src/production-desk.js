import {name,productionRecipes} from './catalog.js';
import {bodyOf,homeSystemOf,starOf} from './cluster.js';
import {icon} from './icons.js';
import {spans,binCount,flowReport} from './production-log.js';
import {escapeText,button,timeText} from './ui-format.js';

const sizes=['1 分钟','10 分钟','1 小时','10 小时','100 小时'];
const pageSize=7, empty=[0,0,0,0], cache=new WeakMap(), painted=new WeakMap();
const integer=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
const option=(value,label,selected)=>'<option value="'+escapeText(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+escapeText(label)+'</option>';
export const newStatsDesk=()=>({scope:'cluster',span:60,sort:'made',query:'',page:0,focus:null,relation:''});
function location(game,requested){
  const current=game.space.current,worlds=[[current,game.planet],...Object.entries(game.space.parked)];
  const all=new Map(worlds),systems=new Set(worlds.map(([id])=>homeSystemOf(id)));
  const here=bodyOf(game,current).title,star=homeSystemOf(current);
  const opts=[['cluster','整个星区'],['local','当前行星 · '+here],['system','当前星系 · '+starOf(game,star).title]];
  for(const sys of systems){
    opts.push(['s/'+sys,starOf(game,sys).title+' 星系']);
    for(const [body] of worlds)if(homeSystemOf(body)===sys)opts.push(['p/'+body,'　'+bodyOf(game,body).title]);
  }
  if(requested==='cluster')return {worlds:[...all.values()],opts,boundary:'cluster'};
  if(requested==='system'||requested.startsWith('s/')){
    const id=requested==='system'?star:requested.slice(2);
    return {worlds:worlds.filter(([body])=>homeSystemOf(body)===id).map(([,p])=>p),opts,boundary:'star'};
  }
  return {worlds:[all.get(requested==='local'?current:requested.slice(2))||game.planet],opts,boundary:'planet'};
}
function snapshot(game,desk){
  // 桌面读数按模拟秒更新，搜索、翻页和鼠标移入重复使用同一份数据，关闭面板时不扫描全星区。
  const stamp=Math.floor(game.elapsed)+':'+game.space.current+':'+desk.scope+':'+desk.span;
  let result=cache.get(game);
  if(result?.stamp===stamp)return result;
  const area=location(game,desk.scope),report=flowReport(area.worlds,game.elapsed,desk.span,area.boundary);
  result={stamp,area,report};cache.set(game,result);return result;
}
const perMinute=(count,span)=>span?decimal.format(count*60/span):integer.format(count);
function related(item,kind){
  const ids=new Set();
  for(const recipe of productionRecipes){
    const before=kind==='up'?recipe.out:recipe.in;
    if(!before[item])continue;
    for(const id of Object.keys(kind==='up'?recipe.in:recipe.out))if(id!==item)ids.add(id);
  }
  return ids;
}
function rowMarkup(row,desk){
  const [made,used,arrival,departure]=row.counts,id=escapeText(row.id),unit=desk.span?' /min':' 件';
  const label=(n,label)=>'<span aria-label="'+label+' '+perMinute(n,desk.span)+unit+'">'+perMinute(n,desk.span)+'</span>';
  return '<div class="prod-row'+(desk.focus===row.id&&!desk.relation?' chosen':'')+'">'+
    button('stat-focus',row.id,icon(row.id)+'<b>'+escapeText(name(row.id))+'</b>','prod-item')+
    '<div class="prod-pair">'+label(made,'生产')+label(used,'消耗')+'</div>'+
    (desk.span?'<canvas class="prod-chart" data-stat-plot="'+id+'" width="480" height="68" tabindex="0" aria-label="'+escapeText(name(row.id))+'，方向键逐柱查看时段收支"></canvas>':'<div class="prod-total">'+integer.format(made-used)+' <small>净产量</small></div>')+
    '<div class="prod-trade">'+label(arrival,'进口')+label(departure,'出口')+'</div></div>';
}
/** 统计桌的筛选、分页与上下游均基于同一范围的实际交易。材料没有近期活动时，在上下游视图仍显示零读数。 */
export function productionPanel(game,desk){
  const {area,report}=snapshot(game,desk),rowSet=report.rows;
  let rows;
  if(desk.focus&&desk.relation){rows=[...related(desk.focus,desk.relation)].map(id=>rowSet.get(id)||{id,counts:empty,columns:new Map()});}
  else rows=[...rowSet.values()];
  const query=desk.query.trim().toLowerCase();
  if(query)rows=rows.filter(r=>r.id.includes(query)||name(r.id).toLowerCase().includes(query));
  const lane=desk.sort==='used'?1:desk.sort==='arrival'?2:desk.sort==='departure'?3:0;
  rows.sort((a,b)=>b.counts[lane]-a.counts[lane]||name(a.id).localeCompare(name(b.id),'zh-CN'));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));desk.page=Math.min(desk.page,pages-1);
  const choices=area.opts.map(([v,t])=>option(v,t,desk.scope)).join('');
  const spansMenu=spans.map((s,i)=>option(s,sizes[i],desk.span)).join('')+option(0,'总计',desk.span);
  const sortMenu=[['made','产量'],['used','消耗'],['arrival','进口'],['departure','出口']].map(([v,t])=>option(v,t,desk.sort)).join('');
  let html='<div class="prod-controls"><label>统计范围<select aria-label="统计范围" data-stat-field="scope">'+choices+'</select></label><label>时间跨度<select aria-label="时间跨度" data-stat-field="span">'+spansMenu+'</select></label><label>排序<select aria-label="排序" data-stat-field="sort">'+sortMenu+'</select></label><label>物品搜索<input data-stat-query aria-label="物品搜索" placeholder="名称或物品 ID" value="'+escapeText(desk.query)+'"></label></div>';
  if(desk.focus)html+='<div class="prod-related"><b>'+escapeText(name(desk.focus))+'</b>'+button('stat-rel','up','原料','pill '+(desk.relation==='up'?'active':''))+button('stat-rel','down','下游产物','pill '+(desk.relation==='down'?'active':''))+button('stat-clear','','全部物品','pill')+'</div>';
  const unit=desk.span?' /min':' · 件';
  html+='<div class="prod-head"><span>物品</span><span>生产 / 消耗'+unit+'</span><span>'+(desk.span?'区间记录 · 每柱 '+interval(report.width):'累计收支')+'</span><span>进口 / 出口'+unit+'</span></div>';
  html+=rows.slice(desk.page*pageSize,(desk.page+1)*pageSize).map(r=>rowMarkup(r,desk)).join('')||'<p class="prod-empty">'+(query?'没有匹配的物品。':'这个范围还没有产消或跨星球货运记录。')+'</p>';
  html+='<div class="prod-footer"><span><i></i>生产 <i></i>消耗 <i></i>进口 <i></i>出口</span><div>'+button('stat-page','-1','‹','page-arrow')+' '+(desk.page+1)+' / '+pages+' '+button('stat-page','1','›','page-arrow')+'</div></div>';
  if(desk.span)html+='<div class="prod-inspect" aria-live="off">指向柱形查看该时段收支，点物品查看上下游。</div>';
  return html;
}
const interval=width=>width<60?width+' 秒':width%3600===0?width/3600+' 小时':width/60+' 分钟';

/** 每页最多七块小画布。每秒更新一次，一次绘制上下各两层，进口和出口用浅条叠在各自一侧。 */
export function paintProduction(host,game,desk){
  const {report,stamp}=snapshot(game,desk);
  for(const canvas of host.querySelectorAll('canvas[data-stat-plot]')){
    const id=canvas.dataset.statPlot,previous=painted.get(canvas);
    if(previous?.stamp===stamp&&previous.id===id)continue;
    const row=report.rows.get(id),columns=row?.columns||new Map();
    let max=1;for(const [made,used,arrived,shipped] of columns.values())max=Math.max(max,made+arrived,used+shipped);
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,480,68);ctx.fillStyle='#253840';ctx.fillRect(0,33,480,1);
    ctx.strokeStyle='#2a3a41';ctx.setLineDash([2,3]);ctx.beginPath();
    for(let x=40;x<480;x+=40){ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,68);}ctx.stroke();ctx.setLineDash([]);
    const scale=31/max;
    for(const [col,values] of columns){
      const x=col*8+1,[made,used,arrived,shipped]=values;
      const bar=(qty,y,sign,color)=>{if(qty){ctx.fillStyle=color;ctx.fillRect(x,y,6,sign*Math.max(1,qty*scale));}};
      bar(made,33,-1,'#60bdde');bar(arrived,33-made*scale,-1,'#b3f1e8');
      bar(used,35,1,'#e29755');bar(shipped,35+used*scale,1,'#f5db95');
    }
    painted.set(canvas,{stamp,id,report,columns});
  }
}
/** 指针用真实画布宽度定位柱，键盘也能逐柱读取。时间和件数来自同一帧记录，停产空柱显示零。 */
export function inspectColumn(canvas,host,col){
  const data=painted.get(canvas);if(!data)return;
  const i=Math.max(0,Math.min(binCount-1,col)),{report}=data;
  const start=(report.first+i)*report.width,end=Math.min(report.endTime,start+report.width);
  const hint=host.querySelector('.prod-inspect');if(!hint)return;
  canvas.dataset.column=String(i);
  const values=data.columns.get(i)||empty;
  hint.textContent=name(data.id)+'　'+(end<=0?'着陆前':timeText(Math.max(0,start))+' – '+timeText(end))+'　生产 '+values[0]+'　消耗 '+values[1]+'　进口 '+values[2]+'　出口 '+values[3]+' 件';
}
