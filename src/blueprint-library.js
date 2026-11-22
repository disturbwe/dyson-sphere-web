import {readBlueprint} from './blueprint.js';

const prefix='dsp-web-blueprint/';
const shelves=new WeakMap();
/** 图纸库按本机浏览器独立于工厂存档保存。只在进库和玩家操作后读取，避免每帧扫描 localStorage。 */
export function blueprints(storage=localStorage){
  if(shelves.has(storage))return shelves.get(storage);
  const entries=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);if(!key?.startsWith(prefix))continue;
    try{entries.push({id:key.slice(prefix.length),pattern:readBlueprint(storage.getItem(key))});}
    catch{/* 单份图纸损坏时保留原始文件，其余图纸仍可使用。 */}
  }
  shelves.set(storage,entries);return entries;
}
export function savePattern(pattern,id,storage=localStorage){
  const safe=readBlueprint(JSON.stringify(pattern)),entries=blueprints(storage);
  const key=id||globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  storage.setItem(prefix+key,JSON.stringify(safe));
  const pos=entries.findIndex(e=>e.id===key),entry={id:key,pattern:safe};
  if(pos===-1)entries.unshift(entry);else entries[pos]=entry;
  return entry;
}
export function discardPattern(id,storage=localStorage){
  const entries=blueprints(storage),i=entries.findIndex(e=>e.id===id);
  if(i<0)throw new Error('没有找到这份图纸');
  storage.removeItem(prefix+id);entries.splice(i,1);
}
windowSafeListen();
// 多个标签页可以同时开着不同存档。另一页保存后丢弃旧目录，下次打开时读取最新蓝图。
function windowSafeListen(){if(typeof window!=='undefined')window.addEventListener('storage',e=>{if(!e.key||e.key.startsWith(prefix))shelves.delete(e.storageArea);});}
