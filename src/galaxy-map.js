import {scenarios} from './mission-record.js';
import {escapeText,powerText,timeText} from './ui-format.js';
import {research} from './catalog.js';
import {scienceIcon} from './tech-sigils.js';

import {sectorAddress} from './sector-rules.js';
const groupOf = scenario => scenario==='landing'?'landing':scenario==='sandbox'?'sandbox':'lesson';
const number = n => Math.round(n).toLocaleString('zh-CN');
const address = row => sectorAddress(row.seed,row.report.starCount,row.report.resource||'1');

/** 一颗可选星点对应本机同一种子、星数与资源设置的存档。装饰银河只提供背景，不编造玩家，也不向外部上传数据。 */
export function groupSlots(rows,filter) {
  const byAddress = new Map();
  for (const row of rows) {
    if (!row.report || !Number.isFinite(row.report.power) || (filter!=='all' && groupOf(row.scenario)!==filter)) continue;
    const id=address(row);
    if (!byAddress.has(id)) {
      // 同种子不同资源档位是两个可选星区，位置也须分开。标准倍率沿用旧坐标。
      const variant=row.report.resource&&row.report.resource!=='1'?Number(id.slice(-2))+1:0;
      const hash=(Math.imul(row.seed,2654435761)^Math.imul(row.report.starCount,3266489917)^Math.imul(variant,2246822519))>>>0;
      const radius=.15+.48*((hash & 65535)/65535), angle=((hash>>>16)/65535)*Math.PI*2;
      // 星区位置随地址稳定，选另一槽或调整排名不会让同一颗星在银河中跳动。
      const x=Math.cos(angle)*radius, y=Math.sin(angle)*radius*.46;
      byAddress.set(id,{id,x:.54+.963*x-.27*y,y:.48-.27*x-.963*y,slots:[]});
    }
    byAddress.get(id).slots.push(row);
  }
  for (const group of byAddress.values()) group.slots.sort((a,b)=>b.report.power-a.report.power || b.date-a.date || a.slot.localeCompare(b.slot));
  return [...byAddress.values()].sort((a,b)=>a.id.localeCompare(b.id));
}

/** 本地银河和主线交付共用一个平移缩放视图。背景为构建期生成的单张纹理，仅交互或视口变化时重绘。 */
export class GalaxyMap {
  constructor(root,close) {
    this.root=root;this.close=close;this.canvas=root.querySelector('canvas');this.brief=root.querySelector('.galaxy-brief');
    this.title=root.querySelector('h1');this.legend=root.querySelector('.galaxy-summary');
    this.image=new Image();this.image.onload=()=>this.paint();this.image.src=this.canvas.dataset.sky;
    this.resize=new ResizeObserver(()=>this.paint());this.resize.observe(this.canvas);
    this.canvas.addEventListener('pointerdown',e=>{this.pointer={x:e.clientX,y:e.clientY,ox:this.panX,oy:this.panY};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{
      if (!this.pointer) return;
      this.panX=this.pointer.ox+e.clientX-this.pointer.x;this.panY=this.pointer.oy+e.clientY-this.pointer.y;this.paint();
    });
    this.canvas.addEventListener('pointerup',e=>{
      if(this.pointer && Math.hypot(e.clientX-this.pointer.x,e.clientY-this.pointer.y)<7 && !this.record) {
        const rect=this.canvas.getBoundingClientRect();
        const near=this.points.find(p=>Math.hypot(p.x-e.clientX+rect.left,p.y-e.clientY+rect.top)<20);
        if(near)this.select(near.id);
      }
      this.pointer=null;
    });
    this.canvas.addEventListener('pointercancel',()=>this.pointer=null);
    this.canvas.addEventListener('wheel',e=>{
      e.preventDefault();const scale=this.zoom,rect=this.canvas.getBoundingClientRect();
      this.zoom=Math.min(5,Math.max(.66,this.zoom*Math.exp(-e.deltaY*.0012)));
      const ratio=this.zoom/scale,px=e.clientX-rect.left-rect.width/2,py=e.clientY-rect.top-rect.height/2;
      this.panX=px-(px-this.panX)*ratio;this.panY=py-(py-this.panY)*ratio;this.paint();
    },{passive:false});
    root.addEventListener('click',e=>{
      const action=e.target.closest('[data-galaxy]')?.dataset.galaxy;
      if(action==='close')this.close();
      if(action==='list'){this.record=null;this.refresh();}
      if(action==='center'){this.center();this.paint();}
    });
    root.addEventListener('change',e=>{
      if(e.target.id==='galaxy-filter'){this.filter=e.target.value;this.refresh();}
      if(e.target.id==='galaxy-address')this.select(e.target.value);
    });
  }
  show(rows,game,slot,record) {
    this.rows=rows;this.game=game;this.slot=slot;this.record=record;this.filter='all';this.panX=0;this.panY=0;this.zoom=1;this.pointer=null;
    const current=rows.find(row=>row.slot===slot&&row.report);
    this.selected=current?address(current):null;
    this.shownCompletion=!!record;this.root.hidden=false;if(!this.root.open)this.root.showModal();this.refresh();this.center();this.paint();this.root.querySelector('[data-galaxy="close"]').focus();
  }
  center(){
    const selected=this.groups.find(g=>g.id===this.selected);this.zoom=1;this.panX=0;this.panY=0;
    if(!selected)return;
    const {width,height}=this.canvas.getBoundingClientRect(),w=Math.max(width,height*12/7),h=w*7/12;
    this.panX=(.36*width-width/2)-(selected.x-.5)*w;this.panY=.09*height-(selected.y-.5)*h;
  }
  select(id){this.selected=id;this.refresh();}
  refresh() {
    this.groups=groupSlots(this.rows,this.filter);
    const group=this.groups.find(g=>g.id===this.selected)||this.groups[0];this.selected=group?.id;
    const best=this.groups.map(g=>g.slots[0].report);
    const sum=key=>best.reduce((n,row)=>n+row[key],0);
    this.title.textContent=this.record?'主线任务完成':'银河系';
    this.legend.innerHTML=this.record?'<span>宇宙矩阵交付记录</span>':'<span>本机星区 <b>'+number(best.length)+'</b></span><span>戴森球 <b>'+number(sum('spheres'))+'</b></span><span>星区最高功率合计 <b>'+powerText(sum('power'))+'</b></span>';
    if (this.record) {
      const r=this.record,spec=research['mission-completed'];
      this.brief.innerHTML='<div class="mission-emblem"><img alt="" src="'+scienceIcon('mission-completed')+'"></div><small>'+escapeText(scenarios[this.game.scenario])+' · '+escapeText(this.selected||'')+'</small><h2>宇宙矩阵已交付</h2><div class="galaxy-values"><span>宇宙矩阵<b>'+number(spec.cost['universe-matrix'])+'</b></span><span>上传哈希<b>'+number(spec.hashes)+'</b></span><span>完成时刻<b>'+timeText(r.elapsed)+'</b></span><span>完工时发电<b>'+powerText(r.power)+'</b></span></div><p>研究已完成，工厂继续生产。</p><button data-galaxy="close" class="primary">继续建设</button><button data-galaxy="list">查看本机星区</button>';
    } else {
      const options=[['all','全部存档'],['landing','标准着陆'],['lesson','教学工厂'],['sandbox','恒星工程沙盒']].map(([id,title])=>'<option value="'+id+'" '+(id===this.filter?'selected':'')+'>'+title+'</option>').join('');
      const addresses=this.groups.map(g=>'<option '+(g===group?'selected':'')+'>'+escapeText(g.id)+'</option>').join('');
      this.brief.innerHTML='<h2>星区功率记录</h2><label>范围<select id="galaxy-filter">'+options+'</select></label>'+(group?'<label>星区地址<select id="galaxy-address">'+addresses+'</select></label><ol>'+group.slots.map((row,i)=>'<li><span>'+String(i+1).padStart(2,'0')+'</span><div>'+escapeText(scenarios[row.scenario]||'着陆档')+'<small>'+timeText(row.report.elapsed)+(row.slot===this.slot?' · 本次着陆':'')+(row.report.finished?' · 主线完成':'')+'</small></div><b>'+powerText(row.report.power)+'</b></li>').join('')+'</ol><button data-galaxy="center">定位星区</button>':'<p>本机还没有这个范围内的存档。</p>');
    }
    this.paint();
  }
  paint() {
    if(this.root.hidden || !this.groups)return;
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
    const ratio=Math.min(devicePixelRatio||1,1.5,Math.sqrt(1800000/(w*h)));
    if(this.canvas.width!==Math.round(w*ratio)||this.canvas.height!==Math.round(h*ratio)){this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);}
    const c=this.canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle='#03060d';c.fillRect(0,0,w,h);
    const dw=Math.max(w,h*12/7)*this.zoom,dh=dw*7/12;
    this.panX=Math.max(-dw*.55,Math.min(dw*.55,this.panX));this.panY=Math.max(-dh*.55,Math.min(dh*.55,this.panY));
    const x=(w-dw)/2+this.panX,y=(h-dh)/2+this.panY;
    if(this.image.naturalWidth)c.drawImage(this.image,x,y,dw,dh);
    this.points=[];c.font='12px ui-monospace, monospace';
    for(const group of this.groups){
      const px=x+group.x*dw,py=y+group.y*dh,selected=group.id===this.selected;
      if(px<0||px>w||py<0||py>h)continue;
      this.points.push({id:group.id,x:px,y:py});c.strokeStyle=selected?'#eac18d':'#99c6d1';c.lineWidth=1;
      c.beginPath();c.arc(px,py,selected?9:5,0,Math.PI*2);c.stroke();c.fillStyle='#fff2ca';c.fillRect(px-1.5,py-1.5,3,3);
      if(selected){c.beginPath();c.moveTo(px+8,py-5);c.lineTo(px+24,py-17);c.lineTo(px+143,py-17);c.stroke();c.fillStyle='#e4e9e9';c.fillText(group.id,px+30,py-24);}
    }
  }
}
