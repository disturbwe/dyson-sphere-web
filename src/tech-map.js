import positions from '../data/tech-map.json' with { type: 'json' };
import {items,technologies} from './catalog.js';
import {baseTopic,studyName} from './research-levels.js';
import {prerequisites} from './research.js';

export const rootTech='dsp-program';
export const titleOf=id=>id===rootTech?'戴森球计划':studyName(id).replace(/\s*\(科技\)$/,'').replace(/\s*\(Lv(\d+)\)$/,' $1');
export const categoryOf=id=>items[baseTopic(id)]?.category==='upgrades'?'upgrades':'technologies';
export const nodeWidth=108, nodeHeight=52, column=198, row=94;
const techGraphs=new Map();
/** 科技页采用资料中的相对行列。升级页按同系列从低级排到高级，跨页前置通过详情跳转。 */
export function techGraph(category) {
  if (techGraphs.has(category)) return techGraphs.get(category);
  const nodes=[], byId=new Map(), occupied=new Set(), edges=[];
  function point(id,col,line,number=null) {
    while (occupied.has(col+','+line)) line++;
    occupied.add(col+','+line);
    const node={id,x:col*column,y:line*row,col,line,number};
    nodes.push(node); byId.set(id,node);
  }
  const pool=technologies.filter(t=>t.category===category);
  if (category==='technologies') {
    for (const [id,at] of Object.entries(positions)) point(id,...at);
    // 新版本添加而原图未包含的节点紧随其前置，沿空行排列，保留原有节点间距。
    for (const t of pool) if (!byId.has(t.id)) {
      const parents=prerequisites(t.id).map(id=>byId.get(id)).filter(Boolean);
      const pivot=parents.sort((a,b)=>b.col-a.col)[0];
      point(t.id,pivot?pivot.col+1:0,pivot?.line??0);
    }
  } else {
    const preferred=['universe-exploration','mecha-core','mechanical-frame','inventory-capacity','energy-circuit','drive-engine','communication-control','drone-engine','vertical-construction','veins-utilization','research-speed','logistics-carrier-engine','logistics-carrier-capacity','solar-sail-life'];
    const groups=new Map();
    for (const t of pool) {
      const match=/^(.*)-(\d+)$/.exec(t.id), family=match?.[1]||t.id;
      if (!groups.has(family)) groups.set(family,[]);
      groups.get(family).push([t.id,Number(match?.[2]||1)]);
    }
    const families=[...new Set([...preferred,...groups.keys()])].filter(f=>groups.has(f));
    families.forEach((family,line)=>{for(const [id,level] of groups.get(family))point(id,level-1,line);});
  }
  for (const node of nodes) {
    const parents=node.id==='electromagnetism'?[rootTech]:prerequisites(node.id);
    for (const parent of parents) { const from=byId.get(baseTopic(parent)); if(from) edges.push([from,node]); }
  }
  const graph={nodes,byId,edges,right:Math.max(...nodes.map(n=>n.x))+nodeWidth,bottom:Math.max(...nodes.map(n=>n.y))+nodeHeight};
  techGraphs.set(category,graph); return graph;
}
export function stateOf(id,known,active,queued) {
  if (id===rootTech||known.has(id)) return 'done';
  if (id===active) return 'running';
  if (queued.has(id)) return 'queued';
  return prerequisites(id).every(p=>known.has(p))?'ready':'locked';
}
