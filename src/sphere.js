import {stellarUp,sunCosine} from './ephemeris.js';
import {capabilitiesOf} from './upgrades.js';

// 恒星工程只保存设计与实物数量。相机、材质和鼠标状态不能进入存档或改变发电量。
const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const requireDesign = (condition, message) => { if (!condition) throw new Error(message); };
export const starRadiusRange = [4000, 32000];
export const starPower = { sail:36, structure:96, cell:15 };
export const newSphere = () => ({
  luminosity:1, orbits:[{id:1, radius:10000, tilt:0, longitude:0}], layers:[],
  cohorts:[], flights:[], serial:2, revision:0, launchedSails:0, launchedRockets:0,
  expired:0, absorbed:0, receivedKW:0
});
export const layerById = (sphere,id) => sphere.layers.find(layer => layer.id===id);
export const orbitById = (sphere,id) => sphere.orbits.find(orbit => orbit.id===id);
export const vectorAt = (lon,lat) => [Math.sin(lon*DEG)*Math.cos(lat*DEG),Math.sin(lat*DEG),Math.cos(lon*DEG)*Math.cos(lat*DEG)];
const dot = (a,b) => a.reduce((sum,value,i) => sum+value*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length = vector => Math.hypot(...vector);
const normalized = vector => { const magnitude=length(vector); return vector.map(n=>n/magnitude); };
const nodeVector = node => vectorAt(node.lon,node.lat);
const nodeById = (layer,id) => layer.nodes.find(node=>node.id===id);
const edgeKey = (a,b) => [a,b].sort((x,y)=>x-y).join('/');
const angle = (a,b) => Math.acos(clamp(dot(a,b),-1,1));

function validRadius(radius) {
  requireDesign(Number.isInteger(radius) && radius>=starRadiusRange[0] && radius<=starRadiusRange[1], '轨道半径范围为 4000 至 32000 米');
}
/** 新建太阳帆轨道。发射时复制轨道参数，修改轨道后已在轨的帆仍沿原轨道运动。 */
export function setOrbit(sphere,id,radius,tilt,longitude) {
  validRadius(radius);
  requireDesign(Number.isFinite(tilt)&&tilt>=0&&tilt<=180 && Number.isFinite(longitude)&&longitude>=0&&longitude<=360,'请检查轨道倾角和升交点经度');
  let orbit=orbitById(sphere,id);
  if (!orbit) {
    requireDesign(!id&&sphere.orbits.length<20,'最多可设计 20 条太阳帆轨道');
    orbit={id:sphere.serial++}; sphere.orbits.push(orbit);
  }
  Object.assign(orbit,{radius,tilt,longitude}); sphere.revision++; return orbit;
}
function checkOrientation(tilt,longitude) {
  requireDesign(Number.isFinite(tilt)&&tilt>=0&&tilt<=180 && Number.isFinite(longitude)&&longitude>=0&&longitude<=360,'倾角须在 0–180°、升交点经度须在 0–360°');
}
/** 壳层沿自身赤道旋转，角度和创建时刻独立于拓扑。修改朝向后，在途订单仍按原构件编号交付。 */
export function orientLayer(sphere,layer,tilt,longitude) {
  requireDesign(sphere.layers.includes(layer),'请先选定壳层');
  checkOrientation(tilt,longitude);
  Object.assign(layer,{tilt,longitude});
  sphere.revision++;
}
export function addLayer(sphere,radius,tilt=0,longitude=0,epoch=0) {
  validRadius(radius);checkOrientation(tilt,longitude);
  requireDesign(Number.isFinite(epoch)&&epoch>=0,'壳层建立时间无效');
  requireDesign(sphere.layers.length<10,'最多可建 10 层戴森壳');
  requireDesign(sphere.layers.every(layer=>Math.abs(radius-layer.radius)>=1000),'两层半径须相隔至少 1000 米');
  const layer={id:sphere.serial++,radius,tilt,longitude,epoch,nodes:[],edges:[],shells:[]};
  sphere.layers.push(layer); sphere.revision++; return layer;
}
export function latitudeLimit(game) {
  if (game.scenario==='sandbox') return 90;
  return capabilitiesOf(game).stressLatitude;
}
export function addNode(sphere,layer,lon,lat,limit) {
  requireDesign(layer&&Number.isFinite(lon)&&Number.isFinite(lat),'请先选定壳层与格点');
  requireDesign(Math.abs(lat)<=limit,'超出戴森球应力系统允许的纬度');
  lon=((Math.round(lon/3)*3+540)%360)-180; lat=clamp(Math.round(lat/3)*3,-90,90);
  if(Math.abs(lat)===90) lon=0;
  requireDesign(!layer.nodes.some(n=>angle(nodeVector(n),vectorAt(lon,lat))<2.7*DEG),'节点过近，请选择另一格');
  const node={id:sphere.serial++,lon,lat,built:0,required:30,ordered:0,absorbTime:0};
  layer.nodes.push(node); sphere.revision++; return node;
}
export function addEdge(sphere,layer,a,b) {
  const first=nodeById(layer,a),second=nodeById(layer,b);
  requireDesign(first&&second&&a!==b,'选择两个不同的节点');
  requireDesign(!layer.edges.some(edge=>edgeKey(edge.a,edge.b)===edgeKey(a,b)),'这两个节点已有框架');
  const radians=angle(nodeVector(first),nodeVector(second));
  requireDesign(radians<=Math.PI/2,'框架跨度过大，请添加中间节点');
  // 原版赤道 15° 框架在 10 km 需 80 枚火箭，在 5 km 需 40 枚；框架按每跨 20 结构点取整。
  const spanLength=10000*Math.PI/12/4;
  const spans=Math.max(1,Math.round(layer.radius*radians/spanLength));
  const edge={id:sphere.serial++,a,b,built:0,ordered:0,required:20*spans};
  layer.edges.push(edge); sphere.revision++; return edge;
}
function closedBoundary(layer,ids) {
  requireDesign(ids.length>=3 && new Set(ids).size===ids.length,'壳面须由至少三个不同节点围成');
  const vertices=ids.map(id=>nodeById(layer,id)); requireDesign(vertices.every(Boolean),'节点已被移除');
  const edges=ids.map((id,i)=>layer.edges.find(edge=>edgeKey(edge.a,edge.b)===edgeKey(id,ids[(i+1)%ids.length])));
  requireDesign(edges.every(Boolean),'请先用框架连接所有边并闭合');
  const points=vertices.map(nodeVector),center=normalized(points.reduce((sum,v)=>v.map((n,i)=>n+sum[i]),[0,0,0]));
  // 壳面须在同一半球。球面边投影到切平面仍为直线，用于排除交叉或退化轮廓。
  requireDesign(points.every(p=>dot(p,center)>.02),'请将跨半球的壳面拆分');
  const right=normalized(cross(center,Math.abs(center[1])>.95?[1,0,0]:[0,1,0])), up=cross(center,right);
  const flat=points.map(p=>[dot(p,right)/dot(p,center),dot(p,up)/dot(p,center)]);
  const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<flat.length;i++) for(let j=i+2;j<flat.length;j++) {
    if(i===0&&j===flat.length-1) continue;
    const a=flat[i], b=flat[(i+1)%flat.length], c=flat[j], d=flat[(j+1)%flat.length];
    requireDesign(!(turn(a,b,c)*turn(a,b,d)<=0 && turn(c,d,a)*turn(c,d,b)<=0),'壳面边界不能交叉');
  }
  let area=0;
  for(let i=1;i+1<points.length;i++) { const [a,b,c]=[points[0],points[i],points[i+1]];
    area+=2*Math.atan2(dot(a,cross(b,c)),1+dot(a,b)+dot(b,c)+dot(c,a)); }
  requireDesign(Math.abs(area)>.0001,'共线节点无法围成壳面');
  return {area:Math.abs(area),borders:edges.map(e=>e.id)};
}
export function addShell(sphere,layer,ids) {
  const {area,borders}=closedBoundary(layer,ids),signature=borders.slice().sort((a,b)=>a-b).join('/');
  requireDesign(!layer.shells.some(shell=>shell.borders.slice().sort((a,b)=>a-b).join('/')===signature),'此处已规划壳面');
  // 按实测壳面密度以球面面积估算帆数。旧图纸的 required 是已交接合同，读档保留原工程量。
  const shell={id:sphere.serial++,nodes:[...ids],borders,cells:0,required:Math.max(1,Math.round(area*(layer.radius*.0191)**2))};
  layer.shells.push(shell); sphere.revision++; return shell;
}
/** 示范图纸也走正常的规划和施工入口，只生成设计。预先验证空层，防止留下半张图纸。 */
export function trianglePlan(sphere,layer,limit) {
  requireDesign(layer&&!layer.nodes.length,'示范图纸需要一个空壳层');
  requireDesign(limit>=15,'三角单元需要应力系统开放赤道两侧的纬度');
  const ids=[[-18,-12],[18,-12],[0,15]].map(([lon,lat])=>addNode(sphere,layer,lon,lat,limit).id);
  ids.forEach((id,i)=>addEdge(sphere,layer,id,ids[(i+1)%ids.length])); return addShell(sphere,layer,ids);
}
function sailCohort(sphere,orbit,expires,amount) {
  if(amount<=0) return;
  // 同一秒同轨发射合批。帆按批保存实际轨道参数和失效时刻，长期运行不逐片建对象。
  expires=Math.ceil(expires);
  const last=sphere.cohorts.at(-1);
  if(last&&last.expires===expires&&last.orbit===orbit.id&&last.radius===orbit.radius&&last.tilt===orbit.tilt&&last.longitude===orbit.longitude) last.count+=amount;
  else sphere.cohorts.push({orbit:orbit.id,radius:orbit.radius,tilt:orbit.tilt,longitude:orbit.longitude,expires,count:amount});
  sphere.revision++;
}
export function releaseSails(game,orbit,count,sphere=game.dyson) {
  // 寿命在入轨时确定，后续研究只对新发射的帆生效。
  sailCohort(sphere,orbit,game.elapsed+capabilitiesOf(game).sailLife,count);
}
export function deleteNode(game,layer,id) {
  const node=nodeById(layer,id);requireDesign(node,'请选择要拆除的节点');
  const edges=layer.edges.filter(e=>e.a===id||e.b===id), shells=layer.shells.filter(p=>p.nodes.includes(id));
  const sails=node.built+edges.reduce((n,e)=>n+e.built,0)+shells.reduce((n,s)=>n+s.cells,0);
  layer.nodes=layer.nodes.filter(n=>n!==node);layer.edges=layer.edges.filter(e=>!edges.includes(e));layer.shells=layer.shells.filter(s=>!shells.includes(s));
  // 已建设部分解体为有寿命的帆。删除设计不会返还发射井中早已消耗的整枚火箭。
  releaseSails(game,game.dyson.orbits[0],sails);game.dyson.revision++;
}
const summaries=new WeakMap();
export function sphereTotals(sphere) {
  const old=summaries.get(sphere);if(old?.revision===sphere.revision) return old;
  let structure=0,structurePlan=0,cells=0,cellPlan=0;
  for(const layer of sphere.layers) {
    for(const p of [...layer.nodes,...layer.edges]) {structure+=p.built;structurePlan+=p.required;}
    for(const sh of layer.shells) {cells+=sh.cells;cellPlan+=sh.required;}
  }
  const sails=sphere.cohorts.reduce((sum,c)=>sum+c.count,0);
  const power=(sails*starPower.sail+structure*starPower.structure+cells*starPower.cell)*sphere.luminosity;
  const outerRadius=Math.max(sphere.layers.reduce((r,l)=>Math.max(r,l.radius),0),sphere.cohorts.reduce((r,c)=>Math.max(r,c.radius),0));
  const firstExpiry=sphere.cohorts.reduce((t,c)=>Math.min(t,c.expires),Infinity);
  const value={revision:sphere.revision,sails,structure,structurePlan,cells,cellPlan,power,outerRadius,firstExpiry};summaries.set(sphere,value);return value;
}
export function rocketTarget(sphere) {
  for(const layer of sphere.layers){
    const part=layer.nodes.find(p=>p.built+p.ordered<p.required) || layer.edges.find(p=>p.built+p.ordered<p.required);
    if(part) return {layer,part};
  }
  return null;
}
/** 发射前预占一个尚未施工的结构点，多座井同时发射也不会向最后一个点重复下单。 */
export function sendRocket(game,target,sphere=game.dyson) {
  target.part.ordered++;sphere.launchedRockets++;
  sphere.flights.push({layer:target.layer.id,part:target.part.id,arrival:game.elapsed+8});
}
function absorb(sphere,layer,dt) {
  const ready=layer.shells.filter(shell=>shell.cells<shell.required&&shell.borders.every(id=>{const e=layer.edges.find(edge=>edge.id===id);return e&&e.built>=e.required;}));
  if(!ready.length) return;
  for(const node of layer.nodes){
    if(!node.built) continue;
    const panel=ready.find(shell=>shell.cells<shell.required&&shell.nodes.includes(node.id));
    if(!panel) continue;
    node.absorbTime=Math.min(6,node.absorbTime+dt);
    if(node.absorbTime+1e-8<6||!sphere.cohorts.length) continue;
    const cohort=sphere.cohorts[0];cohort.count--;if(!cohort.count)sphere.cohorts.shift();
    node.absorbTime=0;panel.cells++;sphere.absorbed++;sphere.revision++;
  }
}
export function advanceSphere(game,dt,sphere=game.dyson) {
  // 不同轨道可共用首个过期秒，升级与拆除也可能改变入列顺序，因此在到期时检查各批次。
  if(sphere.cohorts.length&&sphereTotals(sphere).firstExpiry<=game.elapsed) {
    sphere.cohorts=sphere.cohorts.filter(c=>{if(c.expires>game.elapsed)return true;sphere.expired+=c.count;return false;});sphere.revision++;
  }
  if(sphere.flights.length&&sphere.flights[0].arrival<=game.elapsed) {
    sphere.flights=sphere.flights.filter(f=>{if(f.arrival>game.elapsed)return true;
      const layer=layerById(sphere,f.layer),part=layer&&[...layer.nodes,...layer.edges].find(p=>p.id===f.part);
      if(part){part.ordered--;part.built++;sphere.revision++;}return false;});
  }
  for(const layer of sphere.layers) if(layer.shells.length) absorb(sphere,layer,dt);
}

/** 以恒星为原点，轨道的两条正交基同时用于瞄准和显示，避免视觉倾角与发射窗口不一致。 */
export function orbitBasis(orbit) {
  const lon=orbit.longitude*DEG,tilt=orbit.tilt*DEG;
  return [[Math.cos(lon),0,Math.sin(lon)],[-Math.cos(tilt)*Math.sin(lon),Math.sin(tilt),Math.cos(tilt)*Math.cos(lon)]];
}
export function firingPitch(tile,sky,orbit) {
  const planet=sky.origin,up=stellarUp(tile,sky),[u,v]=orbitBasis(orbit);
  const pa=dot(planet,u),pb=dot(planet,v),span=Math.hypot(pa,pb);
  // 在轨道平面上取顺行切入点。投影落入轨道内时失去切线，发射器等待下一个窗口。
  if(span<=orbit.radius) return -90;
  const t=Math.atan2(pb,pa)+Math.acos(orbit.radius/span);
  const target=u.map((x,i)=>orbit.radius*(x*Math.cos(t)+v[i]*Math.sin(t)));
  const sight=normalized(target.map((x,i)=>x-planet[i]));return Math.asin(clamp(dot(sight,up),-1,1))/DEG;
}
export function receiverVisible(tile,sky,radius,lensed) {
  // 当壳层包住行星时各经度均可接收。壳在轨道以内时，只允许仍看得见外缘的站点取能。
  return radius>=sky.range||sunCosine(tile,sky)>-(lensed?.95:radius/sky.range);
}
