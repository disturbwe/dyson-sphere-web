import {axis,clamp} from './world.js';

export const shieldType='df-planetary-shield-generator';
export const shieldLimit=80, ignitionMJ=1440, supportMJ=2880, capacitorMJ=8640, upkeepKW=12000;
const globeCapacityMJ=1200000, networks=new WeakMap();
const samples=Array.from({length:640},(_,i)=>{
  // 等面积方向只在护盾高度跨档时采样，极区和赤道在覆盖率中按实际面积计量。
  const y=1-2*(i+.5)/640,ring=Math.sqrt(1-y*y),angle=i*Math.PI*(3-Math.sqrt(5));
  return [Math.cos(angle)*ring,y,Math.sin(angle)*ring];
});
export function installShield(planet,tile){
  planet.shield??={fieldMJ:0,repelled:0,absorbed:0};
  tile.capacitorMJ=0;tile.fieldKW=0;
}
/** 建造上限涵盖已建和已预约的发生器，同一蓝图的其他新增节点由预检另行累计。 */
export function claimedShields(planet){
  return Object.values(planet.tiles).filter(t=>t.type===shieldType).length+
    Object.values(planet.construction?.sites||{}).filter(t=>t.type===shieldType).length;
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const strengthBand=cap=>cap<ignitionMJ?0:1+Math.round(47*clamp((cap-ignitionMJ)/(supportMJ-ignitionMJ),0,1));
/** 在单位方向上合计各塔的支撑力。渲染方可传入可复用的 profile，同时获得最近塔的投影高度和辉光强度。 */
export function shieldStrength(sources,unit,profile){
  let support=0;
  if(profile){profile.lift=0;profile.focus=0;}
  for(const source of sources){
    if(!source.band)continue;
    const distanceFromEdge=dot(source.up,unit)-source.edge;
    if(distanceFromEdge<=0)continue;
    const t=Math.min(1,distanceFromEdge*source.slope);
    support+=t*t*(3-2*t);
    if(profile){
      // 相邻薄膜能共同拒降，塔顶亮斑只属于自己的投射柱。分开取峰值可保留塔间低垂的蓝色薄膜。
      const focus=Math.min(1,distanceFromEdge*source.inverseSpan);
      profile.focus=Math.max(profile.focus,focus);
      profile.lift=Math.max(profile.lift,source.lift*focus*(.38+.62*focus));
    }else if(support>=1)return 1;
  }
  return Math.min(1,support);
}
const empty={sources:[],revision:0,coverage:0,full:0,capacity:0};
/** 返回当前行星的发生器位置、两种覆盖率和公共能量池容量。建拆失效拓扑，充电仅影响已变化的高度档。 */
export function shieldMap(planet){
  if(!planet.shield)return empty;
  let map=networks.get(planet),changed=false;
  if(!map||map.layout!==planet.revision){
    const sources=Object.values(planet.tiles).filter(t=>t.type===shieldType&&t.hull!==0)
      .map(tile=>({tile,up:axis(tile.x,tile.y),band:-1,edge:1,slope:0}));
    map={...empty,sources,layout:planet.revision,revision:(map?.revision||0)+1};
    networks.set(planet,map);changed=true;
  }
  for(const source of map.sources){
    const band=strengthBand(source.tile.capacitorMJ);
    if(band===source.band)continue;
    source.band=band;changed=true;
    // 网页球面按满支撑 55° 外缘、28° 核心近似；低空护盾从塔心展开，邻塔交界可累加支撑。
    const rise=Math.max(0,(band-1)/47),angle=Math.PI/180;
    source.edge=Math.cos((5+50*rise)*angle);
    source.slope=1/(Math.cos((2+26*rise)*angle)-source.edge);
    source.inverseSpan=1/(1-source.edge);source.lift=.09+.91*rise;
  }
  if(changed){
    let solid=0,present=0,potential=0;
    for(const unit of samples){
      const support=shieldStrength(map.sources,unit);
      if(support>0)present++;if(support>=.999)solid++;potential+=support;
    }
    map.coverage=present/samples.length;map.full=solid/samples.length;
    map.capacity=globeCapacityMJ*potential/samples.length;map.revision++;
  }
  return map;
}
/** 余电需求以 kW 返回。先建立本机支撑，达到工作高度后同时补充公共池，高于三分之二逐步减慢池充电。 */
export function shieldRoom(tile,pool,capacity,dt){
  const local=Math.min(upkeepKW,(capacitorMJ-tile.capacitorMJ)*1000/dt);
  if(tile.capacitorMJ<supportMJ||capacity<=pool.fieldMJ)return local;
  const taper=clamp(3*(1-pool.fieldMJ/capacity),0,1);
  return Math.min(upkeepKW,local+Math.min(upkeepKW*taper,(capacity-pool.fieldMJ)*1000/dt));
}
/** 以本步实分的电力结算维持和储能。断网时由本机储备负担维持，池剩余空间在实际写入时复核。 */
export function chargeShield(tile,pool,capacity,dt,power,extraKW){
  tile.power=power;
  // 多台设备同时充同一公共池时，按先前设备结算后的剩余容量复核，避免多扣发电燃料。
  extraKW=Math.min(extraKW,shieldRoom(tile,pool,capacity,dt));
  tile.fieldKW=upkeepKW*power+extraKW;
  tile.capacitorMJ=Math.max(0,tile.capacitorMJ-upkeepKW*(1-power)*dt/1000);
  const incoming=extraKW*dt/1000;
  let local=Math.min(incoming,capacitorMJ-tile.capacitorMJ);
  if(tile.capacitorMJ>=supportMJ&&capacity>pool.fieldMJ){
    const field=Math.min(capacity-pool.fieldMJ,incoming-local*.5);
    pool.fieldMJ+=field;local=incoming-field;
  }
  tile.capacitorMJ=Math.min(capacitorMJ,tile.capacitorMJ+local);
  tile.status=tile.capacitorMJ<ignitionMJ?(extraKW?'发生器充能':'等待电力'):tile.capacitorMJ<supportMJ?'低空护盾':'护盾已展开';
  return extraKW;
}
/** 仅处理游戏内的轨道伤害，返回穿透量。每点抵消默认消耗 0.2 MJ，公共能量耗尽后动用命中区域内的发生器。 */
export function absorbOrbital(planet,point,damage,efficiency=1){
  const map=shieldMap(planet),up=axis(point.x,point.y);
  if(!shieldStrength(map.sources,up))return damage;
  const price=.2/efficiency,needed=damage*price,pool=planet.shield;
  let spent=Math.min(pool.fieldMJ,needed);pool.fieldMJ-=spent;
  for(const source of map.sources){
    if(spent>=needed||!source.band||dot(source.up,up)<=source.edge)continue;
    const take=Math.min(source.tile.capacitorMJ,needed-spent);source.tile.capacitorMJ-=take;spent+=take;
  }
  const blocked=Math.min(damage,spent/price);pool.absorbed+=blocked;
  return Math.max(0,damage-blocked);
}
export function validShield(planet){
  const tiles=Object.values(planet.tiles).filter(t=>t.type===shieldType),pool=planet.shield;
  if(!pool)return !tiles.length&&claimedShields(planet)<=shieldLimit;
  const finite=(v,max=Infinity)=>Number.isFinite(v)&&v>=0&&v<=max;
  return claimedShields(planet)<=shieldLimit&&finite(pool.fieldMJ,globeCapacityMJ)&&finite(pool.absorbed)&&Number.isSafeInteger(pool.repelled)&&pool.repelled>=0&&
    tiles.every(t=>finite(t.capacitorMJ,capacitorMJ)&&finite(t.fieldKW,2*upkeepKW+1e-6));
}
