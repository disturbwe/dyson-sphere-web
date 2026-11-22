import {addNode,addEdge,addShell,starRadiusRange} from './sphere.js';

const format='DSP-WEB-LAYER/1';
export const designByteLimit=240000;
export const layerClipboardKey='dyson-layer-design-v1';
const requirePlan=(condition,message)=>{if(!condition)throw new Error(message);};

/** 保存局部经纬度与连接关系。订单、已建设数、恒星编号均属于原工地，跨星系使用时须重新结算。 */
export function copyLayerDesign(layer){
  requirePlan(layer?.nodes.length,'选中的壳层还没有节点');
  const indices=new Map(layer.nodes.map((node,index)=>[node.id,index]));
  return {format,radius:layer.radius,nodes:layer.nodes.map(n=>[n.lon,n.lat]),edges:layer.edges.map(e=>[indices.get(e.a),indices.get(e.b)]),shells:layer.shells.map(s=>s.nodes.map(id=>indices.get(id)))};
}

/** 解析外部文件或本机剪贴板。限制图元与边界总数以控制几何生成预算，应用时仍检查是否闭合、重叠和越过应力纬度。 */
export function readLayerDesign(text){
  requirePlan(typeof text==='string'&&text.length<=designByteLimit,'壳层图纸超过大小限制');
  let plan;
  try{plan=JSON.parse(text);}catch{throw new Error('壳层图纸的 JSON 格式无效');}
  requirePlan(plan?.format===format,'请选择网页版单层戴森壳图纸');
  requirePlan(Number.isInteger(plan.radius)&&plan.radius>=starRadiusRange[0]&&plan.radius<=starRadiusRange[1],'图纸半径无效');
  requirePlan(Array.isArray(plan.nodes)&&plan.nodes.length>0&&plan.nodes.length<=640 && Array.isArray(plan.edges)&&plan.edges.length<=1600 && Array.isArray(plan.shells)&&plan.shells.length<=640,'图纸超出单次规划预算或缺少图元');
  const validIndex=i=>Number.isInteger(i)&&i>=0&&i<plan.nodes.length;
  for(const point of plan.nodes){
    requirePlan(Array.isArray(point)&&point.length===2,'节点坐标无效');
    const [lon,lat]=point;
    requirePlan(Number.isInteger(lon)&&Number.isInteger(lat)&&lon%3===0&&lat%3===0&&Math.abs(lon)<=180&&Math.abs(lat)<=90,'节点须位于壳层经纬网格');
  }
  requirePlan(plan.edges.every(e=>Array.isArray(e)&&e.length===2&&e.every(validIndex)),'框架引用了不存在的节点');
  let cornerCount=0;
  for(const shell of plan.shells){
    requirePlan(Array.isArray(shell)&&shell.length>=3&&shell.length<=64&&shell.every(validIndex),'壳面边界无效');
    cornerCount+=shell.length;
  }
  requirePlan(cornerCount<=4800,'单次导入的壳面边界过多');
  return {format,radius:plan.radius,nodes:plan.nodes,edges:plan.edges,shells:plan.shells};
}

/** 将图纸放入选中的空层。所有拓扑验证先在临时账本完成，出错时不耗编号、不留节点，也不改变在途火箭。 */
export function pasteLayerDesign(sphere,layer,plan,limit){
  requirePlan(layer&&sphere.layers.includes(layer),'请先选择接收图纸的壳层');
  requirePlan(!(layer.nodes.length||layer.edges.length||layer.shells.length),'请新建或选择空壳层以粘贴图纸');
  const scratch={radius:layer.radius,nodes:[],edges:[],shells:[]};
  const ledger={serial:sphere.serial,revision:0};
  const ids=plan.nodes.map(([lon,lat])=>addNode(ledger,scratch,lon,lat,limit).id);
  for(const [a,b] of plan.edges)addEdge(ledger,scratch,ids[a],ids[b]);
  for(const corners of plan.shells)addShell(ledger,scratch,corners.map(i=>ids[i]));
  Object.assign(layer,scratch);
  sphere.serial=ledger.serial;
  sphere.revision++;
  return layer;
}

/** 新入编辑器时读取一次本机图纸。损坏的剪贴板仍留在磁盘，可直接复制新的设计覆盖。 */
export function recallLayerDesign(storage=localStorage){
  const text=storage.getItem(layerClipboardKey);
  if(!text)return null;
  try{return readLayerDesign(text);}catch{return null;}
}
export function storeLayerDesign(plan,storage=localStorage){
  const text=JSON.stringify(plan),checked=readLayerDesign(text);
  storage.setItem(layerClipboardKey,text);
  return checked;
}
