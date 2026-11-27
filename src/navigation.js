import {flow,recordFlow} from './production-log.js';
import {makePlanet,environments} from './world.js';
import {createField} from './fog-rules.js';
import {gasProfile} from './gas.js';
import {capabilitiesOf} from './upgrades.js';
import {add,count} from './stock.js';
import {newSphere} from './sphere.js';
import {AU,LY,activeStar,starOf,bodyOf,homeSystemOf} from './cluster.js';
export {AU,LY,starSystem,bodyOf} from './cluster.js';

export const newNavigation=(starCount=64)=>({current:'home',parked:{},flight:null,starCount,spheres:{}});
export {positionAt} from './ephemeris.js';
import {positionAt} from './ephemeris.js';
import {ceiling,heightOf} from './surface-motion.js';
import {launchVector,approachRadius,pilotStep,traceLanding,inGravityWell} from './sail-pilot.js';
export const separation=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const mechaPosition=game=>game.space.flight?.position||positionAt(game,bodyOf(game,game.space.current));
export const description=body=>environments[body.biome]?.label||gasProfile(body).label;

/** 从所处天体起飞，保留地表实体。低空飞行需引擎 I，星系内的常规航行需引擎 II 和起飞能量。拒绝时不扣能量。 */
export function depart(game,destination,withWarp=false) {
  const body=bodyOf(game,destination),limits=capabilitiesOf(game);
  if(game.space.flight)throw new Error('机甲已在航行中');
  if(!body)throw new Error('没有找到目的天体');
  if(body.id===game.space.current)throw new Error('已在这颗行星上');
  if(!limits.sailMS)throw new Error('星际航行需要驱动引擎 II');
  if(game.mecha.energy<12)throw new Error('起飞需要 12 MJ 核心能量');
  if(withWarp)checkWarp(game,limits);
  const center=mechaPosition(game), target=positionAt(game,body);
  const distance=separation(center,target);
  // 表面模式与航行模式共用 200 米行星半径。起飞点取朝向目的地的高空出口，避免机甲和尾随相机从球心穿出。
  // 气态巨星直径更大，离轨起点和到站捕获半径要在云层外，否则跟随相机会短暂进入气体球内。
  const departureHeight=game.planet.biome==='gas'?610:280;
  const position=center.map((coordinate,i)=>coordinate+departureHeight*(target[i]-coordinate)/distance);
  releaseSurface(game);
  game.space.flight={from:game.space.current,to:body.id,position,speed:140,travelled:0};
  if(withWarp)game.space.flight.autoWarp=true;
}
/** 近地飞行持续向上且向前，达到网页版 50 米衔接高度后进入帆航。返回是否起航，条件不足时原地维持悬停。 */
export function leaveAtmosphere(game){
  const m=game.mecha,height=heightOf(m);
  if(game.space.flight||!m.flying||height<ceiling||!capabilitiesOf(game).sailMS||m.energy<12)return false;
  const from=game.space.current,pose=launchVector(game,bodyOf(game,from),height);
  releaseSurface(game);
  game.space.flight={from,to:null,...pose,speed:100,travelled:0};
  return true;
}

/** 两种离轨入口统一结算。最后着陆点留在原行星，太空模式接管坐标和推进器。 */
function releaseSurface(game){
  const m=game.mecha;
  if(m.intake){m.intake=null;m.intakeWork=0;}
  m.energy-=12;Object.assign(m,{flying:false,target:null,mining:null,timber:null,progress:0});
  delete m.lift;
  game.planet.lastLanding={x:m.x,y:m.y};
}

/** 飞行途中选择追踪天体，保留位置与动能。已经离轨的机甲调转回母星时也使用同一航线。 */
export function setCourse(game,id){
  const f=game.space.flight;
  if(!f||!bodyOf(game,id))throw new Error('请选择航行中的目标天体');
  f.to=id;delete f.heading;delete f.autoWarp;
}

/** 接管自动航线，以原来的速度方向开始滑行。保留目标用作仪表参考，追踪推力由玩家决定。 */
export function takeHelm(game){
  const f=game.space.flight;
  if(!f)throw new Error('需要先进入帆航');
  if(f.heading)return;
  const target=positionAt(game,bodyOf(game,f.to)),d=separation(f.position,target);
  if(!d)throw new Error('已进入着陆区');
  f.heading=target.map((v,i)=>(v-f.position[i])/d);delete f.autoWarp;
}
export {toggleFlight} from './surface-motion.js';
function checkWarp(game,limits){
  if(!limits.warpMS)throw new Error('曲速需要驱动引擎 IV');
  if(!count(game.bag,'space-warper'))throw new Error('背包中缺少空间翘曲器');
  if(game.mecha.energy<60)throw new Error('进入曲速需要 60 MJ 核心能量');
}
/** 每次进入曲速消耗一枚翘曲器，退出免费。重力井内的手动指令不扣款，自动航线在脱离后才点火。 */
export function toggleWarp(game){
  const flight=game.space.flight;
  if(!flight)throw new Error('需要先进入帆航');
  if(flight.warp){flight.warp=false;flight.speed=Math.min(flight.speed,capabilitiesOf(game).sailMS);return;}
  if(inGravityWell(game,flight.position))throw new Error('飞离行星 1,000 m 后可开启曲速');
  const limits=capabilitiesOf(game);checkWarp(game,limits);
  add(game.bag,'space-warper',-1);recordFlow(game.planet,game.elapsed,'space-warper',flow.used);game.mecha.energy-=35;flight.warp=true;flight.autoWarp=false;
}
/** 用当前速度和燃料积分航程。接近目标恒星的一光年内减速，关闭或耗尽能量只退出曲速，常规航行仍可抵达。 */
function cruise(game,f,dt,remaining){
  if(f.autoWarp && !inGravityWell(game,f.position)){
    if(count(game.bag,'space-warper')&&game.mecha.energy>=60)toggleWarp(game);else f.autoWarp=false;
  }
  const limits=capabilitiesOf(game);
  if(f.warp){
    const metresPerMJ=LY/240,affordable=game.mecha.energy*metresPerMJ;
    const approach=Math.max(limits.sailMS,limits.warpMS*Math.min(1,Math.sqrt(remaining/LY)));
    f.speed=Math.min(approach,f.speed+limits.warpMS*.8*dt);
    const travel=Math.min(affordable,remaining,f.speed*dt);
    game.mecha.energy=Math.max(0,game.mecha.energy-travel/metresPerMJ);
    if(game.mecha.energy<.1||remaining-travel<4000){f.warp=false;f.speed=Math.min(limits.sailMS,f.speed);}
    return travel;
  }
  const acceleration=Math.min(100*dt,game.mecha.energy/.032,limits.sailMS-f.speed);
  if(acceleration>0){f.speed+=acceleration;game.mecha.energy-=acceleration*.032;}
  return Math.min(remaining,f.speed*dt);
}
/** 机甲着陆时才交换本星戴森球。工厂和货单使用全星团唯一的天体 ID，不随活动视点迁移。 */
function enterStar(game,id){
  const old=activeStar(game);
  if(id===old.id)return;
  const ledgers=game.space.spheres;
  ledgers[old.id]=game.dyson;
  game.dyson=ledgers[id]||Object.assign(newSphere(),{luminosity:starOf(game,id).luminosity});
  delete ledgers[id];
}
export const sphereOf=(game,id)=>homeSystemOf(game.space.current)===id?game.dyson:game.space.spheres[id];
/** 导航每个逻辑步追踪目标的实际位置，核心能源不足只能滑行。抵达后才交换活动行星和后台工厂。 */
export function advanceFlight(game,dt,input) {
  const space=game.space,f=space.flight;if(!f)return false;
  if(f.heading){
    const distance=pilotStep(game,dt,input),start=f.position,end=start.map((v,i)=>v+f.heading[i]*distance);
    const hit=traceLanding(game,start,end,dt);
    f.travelled+=distance*(hit?.fraction??1);
    if(hit)return land(game,hit.body,hit.site);
    f.position=end;return false;
  }
  const dest=bodyOf(game,f.to),target=positionAt(game,dest),remaining=separation(f.position,target);
  const travel=cruise(game,f,dt,remaining);f.travelled+=travel;
  if(remaining>travel+approachRadius(dest)){for(let i=0;i<3;i++)f.position[i]+=(target[i]-f.position[i])*travel/remaining;return false;}
  return land(game,dest);
}
/** 手动触地使用碰撞经纬度，导航着陆则使用已记录的泊位。原星折返必须直接复用活动工厂，否则会复制生产库存。 */
function land(game,dest,site){
  const space=game.space,returning=dest.id===space.current;
  const existing=returning?game.planet:space.parked[dest.id];
  const landing=existing||makePlanet(dest.seed,dest.biome,game.resource,false);
  if(!existing){
    landing.fog=createField(landing,game.fogMode);
    // 同星系已有地面基地时，新探索的地表保留给飞来的中继占领，首次抵达该星系仍可遭遇原生基地。
    const established=homeSystemOf(space.current)===dest.star&&game.planet.fog||Object.entries(space.parked).some(([id,p])=>homeSystemOf(id)===dest.star&&p.fog);
    if(landing.fog&&established){const f=landing.fog;f.sealed=true;f.vacant=true;f.base.hp=0;f.relayHP=0;f.relayMatter=0;f.matter=0;f.ready=0;}
  }
  delete game.mecha.battle;
  if(!returning){space.parked[space.current]=game.planet;delete space.parked[dest.id];}
  enterStar(game,dest.star);game.planet=landing;space.current=dest.id;space.flight=null;
  const hovering=dest.biome==='gas';
  Object.assign(game.mecha,site||landing.lastLanding||{x:0,y:hovering?0:-1},{progress:0,target:null,mining:null,flying:hovering});
  return true;
}
