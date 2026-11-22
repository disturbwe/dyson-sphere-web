import {name} from './catalog.js';
import {icon} from './icons.js';
import {button,escapeText,line,note,section} from './ui-format.js';
import {homeAddress,matrices,metaNames} from './matrix-meter.js';
import {walletView,holdings,universeGifts} from './metadata.js';
import {resourceModes,sectorAddress,contributionPercent,resourceLabel} from './sector-rules.js';

const presets={spectrum:'五色矩阵各 1',fogMatrix:'黑雾矩阵 ×20',shard:'能量碎片 ×60',relics:'神经元、重组器、负熵奇点各 10',core:'核心素 ×10'};
/** 开档时预览唯一星区地址与选定难度的贡献倍率。种子变化只更新表单，不提前生成各颗行星。 */
export function setupSector(){
  const el=id=>document.getElementById(id);
  const resource=el('resource-mode');resource.innerHTML=resourceModes.map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('');resource.value='1';
  function sync(){
    const seed=Number(el('seed').value);
    el('sector-address').textContent=Number.isInteger(seed)&&seed>0&&seed<=99999999?sectorAddress(seed,el('star-count').value,resource.value):'—';
    el('sector-yield').textContent=contributionPercent(resource.value,el('fog-mode').value)+'%';
  }
  for(const id of ['seed','star-count','resource-mode','fog-mode'])el(id).addEventListener('input',sync);
  sync();return sync;
}
/** 统计面板同列展示来自本星区的产量峰值和可从其他星区领取的额度，读数沿用实际付款口径。 */
export function metadataPanel(game,ui){
  if(game.scenario!=='landing')return note('沙盒和教学工厂的元数据贡献为 0%。请从「开始着陆」建立标准档。');
  if(game.meta.foreign)return note('外部存档没有绑定本机的元数据账户。');
  let balance;
  try{balance=holdings(walletView(),homeAddress(game));}catch(error){return note(escapeText(error.message));}
  const percent=contributionPercent(game.resource,game.fogMode);
  let html=section(homeAddress(game),resourceLabel(game.resource)+' 资源')+line('元数据产出倍率',percent+'%');
  html+='<table class="meta-table"><thead><tr><th>矩阵</th><th>一小时均产<small>个 / min</small></th><th>本站峰值</th><th>外区可用</th></tr></thead><tbody>';
  for(const [i,item] of matrices.entries())html+='<tr><th>'+icon(item)+metaNames[i]+'</th><td>'+(game.meta.total[i]/60).toFixed(2)+'</td><td>'+Math.max(game.meta.peak[i],balance.local[i]).toLocaleString()+'</td><td>'+balance.available[i].toLocaleString()+'</td></tr>';
  html+='</tbody></table>'+section('提取为实物');
  const item=ui.metaItem||matrices[0];
  const opts=matrices.concat(Object.keys(universeGifts)).map(id=>'<option value="'+id+'" '+(item===id?'selected':'')+'>'+(presets[id]||escapeText(name(id)))+'</option>').join('');
  const source=Object.hasOwn(universeGifts,item)?5:matrices.indexOf(item);
  html+='<label class="meta-input">交付物<select id="meta-item" aria-label="元数据交付物">'+opts+'</select></label><label class="meta-input">份数<input id="meta-count" type="number" min="1" max="1000000" value="'+(ui.metaCount||1)+'"></label>';
  return html+line('扣除 '+metaNames[source],(ui.metaCount||1)+' / 可用 '+balance.available[source])+button('meta-claim','','提取至背包','primary')+note(game.meta.used?'本档已使用元数据。':'使用后，本档将记为已使用元数据。');
}
