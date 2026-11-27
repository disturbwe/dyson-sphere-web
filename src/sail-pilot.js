import {ANGLE,clamp,wrap} from './world.js';
import {AU,LY,clusterOf,starSystem,centerMeters} from './cluster.js';
import {skyAt,positionAt,stellarUp} from './ephemeris.js';
import {capabilitiesOf} from './upgrades.js';

const nearestCache=new WeakMap();
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const difference=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const length=v=>Math.hypot(v[0],v[1],v[2]);
export const approachRadius=body=>body.biome==='gas'?570:200;

/** 在恒星坐标内寻找最近星系。两最近恒星的距离差给出安全缓存半径，在它以内无需每步遍历整个星团。 */
export function pilotStar(game,point){
  const cached=nearestCache.get(game);
  if(cached&&length(difference(point,cached.at))<cached.room)return cached.star;
  let first=Infinity,second=Infinity,star;
  for(const candidate of clusterOf(game).stars){
    const d=Math.hypot(point[0]-candidate.position[0]*LY,point[1]-candidate.position[1]*LY,point[2]-candidate.position[2]*LY);
    if(d<first){second=first;first=d;star=candidate;}
    else if(d<second)second=d;
  }
  nearestCache.set(game,{star,at:[...point],room:(second-first)/2});return star;
}

/** 用出发点的实际经纬度和自转相位生成向外的初始航向。米制球壳与地表镜头使用同一离地高度。 */
export function launchVector(game,body,height){
  const direction=stellarUp(game.mecha,skyAt(game,body));
  const origin=positionAt(game,body);
  return {position:origin.map((v,i)=>v+direction[i]*(approachRadius(body)+height)),heading:direction};
}

/** 当帆航轨迹触碰行星时，把恒星坐标的接触法线还原为当地地理坐标。经线接缝和可行走极限沿用地表规则。 */
export function groundContact(game,body,relative,time){
  const radius=length(relative);
  // 静止机甲恰好位于球心时没有接触法线，沿用该天体的泊位，避免把 NaN 写回地表坐标。
  if(radius===0){
    const planet=body.id===game.space.current?game.planet:game.space.parked[body.id];
    return {...(planet?.lastLanding||{x:0,y:0})};
  }
  const local=skyAt(game,body,time).basis.map(axis=>dot(relative,axis)/radius);
  return {x:wrap(Math.atan2(local[0],local[2])/ANGLE),y:clamp(Math.asin(clamp(local[1],-1,1))/ANGLE,-44.5,44.5)};
}

/** 在单步内找机甲相对移动行星的首次入射时刻。曲速下每步可能超过行星直径，只测帧末位置会穿过整颗星。 */
function firstContact(a,b,radius){
  const offset=dot(a,a)-radius*radius;
  if(offset<=0)return 0;
  const move=difference(b,a),speed=dot(move,move),projection=dot(a,move);
  if(projection>=0||speed===0)return Infinity;
  const discriminant=projection*projection-speed*offset;
  if(discriminant<0)return Infinity;
  // 有理化求根可避免在球面附近对两个几乎相等的大数做减法。
  const at=offset/(-projection+Math.sqrt(discriminant));
  return at<=1?at:Infinity;
}

/** 曲速入口检查当前位置附近的天体。手动帆航可以掠过别的行星，离开出发点的距离不足以判定脱离重力井。 */
export function inGravityWell(game,position){
  const star=pilotStar(game,position);
  if(length(difference(position,centerMeters(star)))>4*AU)return false;
  return starSystem(game,star.id).some(body=>length(difference(position,positionAt(game,body)))<1000);
}

/** 只检查航段所经的近邻星系。固定步的最大曲速位移远小于星系间距，处在深空时跳过所有行星星历。 */
export function traceLanding(game,start,end,dt){
  const star=pilotStar(game,end),distance=length(difference(end,centerMeters(star)));
  if(distance>4*AU+length(difference(end,start)))return null;
  let best=null,earliest=Infinity;
  for(const body of starSystem(game,star.id)){
    const a=difference(start,positionAt(game,body,game.elapsed-dt));
    const b=difference(end,positionAt(game,body));
    const fraction=firstContact(a,b,approachRadius(body));
    if(fraction>=earliest)continue;
    earliest=fraction;
    const relative=a.map((v,i)=>v+(b[i]-v)*fraction);
    best={body,fraction,site:groundContact(game,body,relative,game.elapsed-dt+dt*fraction)};
  }
  return best;
}

/** 手动帆航以米和秒积分。W 令速度朝准星并补至 100 m/s，Shift 的提速每 m/s 支出 0.5 MJ，松手后惯性滑行。 */
export function pilotStep(game,dt,input){
  const f=game.space.flight,limits=capabilitiesOf(game);
  if(input?.aim)f.heading=[...input.aim];
  if(f.warp){
    // 曲速沿当步航向消耗核心。当步以实际可支付里程为准，退出后回到引擎的常规航速上限。
    f.speed=Math.min(limits.warpMS,f.speed+.8*limits.warpMS*dt);
    const distance=Math.min(f.speed*dt,game.mecha.energy*LY/240);
    game.mecha.energy=Math.max(0,game.mecha.energy-distance*240/LY);
    if(game.mecha.energy<.1){f.warp=false;f.speed=Math.min(f.speed,limits.sailMS);}
    return distance;
  }
  if(input?.brake)f.speed=Math.max(0,f.speed-180*dt);
  else{
    if(input?.forward&&f.speed<100)f.speed=Math.min(100,f.speed+80*dt);
    if(input?.boost){
      const gain=Math.min(180*dt,limits.sailMS-f.speed,game.mecha.energy/.5);
      game.mecha.energy-=gain*.5;f.speed+=gain;
    }
  }
  return f.speed*dt;
}
