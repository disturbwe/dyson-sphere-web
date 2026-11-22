import {physical} from './catalog.js';
import {bodyOf,homeSystemOf} from './cluster.js';
import {key} from './world.js';

export const beaconType='holo-beacon';
export const scopes={off:'离线',sight:'视野范围内',planet:'本地星球',system:'本地星系',cluster:'全星区'};
export const captions={none:'不显示',icon:'常显图标',title:'常显标题',tasks:'常显待办事项'};
const physicalIds=new Set(physical.map(item=>item.id));
const indexes=new WeakMap();
const stateColors={fail:'#ff796a',pass:'#80ead0',waiting:'#b4bcc5',offline:'#758897'};
const smallText=(value,max)=>typeof value==='string'&&value.length<=max;
const size=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi&&Number.isInteger(v*2);

/** 标记和监测器按建拆版本索引。编辑文字、改变色彩或更新流速只改变原对象，不需重扫所有传送带。 */
export function signalIndex(planet){
  let cached=indexes.get(planet);
  if(cached?.revision===planet.revision)return cached;
  const beacons=[],meters=[];
  for(const tile of Object.values(planet.tiles)){
    if(tile.hull===0)continue;
    if(tile.type===beaconType)beacons.push(tile);
    if(tile.monitor)meters.push(tile);
  }
  cached={revision:planet.revision,beacons,meters};indexes.set(planet,cached);return cached;
}
/** 每颗行星独立编号。重载保留当前序号，拆掉旧信标不改变后续信标的标题。 */
export function installBeacon(planet){
  planet.beaconSerial=(planet.beaconSerial||0)+1;
  return {title:'全息信标 #'+planet.beaconSerial,body:'',tag:'',icon:null,color:'#d0f67d',scope:'planet',caption:'title',height:17.5,radius:3,meter:null};
}
/** 蓝图、存档及远程编辑共用配置边界。监测地址属于具体行星，复制设计时取消其绝对绑定。 */
export function beaconConfig(b,copy=false){
  if(!b||!smallText(b.title,64)||!b.title.trim()||!smallText(b.body,1800)||!smallText(b.tag,120)||
    !Object.hasOwn(scopes,b.scope)||!Object.hasOwn(captions,b.caption)||!(b.icon===null||physicalIds.has(b.icon))||
    typeof b.color!=='string'||!/^#[0-9a-f]{6}$/i.test(b.color)||!size(b.height,5,37.5)||!size(b.radius,0,5)||
    !(b.meter===null||typeof b.meter==='string'&&/^-?\d{1,2},-?\d{1,2}(?:@[0-9]{1,2}(?:[.]5)?)?$/.test(b.meter)))throw new Error('全息信标的标记或投影设置无效');
  const {title,body,tag,icon,color,scope,caption,height,radius,meter}=b;
  return {title,body,tag,icon,color:color.toLowerCase(),scope,caption,height,radius,meter:copy?null:meter};
}
export function updateBeacon(planet,tile,patch){
  if(!tile?.beacon||tile.hull===0)throw new Error('该信标已拆除或损坏');
  if(patch.meter!=null&&!planet.tiles[patch.meter]?.monitor)throw new Error('请选择本行星的流速监测器');
  tile.beacon=beaconConfig({...tile.beacon,...patch});
}
/** 投影端点 60–660 kW，17.5 米高、3 米半径约 330 kW。网页用两维插值取最近的 30 kW 档。 */
export function beaconDemand(b){return b.scope==='off'?0:30*Math.round((60+12*(b.height-5)+42*b.radius)/30);}
export function litBeacon(tile){return tile.hull!==0&&tile.power>0&&tile.beacon.scope!=='off';}
export function beamColor(planet,tile){
  const b=tile.beacon;
  if(!b.meter)return b.color;
  const meter=planet.tiles[b.meter];
  return stateColors[meter?.hull!==0&&meter?.monitor?.state||'offline'];
}
export function markId(body,tile){return body+'@'+key(tile.x,tile.y);}
/** 管理面板使用建成行星的账本，进入远端编辑不切换玩家和工厂所在行星。 */
export function resolveMark(game,id){
  if(typeof id!=='string')return null;
  const [body,loc]=id.split('@');const planet=body===game.space.current?game.planet:game.space.parked[body];
  const tile=planet?.tiles?.[loc];return tile?.beacon&&tile.hull!==0?{body,planet,tile}:null;
}
export function* registeredMarks(game){
  const worlds=[[game.space.current,game.planet],...Object.entries(game.space.parked)];
  for(const [body,planet] of worlds)for(const tile of signalIndex(planet).beacons)yield {body,planet,tile};
}
/** 远方星图遵守发射信标的作用域。玩家查看另一星系时，只有全星区设置能跨越机甲与源星系之间的距离。 */
export function visibleFrom(game,body,tile,view){
  if(!litBeacon(tile))return false;
  const scope=tile.beacon.scope;
  if(view==='cluster')return scope==='cluster';
  if(view==='system')return scope==='cluster'||scope==='system'&&homeSystemOf(body)===homeSystemOf(game.space.current);
  return body===game.space.current&&!game.space.flight&&(view==='surface'||scope!=='sight');
}
export function markName(game,body){return bodyOf(game,body)?.title||body;}
