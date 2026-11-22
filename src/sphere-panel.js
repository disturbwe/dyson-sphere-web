import {button,line,section,note,powerText} from './ui-format.js';
import {layerPeriod} from './layer-orbit.js';
import {starSystem} from './cluster.js';
import {layerById,orbitById,sphereTotals,latitudeLimit,starPower} from './sphere.js';

const geometryTools=[['inspect','查看'],['node','节点'],['edge','框架'],['shell','壳面'],['remove','拆节点']];
const field=(key,label,value,min,max)=>'<label class="orbital-field"><span>'+label+'</span><input type="number" aria-label="'+label+'" data-orbital="'+key+'" value="'+Number(value)+'" min="'+min+'" max="'+max+'"></label>';
export function designHint(ui) {
  if(ui.sTool==='node') return '单击壳层格点规划节点';
  if(ui.sTool==='edge') return ui.chain.length?'选择第二个节点连接框架':'选择框架的第一个节点';
  if(ui.sTool==='shell') return '依次选择边界节点，再点第一个节点闭合壳面';
  if(ui.sTool==='remove') return '点击节点拆除，已建材料将解体为太阳帆';
  return '点击查看节点 · 拖动旋转 · 滚轮缩放';
}
function orbitControls(s,ui) {
  const sphere=s.dyson,orbit=orbitById(sphere,ui.orbit)||sphere.orbits[0];
  let h=section('太阳帆轨道',sphere.orbits.length+' / 20')+'<div class="pills">'+sphere.orbits.map((o,i)=>button('pick-orbit',o.id,'轨道 '+(i+1),'pill '+(o===orbit?'active':''))).join('')+'</div>';
  h+=line('当前在轨帆',sphere.cohorts.reduce((n,c)=>n+(c.orbit===orbit.id?c.count:0),0));
  if(!s.techs.includes('solar-sail-orbit-system')) return h+note('研究太阳帆轨道系统后可调整轨道。');
  h+=field('radius','轨道半径（米）',ui.draft.radius??orbit.radius,4000,32000)+field('tilt','倾角（度）',ui.draft.tilt??orbit.tilt,0,180)+field('longitude','升交点经度（度）',ui.draft.longitude??orbit.longitude,0,360);
  return h+'<div class="actions">'+button('write-orbit','edit','应用到当前轨道','primary')+button('write-orbit','new','新建轨道')+'</div>'+note('地表弹射器可以选择目标轨道。已发射的帆保留原轨道和剩余寿命。');
}
function layerControls(s,ui) {
  const sphere=s.dyson,layer=layerById(sphere,ui.layer),draft=ui.draft;
  let h=section('戴森壳层',sphere.layers.length+' / 10');
  if(sphere.layers.length) h+='<div class="pills">'+sphere.layers.map((l,i)=>button('pick-layer',l.id,'层 '+(i+1)+' · '+(l.radius/1000)+' km','pill '+(l===layer?'active':''))).join('')+'</div>';
  if(!s.techs.includes('vertical-launching-silo-technology')) return h+note('研究垂直发射井后可规划壳层。');
  const creation=field('newRadius','新壳层半径（米）',draft.newRadius??Math.min(32000,(sphere.layers.at(-1)?.radius||7000)+1000),4000,32000)
    +field('newTilt','新层倾角（度）',draft.newTilt??0,0,180)+field('newLongitude','新层升交点经度（度）',draft.newLongitude??0,0,360)+button('add-layer','','新建壳层','primary');
  if(!layer)return h+creation;
  h+='<details class="launch-ledger"><summary>新建壳层轨道</summary>'+creation+'</details>';
  h+=section('轨道参数','本地纬度 ±'+latitudeLimit(s)+'°');
  h+=line('倾角 / 升交点',(layer.tilt??0)+'° / '+(layer.longitude??0)+'°')+line('旋转周期',Math.round(layerPeriod(layer,starSystem(s)[0]))+' s');
  h+=button('follow-layer','',ui.followLayer?'返回恒星参考系':'镜头跟随本层');
  h+='<details class="launch-ledger"><summary>调整轨道方向</summary>'+field('layerTilt','壳层倾角（度）',draft.layerTilt??layer.tilt??0,0,180)+field('layerLongitude','壳层升交点经度（度）',draft.layerLongitude??layer.longitude??0,0,360)+button('orient-layer','','应用轨道方向')+'</details>';
  if(ui.chain.length) h+=line('已选节点',ui.chain.join(' → '))+button('clear-chain','','清除选择');
  const node=layer.nodes.find(n=>n.id===ui.chain.at(-1));
  if(node)h+=line('节点坐标',node.lon+'° / '+node.lat+'°')+line('节点结构点',node.built+' / '+node.required)+line('在途订单',node.ordered);
  h+=section('本层施工')+line('节点 / 框架 / 壳面',[layer.nodes.length,layer.edges.length,layer.shells.length].join(' / '));
  const structure=[...layer.nodes,...layer.edges];
  const sum=(parts,key)=>parts.reduce((n,p)=>n+p[key],0);
  h+=progressRow('结构点',sum(structure,'built'),sum(structure,'required'))+progressRow('细胞点',sum(layer.shells,'cells'),sum(layer.shells,'required'));
  h+=section('单层蓝图','本机剪贴板');
  const commands=[];
  if(layer.nodes.length)commands.push(button('copy-layer','','复制本层'),button('export-layer','','导出图纸'));
  if(ui.layerPrint){h+=line('剪贴板',(ui.layerPrint.radius/1000)+' km · '+ui.layerPrint.nodes.length+' 节点');if(!layer.nodes.length)commands.push(button('paste-layer','','粘贴到本层','primary'));}
  commands.push(button('import-layer','','导入图纸'));
  h+='<div class="actions">'+commands.join('')+'</div>';
  if(!layer.nodes.length && latitudeLimit(s)>=15) h+=button('triangle-plan','','规划三角单元');
  if(layer.shells.length)h+='<details class="launch-ledger"><summary>各壳面细胞点</summary>'+layer.shells.map(sh=>line('壳面 '+sh.id,sh.cells+' / '+sh.required)).join('')+'</details>';
  return h;
}
const pages=[['status','工程概况'],['orbits','帆轨道'],['layers','壳层设计']];
const number=value=>value.toLocaleString('zh-CN');

/** 在主画面切换读数、轨道和设计工具。全景只改变相机布局，退出后保留未提交的表单。 */
export function stellarDock(game,ui) {
  if(ui.panorama)return button('panorama','','返回编辑器 <kbd>H</kbd>','dock-btn');
  const tabs=pages.map(([id,label])=>button('sphere-tab',id,label,'dock-btn '+(ui.sTab===id?'chosen':'')));
  tabs.push(button('panorama','','全景 <kbd>H</kbd>','dock-btn panorama-btn'));
  let tools='';
  if(ui.sTab==='layers' && ui.layer && game.techs.includes('vertical-launching-silo-technology')) {
    const buttons=geometryTools.map(([id,label])=>button('sphere-tool',id,label,'drawing-tool '+(ui.sTool===id?'chosen':'')));
    tools='<div class="drawing-row">'+buttons.join('')+'</div>';
  }
  return tools+'<div class="dock-row">'+tabs.join('')+'</div>';
}

function progressRow(label,done,planned) {
  const percent=planned?100*done/planned:0;
  return '<div class="build-progress"><div><span>'+label+'</span><b>'+number(done)+' <small>/ '+number(planned)+'</small></b></div><i><em style="width:'+percent+'%"></em></i></div>';
}

/** 概况使用与接收站一致的 kW 基准。三种工程量在换算光度后才可作为同一功率条的份额。 */
export function spherePanel(s,ui) {
  const sphere=s.dyson,totals=sphereTotals(sphere);
  if(ui.sTab==='orbits')return orbitControls(s,ui);
  if(ui.sTab==='layers')return layerControls(s,ui);
  const [value,unit]=powerText(totals.power).split(' ');
  const parts=[['壳面',totals.cells*starPower.cell],['框架与节点',totals.structure*starPower.structure],['在轨帆',totals.sails*starPower.sail]];
  const fraction=kw=>totals.power?100*kw*sphere.luminosity/totals.power:0;
  let h='<div class="power-dial"><small>戴森球发电</small><div><strong>'+value+'</strong> <em>'+unit+'</em></div></div>';
  h+='<div class="power-composition" aria-hidden="true">'+parts.map(([,kw],i)=>'<i class="source-'+i+'" style="width:'+fraction(kw)+'%"></i>').join('')+'</div>';
  h+=parts.map(([label,kw],i)=>'<div class="source-line"><span><i class="source-'+i+'"></i>'+label+'</span><b>'+powerText(kw*sphere.luminosity)+'</b></div>').join('');
  h+=section('施工进度')+progressRow('结构点',totals.structure,totals.structurePlan)+progressRow('细胞点',totals.cells,totals.cellPlan);
  h+=line('在轨太阳帆',number(totals.sails))+line('在途火箭',number(sphere.flights.length));
  h+=section('恒星与接收站')+line('恒星光度',sphere.luminosity.toFixed(2)+' L☉')+line('接收端取能',powerText(sphere.receivedKW));
  h+='<details class="launch-ledger"><summary>累计发射与回收</summary>'+line('发射太阳帆',number(sphere.launchedSails))+line('发射运载火箭',number(sphere.launchedRockets))+line('融入壳面的帆',number(sphere.absorbed))+line('到期离轨',number(sphere.expired))+'</details>';
  return h;
}
