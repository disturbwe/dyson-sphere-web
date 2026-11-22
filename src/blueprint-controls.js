import {cellKey} from './belt-level.js';
import {wrap,clamp,key} from './world.js';
import {capabilitiesOf} from './upgrades.js';
import {captureBlueprint,checkLimit,readBlueprint} from './blueprint.js';
import {scheduleBlueprint,surveyStamp} from './construction.js';
import {cancelWorks} from './construction-orders.js';
import {insist} from './blueprint-config.js';
import {blueprints,savePattern,discardPattern} from './blueprint-library.js';

export const newPlanDesk=()=>({mode:'library',pattern:null,id:null,first:null,last:null,turn:0,mirror:false,anchor:null,excluded:new Set(),preview:null});
const rounded=point=>({x:wrap(Math.round(point.x)),y:clamp(Math.round(point.y),-43,43)});
export function selectArea(game,desk,a,b){
  desk.pattern=captureBlueprint(game,a,b,desk.excluded);desk.mode='review';desk.first=a;desk.last=b;
  desk.id=null;desk.turn=0;desk.mirror=false;desk.preview=null;
}
function captureMode(game,desk){
  insist(capabilitiesOf(game).blueprintLimit,'需要研究批量建造 I');
  Object.assign(desk,{mode:'select',first:null,last:null,id:null,preview:null});desk.excluded.clear();
}
function pasteMode(game,desk){
  if(!desk.pattern){const first=blueprints()[0];insist(first,'请先复制一条产线，或导入蓝图文件');Object.assign(desk,first);}
  checkLimit(game,desk.pattern);desk.mode='paste';desk.anchor=rounded(game.mecha);desk.preview=null;
}
/** 小图只在锚点、布局或朝向变化时判定。大图移动时仅显示轮廓，确认前统一验完整格点，避免拖动时反复遍历整座工厂。 */
export function previewAt(game,desk){
  if(desk.mode!=='paste'||!desk.anchor||!desk.pattern)return null;
  const token=[desk.anchor.x,desk.anchor.y,desk.turn,desk.mirror,game.planet.revision,game.planet.construction?.revision,game.techs.length].join('/');
  if(desk.preview?.token===token&&desk.preview.pattern===desk.pattern)return desk.preview.result;
  const result=desk.pattern.tiles.length<=320?surveyStamp(game,desk.pattern,desk.anchor,desk.turn,desk.mirror):null;
  desk.preview={token,pattern:desk.pattern,result};return result;
}
export function handlePlanPoint(game,desk,point,notify){
  if(!point)return;
  const p=rounded(point);
  if(desk.mode==='select'){
    if(!desk.first){desk.first=p;desk.last=null;return;}
    selectArea(game,desk,desk.first,p);return;
  }
  if(desk.mode==='paste'){
    desk.anchor=p;const n=scheduleBlueprint(game,desk.pattern,p,desk.turn,desk.mirror);
    desk.preview=null;notify('已标记 '+n+' 个施工位置');return;
  }
  if(desk.mode==='review'&&desk.first&&desk.last){
    const k=cellKey(p);if(!game.planet.tiles[k]&&!game.planet.construction?.sites[k])return;
    const original=desk.pattern,off=desk.excluded.has(k);
    if(off)desk.excluded.delete(k);else desk.excluded.add(k);
    try{const next=captureBlueprint(game,desk.first,desk.last,desk.excluded);Object.assign(next,{title:original.title,description:original.description});desk.pattern=next;}
    catch(e){if(off)desk.excluded.add(k);else desk.excluded.delete(k);throw e;}
  }
}
export function planCommand(game,desk,action,id,notify){
  switch(action){
    case 'bp-copy':captureMode(game,desk);break;
    case 'bp-example':
      // 教学按钮使用场内已有熔炉和仓储，走同一取框与索引逻辑，保留玩家修改过的配置。
      insist(game.scenario==='blueprint','教学选区只在蓝图工厂内提供');desk.excluded.clear();
      selectArea(game,desk,{x:1,y:0},{x:3,y:0});break;
    case 'bp-library':desk.mode='library';break;
    case 'bp-open':{
      const entry=blueprints().find(record=>record.id===id);insist(entry,'图纸已移除');
      Object.assign(desk,entry,{mode:'review',first:null,last:null,turn:0,mirror:false,preview:null});break;
    }
    case 'bp-save':{
      insist(desk.pattern,'请先选择产线');const entry=savePattern(desk.pattern,desk.id);
      Object.assign(desk,entry);notify('蓝图已存入本机图纸库');break;
    }
    case 'bp-drop':discardPattern(id);if(desk.id===id){desk.pattern=null;desk.id=null;}desk.mode='library';break;
    case 'bp-paste':pasteMode(game,desk);break;
    case 'bp-turn':desk.turn=(desk.turn+1)%4;break;
    case 'bp-mirror':desk.mirror=!desk.mirror;break;
    case 'bp-offset':{
      const [dx,dy]=id.split(',').map(Number);desk.anchor=rounded({x:desk.anchor.x+dx,y:desk.anchor.y+dy});break;
    }
    case 'bp-confirm':handlePlanPoint(game,desk,desk.anchor,notify);break;
    case 'bp-cancel-all':notify('已撤回 '+cancelWorks(game)+' 个未完位置');break;
    case 'bp-import':document.getElementById('bp-file').click();break;
    case 'bp-export':{
      insist(desk.pattern,'请先选择图纸');const value=readBlueprint(JSON.stringify(desk.pattern));
      const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=value.title+'.dspweb.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);break;
    }
  }
}
export async function importPattern(file,desk){
  insist(file.size<=4000000,'蓝图文件超过 4 MB');const pattern=readBlueprint(await file.text());
  const entry=savePattern(pattern,null);Object.assign(desk,entry,{first:null,last:null,mode:'review',preview:null});
}
