import {technologies} from './catalog.js';
import {baseTopic,currentLevelKey,studyDone} from './research-levels.js';
import {enqueueResearch,cancelResearch,toggleInventoryResearch,discoverSamples,topicVisible} from './research.js';
import {techGraph,rootTech,titleOf,stateOf,categoryOf,nodeWidth,nodeHeight} from './tech-map.js';
import {techDetail,queueStrip,cmd,labels} from './tech-detail.js';
import {scienceIcon} from './tech-sigils.js';
import {updateMarkup} from './dom-update.js';
import {escapeText as esc} from './ui-format.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const layout='<header class="science-header"><div class="science-tabs">'+cmd('tab','technologies','科技')+cmd('tab','upgrades','升级')+'</div><div class="science-find"><input type="search" id="science-query" placeholder="查找科技或升级" aria-label="查找科技或升级"><div id="science-results" hidden></div></div>'+cmd('close','','关闭　×','science-close')+'</header><div class="science-body"><div id="science-board" tabindex="0" role="region" aria-label="可拖动和缩放的科技路线图"><canvas aria-hidden="true"></canvas><div id="science-nodes"></div></div><aside class="science-detail"></aside></div><footer class="science-footer"><div class="science-sequence"></div><div class="science-options">'+cmd('manual','','','science-manual')+'<div class="science-zoom">'+cmd('out','','−')+'<output>100%</output>'+cmd('in','','+')+cmd('locate','','定位')+'</div></div></footer>';

/** 管理全屏科技图谱。Canvas 只绘制当前视口的导线，按钮只保留附近节点，科研读数刷新不会重建图谱。 */
export class TechDesk {
  constructor(root,close,report,buyout){
    this.root=root;root.innerHTML=layout;
    this.close=close;this.report=report;this.buyout=buyout;
    this.board=root.querySelector('#science-board');this.canvas=this.board.querySelector('canvas');
    this.nodes=this.board.querySelector('#science-nodes');this.details=root.querySelector('.science-detail');
    this.query=root.querySelector('#science-query');this.results=root.querySelector('#science-results');
    this.zoom=1;this.x=0;this.y=0;this.raf=0;
    root.addEventListener('click',e=>this.clicked(e));
    this.query.addEventListener('input',()=>this.search());
    this.bindNavigation();
    this.resize=new ResizeObserver(()=>{if(!this.root.hidden)this.schedule();});this.resize.observe(this.board);
  }
  hide(){this.root.hidden=true;cancelAnimationFrame(this.raf);this.raf=0;this.drag=null;}
  sync(game){
    const fresh=game!==this.game;
    this.game=game;this.root.hidden=false;
    if(fresh){this.zoom=1;this.focus(game.research?.id||'electromagnetism');this.query.value='';this.search();}
    discoverSamples(game);
    const mode=game.research?.id,signature=[game.techs.length,game.science.samples||0,mode,game.science.queue.join(',')].join('/');
    if(signature!==this.signature||this.ranks!==game.science.ranks||fresh){
      this.ranks=game.science.ranks;this.signature=signature;
      const completed=new Set(game.techs);
      this.known={has:id=>studyDone(game,id,completed)};this.queued=new Set(game.science.queue);
      updateMarkup(this.root.querySelector('.science-sequence'),queueStrip(game));this.search();this.schedule();
    }
    const toggle=this.root.querySelector('.science-manual'),on=game.science.manual;
    toggle.textContent=(on?'☑':'☐')+' 使用背包物品';toggle.setAttribute('aria-pressed',String(on));
    updateMarkup(this.details,techDetail(game,this.id,this.known,this.queued));
  }
  focus(id){
    if(!topicVisible(this.game,id))return;
    this.id=id;this.tab=categoryOf(id);this.graph=techGraph(this.tab);
    const spot=this.graph.byId.get(baseTopic(id));if(!spot)return;
    const width=this.board.clientWidth,height=this.board.clientHeight;
    this.x=Math.min(width*.45,width*.24+spot.col*12)-(spot.x+nodeWidth/2)*this.zoom;
    this.y=height*.48-(spot.y+nodeHeight/2)*this.zoom;
    this.root.querySelectorAll('[data-science="tab"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.key===this.tab)));
    this.schedule();
  }
  search(){
    const value=this.query.value.trim().toLowerCase();
    this.results.hidden=!value;
    if(value){const found=technologies.filter(t=>topicVisible(this.game,t.id)).map(t=>currentLevelKey(this.game,t.id)).filter(id=>titleOf(id).toLowerCase().includes(value)||id.includes(value)).slice(0,10);
      updateMarkup(this.results,found.map(id=>cmd('focus',id,esc(titleOf(id))+'<small>'+(categoryOf(id)==='upgrades'?'升级':'科技')+'</small>')).join('')||'<p>没有匹配项</p>');}
  }
  clicked(e){
    const button=e.target.closest('[data-science]');if(!button)return;
    const {science:action,key}=button.dataset;
    if(action==='select'&&this.skipClick){this.skipClick=false;return;}
    try{
      if(action==='close'){this.close();return;}
      if(action==='focus'||action==='tab'||action==='locate'){
        const next=action==='tab'?(key==='upgrades'?'universe-exploration-1':'electromagnetism'):action==='locate'?(this.game.research?.id||this.id):key;
        this.focus(next);this.query.value='';this.search();
      }else if(action==='select'){this.id=key;this.schedule();}
      else if(action==='in'||action==='out')this.setZoom(this.zoom*(action==='in'?1.22:1/1.22),this.board.clientWidth/2,this.board.clientHeight/2);
      else if(action==='enqueue'){const n=enqueueResearch(this.game,key);this.report(n===1?'已加入研究序列':'已加入 '+n+' 项研究');}
      else if(action==='buyout')this.buyout(key);
      else if(action==='remove')cancelResearch(this.game,key);
      else if(action==='manual')toggleInventoryResearch(this.game);
      this.sync(this.game);
    }catch(error){this.report(error.message,true);}
  }
  setZoom(scale,cx,cy){
    const next=clamp(scale,.46,1.8),ratio=next/this.zoom;
    this.x=cx+(this.x-cx)*ratio;this.y=cy+(this.y-cy)*ratio;this.zoom=next;this.schedule();
  }
  bindNavigation(){
    const board=this.board;
    board.addEventListener('wheel',e=>{e.preventDefault();const rect=board.getBoundingClientRect();this.setZoom(this.zoom*Math.exp(-e.deltaY*.0014),e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
    board.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;this.skipClick=false;this.drag={id:e.pointerId,px:e.clientX,py:e.clientY,x:this.x,y:this.y,moved:false};});
    board.addEventListener('pointermove',e=>{
      const drag=this.drag;if(!drag||drag.id!==e.pointerId)return;
      const dx=e.clientX-drag.px,dy=e.clientY-drag.py;
      if(!drag.moved&&Math.hypot(dx,dy)<4)return;
      // 超过拖动阈值以后再捕获指针，单击按钮时保留浏览器的正常点击和键盘焦点。
      if(!drag.moved){drag.moved=true;board.setPointerCapture(e.pointerId);}
      this.x=drag.x+dx;this.y=drag.y+dy;this.schedule();
    });
    const end=()=>{this.skipClick=!!this.drag?.moved;this.drag=null;};
    board.addEventListener('pointerup',end);board.addEventListener('pointercancel',end);
    board.addEventListener('pointerleave',()=>{if(!this.drag?.moved)end();});board.addEventListener('contextmenu',e=>e.preventDefault());
    board.addEventListener('keydown',e=>{const d={ArrowLeft:[100,0],ArrowRight:[-100,0],ArrowUp:[0,80],ArrowDown:[0,-80]}[e.key];if(d){e.preventDefault();this.x+=d[0];this.y+=d[1];this.schedule();}});
    this.query.addEventListener('keydown',e=>{if(e.key==='Enter')this.results.querySelector('button')?.click();if(e.key==='Escape'){this.query.value='';this.search();this.board.focus();}});
  }
  schedule(){if(!this.raf)this.raf=requestAnimationFrame(()=>{this.raf=0;if(!this.root.hidden&&this.known)this.paint();});}
  paint(){
    const width=this.board.clientWidth,height=this.board.clientHeight,z=this.zoom;
    if(!width||!height)return;
    // 限制平移边缘，保证总有一列和一行能被拖回。每个像素最多 1.5 倍采样以兼顾高分屏与低功耗。
    this.x=clamp(this.x,width*.2-this.graph.right*z,width*.72);
    this.y=clamp(this.y,height*.2-this.graph.bottom*z,height*.77);
    const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const ctx=this.canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.translate(this.x,this.y);ctx.scale(z,z);
    const left=-this.x/z,right=(width-this.x)/z,top=-this.y/z,bottom=(height-this.y)/z;
    const current=this.game.research?.id;
    for(const [from,to] of this.graph.edges){
      if(!topicVisible(this.game,from.id)||!topicVisible(this.game,to.id))continue;
      const x1=from.x+nodeWidth,x2=to.x,y1=from.y+nodeHeight/2,y2=to.y+nodeHeight/2;
      if(Math.max(x1,x2)<left||Math.min(x1,x2)>right||Math.max(y1,y2)<top||Math.min(y1,y2)>bottom)continue;
      const selected=from.id===baseTopic(this.id)||to.id===baseTopic(this.id);
      const complete=from.id===rootTech||this.known.has(from.id);
      ctx.strokeStyle=selected?'#eab077':complete?'#b67e58':'#45525f';ctx.fillStyle=ctx.strokeStyle;
      ctx.lineWidth=selected?2/z:1/z;
      const trunk=x2-22-(to.line%4)*3;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(trunk,y1);ctx.lineTo(trunk,y2);ctx.lineTo(x2-3,y2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x2-6,y2-3);ctx.lineTo(x2,y2);ctx.lineTo(x2-6,y2+3);ctx.fill();
    }
    let html='';
    for(const node of this.graph.nodes){
      if(node.x+nodeWidth+50<left||node.x-20>right||node.y+nodeHeight<top||node.y-24>bottom)continue;
      if(!topicVisible(this.game,node.id))continue;
      const id=currentLevelKey(this.game,node.id);
      const status=stateOf(id,this.known,current,this.queued),selected=baseTopic(this.id)===node.id;
      html+='<button type="button" class="science-node '+status+(selected?' selected':'')+'" style="left:'+node.x+'px;top:'+node.y+'px" data-science="select" data-key="'+id+'" aria-label="'+esc(titleOf(id))+'，'+labels[status]+'" aria-pressed="'+selected+'"><span class="node-title">'+esc(titleOf(id))+'</span><span class="node-face">'+scienceIcon(node.id)+'</span></button>';
    }
    this.nodes.style.transform='translate('+this.x+'px,'+this.y+'px) scale('+z+')';
    updateMarkup(this.nodes,html);
    this.root.querySelector('output').textContent=Math.round(z*100)+'%';
  }
}
