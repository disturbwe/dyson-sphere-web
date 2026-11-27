import {RADIUS,clamp} from './world.js';
import {capabilitiesOf} from './upgrades.js';

// 高度以米保存，绘制时才换算到半径 51 的球。近地上限、跳速和重力按网页版机甲与镜头比例调校。
export const ceiling=50;
const hoveringHeight=6.4, gravity=20, jumpSpeed=12;
const climbSpeed=10, settleSpeed=14;

/** 旧档只有悬浮标记，按原来的低空位置恢复。行星表面、跟随镜头与配送机用同一高度。 */
export const heightOf=m=>m.lift?.height??(m.flying?hoveringHeight:0);
export const renderLift=m=>heightOf(m)*RADIUS/200;

function stopGathering(m){
  m.target=null;m.mining=null;m.timber=null;m.progress=0;
}

/** 地面起跳不需要飞行科技。成功时取消当次地表采集，已离地时返回 false，防止长按或重复事件在空中续跳。 */
export function jumpFromGround(game){
  const m=game.mecha;
  if(game.space.flight||game.planet.biome==='gas'||m.flying||m.lift)return false;
  stopGathering(m);
  m.lift={height:0,velocity:jumpSpeed};
  return true;
}

/** 切换近地推进器。起飞要求引擎 I 与 1 MJ 核心余量，拒绝时维持跳跃轨迹；关机后从当前高度落回地面。 */
export function toggleFlight(game){
  const m=game.mecha;
  if(game.space.flight)throw new Error('航行中不能切换低空飞行');
  if(game.planet.biome==='gas')throw new Error('巨星没有固体地表，机甲保持悬浮');
  if(!capabilitiesOf(game).drive)throw new Error('低空飞行需要驱动引擎 I');
  const height=heightOf(m);
  if(m.flying){
    m.flying=false;
    if(height>0)m.lift={height,velocity:0};else delete m.lift;
  }else{
    if(m.energy<1)throw new Error('机甲能量不足');
    stopGathering(m);
    m.flying=true;
    m.lift={height,target:Math.max(hoveringHeight,height)};
  }
}

/** 每个固定模拟步更新一次离地高度。axis 为玩家当步的升降方向（−1、0、1），只保存松手后仍然有效的状态。 */
export function advanceLift(game,dt,axis=0){
  const m=game.mecha;
  if(m.flying){
    // 云顶没有着陆面，沿用采气时的固定悬浮；固态行星的推进器持续消耗约 1.2 MW。
    if(game.planet.biome==='gas'){m.energy=Math.max(0,m.energy-.14*dt);return;}
    m.energy=Math.max(0,m.energy-1.2*dt);
    if(m.energy>0){
      if(!m.lift&&!axis)return;
      const lift=m.lift??={height:hoveringHeight,target:hoveringHeight};
      // 刚起飞时仍要升到悬停高度。按下降可立即中止爬升，松开升降键后保持目标高度。
      if(axis>0)lift.target=clamp(Math.max(lift.target,lift.height+climbSpeed*dt),0,ceiling);
      if(axis<0)lift.target=clamp(lift.height-climbSpeed*dt,0,ceiling);
      lift.height+=clamp(lift.target-lift.height,-settleSpeed*dt,settleSpeed*dt);
      if(lift.target===0&&lift.height<=1e-8){m.flying=false;delete m.lift;}
      return;
    }
    const height=heightOf(m);m.flying=false;m.lift={height,velocity:0};
  }
  const lift=m.lift;
  if(!lift)return;
  // 用匀加速位移，模拟倍速和渲染帧率不会改变跳跃顶点。脚底触地即清除速度，跨过地面的一步也不会下陷。
  lift.height+=lift.velocity*dt-.5*gravity*dt*dt;
  lift.velocity-=gravity*dt;
  if(lift.height<=1e-8)delete m.lift;
}

/** 读档时校验高度、飞行模式与行星类型，避免将异常数值带入位置矩阵。缺少 lift 是合法的旧地面或悬浮状态。 */
export function validLift(game){
  const m=game.mecha,lift=m.lift;
  if(lift===undefined)return true;
  if(!lift||game.space.flight||game.planet.biome==='gas'||!Number.isFinite(lift.height)||lift.height<0||lift.height>ceiling)return false;
  if(m.flying)return capabilitiesOf(game).drive>0&&lift.velocity===undefined&&Number.isFinite(lift.target)&&lift.target>=0&&lift.target<=ceiling;
  if(lift.target!==undefined||!Number.isFinite(lift.velocity)||lift.velocity>jumpSpeed||lift.velocity< -Math.sqrt(2*gravity*ceiling))return false;
  // 上升中的弹道必须在近地坐标内到达顶点，否则虽能载入却会在下一步生成越界存档。
  return lift.height+Math.max(0,lift.velocity)**2/(2*gravity)<=ceiling+1e-8;
}
