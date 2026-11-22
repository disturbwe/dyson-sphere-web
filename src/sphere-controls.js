import {setOrbit,orbitById,layerById,addLayer,addNode,addEdge,addShell,deleteNode,trianglePlan,latitudeLimit} from './sphere.js';
import {requireRule} from './actions.js';
import {orientLayer} from './sphere.js';
import {copyLayerDesign,pasteLayerDesign,recallLayerDesign,storeLayerDesign} from './layer-design.js';

export function enterEditor(s,ui) {
  Object.assign(ui,{view:'sphere',panorama:false,panel:'sphere',tool:null,start:null,hover:null,sTool:'inspect',sTab:'status',chain:[],draft:{},followLayer:false,layerPrint:recallLayerDesign(),layer:s.dyson.layers[0]?.id??null,orbit:s.dyson.orbits[0].id});
}
export function exitEditor(ui) {Object.assign(ui,{view:'surface',panel:null,chain:[],hover:null});}
function canConstruct(game) {requireRule(game.techs.includes('vertical-launching-silo-technology'),'需要研究垂直发射井');}
/** 处理编辑器内的面板命令，未识别命令返回 false。表单只改草稿，按应用时再整笔写入轨道。 */
export function editorCommand(s,ui,action,id) {
  const sphere=s.dyson;
  switch(action) {
    case 'panorama': ui.panorama=!ui.panorama;break;
    case 'sphere-tab': ui.sTab=id;ui.panorama=false;ui.chain=[];ui.sTool='inspect';break;
    case 'pick-orbit': ui.orbit=Number(id);ui.draft={};break;
    case 'pick-layer': ui.layer=Number(id);ui.chain=[];ui.draft={};break;
    case 'sphere-tool': ui.sTool=id;ui.chain=[];break;
    case 'clear-chain': ui.chain=[];break;
    case 'write-orbit': {
      requireRule(s.techs.includes('solar-sail-orbit-system'),'需要研究太阳帆轨道系统');
      const old=orbitById(sphere,ui.orbit),values=['radius','tilt','longitude'].map(k=>Number(ui.draft[k]??old[k]));
      ui.orbit=setOrbit(sphere,id==='new'?null:old.id,...values).id;ui.draft={};break;
    }
    case 'add-layer': {
      canConstruct(s);const radius=Number(ui.draft.newRadius??Math.min(32000,(sphere.layers.at(-1)?.radius||7000)+1000));
      const tilt=Number(ui.draft.newTilt??0),longitude=Number(ui.draft.newLongitude??0);
      ui.layer=addLayer(sphere,radius,tilt,longitude,s.elapsed).id;ui.chain=[];ui.draft={};ui.sTool='node';break;
    }
    case 'orient-layer': {
      canConstruct(s);
      const layer=layerById(sphere,ui.layer);
      orientLayer(sphere,layer,Number(ui.draft.layerTilt??layer.tilt??0),Number(ui.draft.layerLongitude??layer.longitude??0));
      ui.draft={};break;
    }
    case 'follow-layer': ui.followLayer=!ui.followLayer;break;
    case 'copy-layer': ui.layerPrint=storeLayerDesign(copyLayerDesign(layerById(sphere,ui.layer)));break;
    case 'paste-layer': {
      canConstruct(s);requireRule(ui.layerPrint,'请先复制或导入单层图纸');
      pasteLayerDesign(sphere,layerById(sphere,ui.layer),ui.layerPrint,latitudeLimit(s));
      ui.chain=[];ui.sTool='inspect';break;
    }
    case 'export-layer': {
      const plan=copyLayerDesign(layerById(sphere,ui.layer));
      const url=URL.createObjectURL(new Blob([JSON.stringify(plan)],{type:'application/json'}));
      const link=document.createElement('a');link.download='戴森壳-'+plan.radius+'m.json';link.href=url;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),5000);break;
    }
    case 'import-layer': document.getElementById('layer-file').click();break;
    case 'triangle-plan': canConstruct(s);trianglePlan(sphere,layerById(sphere,ui.layer),latitudeLimit(s));break;
    default:return false;
  }
  return true;
}
export function editGlobe(s,ui,hit) {
  if(!hit)return;
  const sphere=s.dyson,layer=layerById(sphere,ui.layer);
  if(ui.sTool==='inspect') {ui.chain=hit.id?[hit.id]:[];ui.sTab='layers';return;}
  canConstruct(s);
  if(ui.sTool==='node') {const node=addNode(sphere,layer,hit.lon,hit.lat,latitudeLimit(s));ui.chain=[node.id];return;}
  requireRule(hit.id,'请点选壳层上已有的节点');
  if(ui.sTool==='remove'){deleteNode(s,layer,hit.id);ui.chain=[];return;}
  if(ui.sTool==='edge') {if(!ui.chain.length)ui.chain=[hit.id];else{addEdge(sphere,layer,ui.chain[0],hit.id);ui.chain=[];}return;}
  if(ui.sTool==='shell') {
    if(ui.chain[0]===hit.id){addShell(sphere,layer,ui.chain);ui.chain=[];}else{requireRule(!ui.chain.includes(hit.id),'边界节点不能重复');ui.chain.push(hit.id);}
  }
}
