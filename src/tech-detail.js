import {items,name,recipeName} from './catalog.js';
import {baseTopic,studySpec,jobSpec,levelRanges,rankOf,keyAt,studyDone} from './research-levels.js';
import {count} from './stock.js';
import {capabilitiesOf} from './upgrades.js';
import {prerequisites,researchRoute,discoveryBits,isMatrix} from './research.js';
import {titleOf,rootTech,stateOf} from './tech-map.js';
import {escapeText as esc} from './ui-format.js';
import {scienceIcon} from './tech-sigils.js';
import {icon} from './icons.js';

export const labels={done:'已解锁',running:'研究中',queued:'已排队',ready:'可研究',locked:'需要前置科技'};
export const cmd=(action,id,html,cls='')=>'<button type="button" class="'+cls+'" data-science="'+action+'" data-key="'+esc(id)+'">'+html+'</button>';
const head=title=>'<h3>'+title+'</h3>';
const digits=n=>Math.floor(n).toLocaleString();
function requirements(game,id,spec,job) {
  const rows=Object.entries(spec.cost).map(([material,total])=>{
    const held=id===game.research?.id?count(game.science.reserve,material):0;
    const paid=count(job?.paid||{},material),have=count(game.bag,material)+held;
    return '<div class="science-material">'+icon(material)+'<div><b>'+esc(name(material))+'</b><small>可用 '+digits(have)+(held?' · 已预留 '+digits(held):'')+'</small></div><strong>'+digits(total-paid)+'</strong></div>';
  });
  return head('剩余研究材料')+rows.join('');
}
/** 详情与路线共用同一套前置与支付规则。资料缺项保持可浏览，点击依赖可跨科技和升级页定位。 */
export function techDetail(game,id,known,queued) {
  const status=stateOf(id,known,game.research?.id,queued);
  let html='<div class="science-crest '+status+'">'+scienceIcon(id)+'<span>'+labels[status]+'</span></div><h2>'+esc(titleOf(id))+'</h2>';
  if (id===rootTech) return html+head('后续科技')+cmd('focus','electromagnetism','电磁学　→','science-parent');
  const base=baseTopic(id), range=levelRanges[base], rank=rankOf(id);
  const job=game.research?.id===id?game.research:game.science.suspended[id];
  const spec=job?jobSpec(job):studySpec(id);
  if(range){
    const family=base.slice(0,base.lastIndexOf('-'));
    const count=capabilitiesOf(game).levels[family]||0;
    html+='<div class="science-level"><span>当前等级 <b>'+count+'</b></span><span>上限 <b>'+range.limit.toLocaleString()+'</b></span></div>';
  }
  if (base.startsWith('veins-utilization-')) {
    const target=rank||Number(base.slice(base.lastIndexOf('-')+1));
    html+=head('完成后的采矿效果')+'<div class="science-level"><span>速度 <b>'+Math.round(100+10*target)+'%</b></span><span>矿脉消耗 <b>'+(100*Math.pow(.94,target)).toFixed(2)+'%</b></span></div>';
  }
  if (spec) {
    html+='<div class="science-hashes"><b>'+digits(spec.hashes)+'</b><span> Hash</span></div>';
    if (job) html+='<div class="science-progress"><i style="width:'+100*job.hash/spec.hashes+'%"></i></div><small>'+digits(job.hash)+' Hash 已上传</small>';
    if (discoveryBits.has(id)) html+='<p>已识别黑雾样本。使用伊卡洛斯背包中的黑雾矩阵研究。</p>';
    if (status!=='done') html+=requirements(game,id,spec,job);
  } else html+='<p>本版本研究总消耗待核实。</p>';
  if(game.scenario==='landing'&&!game.meta.foreign&&spec&&['ready','running','queued'].includes(status)&&Object.keys(spec.cost).every(isMatrix)&&prerequisites(id).every(p=>studyDone(game,p)))
    html+=cmd('buyout',id,'元数据买断','science-parent');
  const parents=prerequisites(id);
  if (parents.length) html+=head('前置科技')+'<div class="science-parents">'+parents.map(p=>cmd('focus',p,(known.has(p)?'✓　':'◇　')+esc(titleOf(p)),known.has(p)?'science-parent done':'science-parent')).join('')+'</div>';
  const outputs=items[base]?.technology?.recipeUnlock||[];
  if (outputs.length) html+=head('解锁配方')+'<div class="science-recipes">'+outputs.map(p=>'<span>'+icon(p)+esc(recipeName(p))+'</span>').join('')+'</div>';
  if (status==='running'||status==='queued') html+=cmd('remove',id,status==='running'?'暂停此项研究':'移出研究序列','science-remove');
  else if (spec && status!=='done') {
    let route;
    try {route=researchRoute(game,id);} catch(e) {html+='<p>'+esc(e.message)+'</p>';}
    if (route?.length) {
      const count=route.length-1;
      html+=cmd('enqueue',id,count?'排入路线（含 '+count+' 项前置）':game.research?'加入研究序列':job?'继续研究':'开始研究','science-enqueue');
    }
  }
  // 从详情逐级查看价格，也可在当前级尚未交付时按实际前置顺序排入下一级。
  if(range&&rank<range.limit)html+=cmd('focus',keyAt(base,rank+1),'查看第 '+(rank+1)+' 级　→','science-parent');
  return html;
}
export function queueStrip(game) {
  const ids=game.science.queue;
  const tasks=game.research?[game.research.id,...ids]:[];
  return '<div class="sequence-title">研究序列 <b>'+tasks.length+'</b></div><div class="sequence-jobs">'+(tasks.length?tasks.slice(0,12).map((id,i)=>cmd('focus',id,'<i>'+String(i+1).padStart(2,'0')+'</i>'+esc(titleOf(id)),i?'':'active')).join('')+(tasks.length>12?'<span class="science-empty">后续 '+(tasks.length-12)+' 项</span>':''):'<span class="science-empty">尚未排入课题</span>')+'</div>';
}
