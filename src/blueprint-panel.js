import {name,belts} from './catalog.js';
import {icon} from './icons.js';
import {escapeText,button,section,note,line} from './ui-format.js';
import {blueprintBill,blueprintSize} from './blueprint.js';
import {blueprints} from './blueprint-library.js';
import {previewAt} from './blueprint-controls.js';
import {capabilitiesOf} from './upgrades.js';

const thumbnails=new WeakMap();
const bills=new WeakMap();
function billOf(pattern){if(!bills.has(pattern))bills.set(pattern,blueprintBill(pattern));return bills.get(pattern);}
/** 用实际图纸坐标画出设备、带向和分拣线。缩略图按图纸对象缓存，计数更新时无需重绘或重传像素。 */
function thumb(p){
  if(thumbnails.has(p))return thumbnails.get(p);
  const c=document.createElement('canvas');c.width=480;c.height=168;
  const ctx=c.getContext('2d'),step=Math.min(34,420/(p.width+1),132/(p.height+1));
  const px=x=>240+(x-(p.width-1)/2)*step,py=y=>84-(y-(p.height-1)/2)*step;
  ctx.fillStyle='#142d3a';ctx.fillRect(0,0,480,168);ctx.strokeStyle='#23424e';ctx.lineWidth=1;
  for(let x=0;x<480;x+=12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,168);ctx.stroke();}
  for(let y=0;y<168;y+=12){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(480,y);ctx.stroke();}
  ctx.strokeStyle='#ffbd74';ctx.lineWidth=2;
  for(const arm of p.links){const a=p.tiles[arm.from],b=p.tiles[arm.to];ctx.beginPath();ctx.moveTo(px(a.x),py(a.y));ctx.lineTo(px(b.x),py(b.y));ctx.stroke();}
  for(const t of p.tiles){const x=px(t.x),y=py(t.y),size=Math.max(1,step*(belts.includes(t.type)?.43:.72));
    ctx.save();ctx.translate(x,y);ctx.rotate(-t.dir*Math.PI/2);
    ctx.fillStyle=belts.includes(t.type)?'#84c1b9':'#8ad6f1';ctx.fillRect(-size/2,-size/2,size,size);
    if(step>9){ctx.fillStyle='#213e4c';ctx.fillRect(-size*.18,-size*.18,size*.36,size*.36);ctx.fillRect(size*.16,-1,size*.37,2);}
    ctx.restore();
  }
  const image=c.toDataURL();thumbnails.set(p,image);return image;
}
const press=(id,text,cls='')=>button('bp-'+id,'',text,cls);
const actions=(...nodes)=>'<div class="actions">'+nodes.join('')+'</div>';
function manifest(game,p){
  return section('建设清单','背包 / 需要')+'<div class="plan-materials">'+Object.entries(billOf(p)).map(([id,n])=>
    '<div>'+icon(id)+'<span>'+escapeText(name(id))+'</span><b class="'+((game.bag[id]||0)<n?'short':'')+'">'+(game.bag[id]||0)+' / '+n+'</b></div>').join('')+'</div>';
}
function constructionState(game){
  const c=game.planet.construction;if(!c)return '';
  const sites=Object.keys(c.sites).length,arms=Object.keys(c.arms).length;
  return section('地表施工',c.drones.length+' 架出动')+line('设施 / 分拣器',sites+' / '+arms)+actions(press('cancel-all','撤回未完工地'));
}
export function blueprintPanel(game,ui){
  const d=ui.bp,limit=capabilitiesOf(game).blueprintLimit,p=d.pattern;
  const nav='<div class="bp-tabs">'+press('library','图纸库',d.mode==='library'?'active':'')+press('copy','框选复制',d.mode==='select'?'active':'')+'</div>';
  let body='';
  if(d.mode==='library'){
    const list=blueprints();body+=section('本机图纸',list.length+' 份');
    for(const e of list)body+=button('bp-open',e.id,'<img src="'+thumb(e.pattern)+'" alt=""><span><b>'+escapeText(e.pattern.title)+'</b><small>'+e.pattern.width+' × '+e.pattern.height+' 格 · '+blueprintSize(e.pattern)+' 件</small></span>','bp-record');
    if(!list.length)body+=note('框选现有产线可制作第一份图纸，也可以导入网页版蓝图。');
    body+=actions(press('import','导入文件'),p?press('paste','粘贴当前图纸'):'' );
    if(!limit)body+=note('研究「批量建造 I」后可在地表复制和粘贴。');
  }else if(d.mode==='select'){
    body+=section('复制选区',limit===Infinity?'不限件数':limit+' 件上限');
    body+=note(d.first?'选择对角格，松开鼠标完成框选。':'在地表拖出选框，或依次点选两个角。');
    if(d.first)body+=line('首角格点',d.first.x+' , '+d.first.y);
  }else if(p){
    body+='<div class="bp-sheet"><img src="'+thumb(p)+'" alt="蓝图俯视布置"><small>'+p.width+' × '+p.height+' 格　'+blueprintSize(p)+' 件</small></div>';
    if(d.mode==='review'){
      body+='<label class="bp-field">蓝图名称<input data-plan-field="title" maxlength="80" value="'+escapeText(p.title)+'"></label>';
      body+='<label class="bp-field">说明<input data-plan-field="description" maxlength="600" value="'+escapeText(p.description)+'" placeholder="用途或接线说明"></label>';
      body+=actions(press('paste','放置蓝图','primary'),press('save','存入蓝图库'),press('export','导出文件'));
      if(d.id)body+=button('bp-drop',d.id,'从图纸库移除','pill');
      else if(d.first)body+=note('点击原选区内的设备可剔除或恢复。');
    }else{
      const result=previewAt(game,d),first=result?.errors.values().next().value;
      body+=section(escapeText(p.title),d.turn*90+'°'+(d.mirror?' · 镜像':''))+line('中心格点',d.anchor.x+' , '+d.anchor.y);
      body+=note(first||'点击地表下达施工指令，也可微调中心格点后放置。');
      body+='<div class="bp-nudge">'+[['-1,0','←'],['0,1','↑'],['0,-1','↓'],['1,0','→']].map(([id,label])=>button('bp-offset',id,label)).join('')+'</div>';
      body+=actions(press('turn','旋转 R'),press('mirror','镜像 F'),press('confirm','在此放置','primary'));
    }
    body+=manifest(game,p);
  }
  if(game.scenario==='blueprint'&&['select','library'].includes(d.mode))body+=press('example','框选示例熔炉与仓储','primary');
  return nav+body+constructionState(game);
}
