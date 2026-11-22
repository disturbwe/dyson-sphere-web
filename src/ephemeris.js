import {bodyOf,centerMeters,starOf} from './cluster.js';
import {axis,rng} from './world.js';

const turn=2*Math.PI;
const poses=new WeakMap(), rotations=new WeakMap();

/** 返回相对本恒星的米制位置。卫星先绕母星公转，以免远星的绝对坐标影响近景精度。 */
export function orbitalPosition(game,body,time=game.elapsed){
  const phase=body.phase+turn*time/body.period;
  const radial=body.radius*Math.sin(phase);
  const point=[body.radius*Math.cos(phase),radial*Math.sin(body.tilt),radial*Math.cos(body.tilt)];
  if(body.parent){
    const parent=orbitalPosition(game,bodyOf(game,body.parent),time);
    for(let i=0;i<3;i++)point[i]+=parent[i];
  }
  return point;
}
export function positionAt(game,body,time=game.elapsed){
  const center=centerMeters(starOf(game,body.star));
  return orbitalPosition(game,body,time).map((v,i)=>v+center[i]);
}

/** 自转参数用独立的种子序列生成，避免新增季节移动旧档里的星体。母星初始经度在白昼，便于着陆。 */
export function rotationOf(game,body){
  let spin=rotations.get(body);
  if(spin)return spin;
  const random=rng(body.seed^0x4182),home=body.id==='home';
  const tilt=(home?.12:(random()-.5)*.95),period=home?turn*160:Math.round(440+random()*890);
  const sign=!home&&random()<.10?-1:1;
  const origin=orbitalPosition(game,body,0);
  const ux=-origin[0]*Math.cos(tilt)-origin[1]*Math.sin(tilt);
  const phase=Math.atan2(ux,-origin[2])+(home?.77:(random()-.5)*turn);
  spin={tilt,period:period*sign,phase};rotations.set(body,spin);return spin;
}

/** 为一个模拟时刻生成星体姿态。当地太阳、发电、电磁弹射器和摄影机共用同一组方向余弦。 */
export function skyAt(game,body,time=game.elapsed){
  const previous=poses.get(body);
  if(previous?.time===time)return previous;
  const spin=rotationOf(game,body),angle=spin.phase+turn*(time%spin.period)/spin.period;
  const c=Math.cos(angle),s=Math.sin(angle),a=Math.cos(spin.tilt),b=Math.sin(spin.tilt);
  // 三列依次是行星当地 X、Y、Z 在恒星坐标中的方向。投影向量点乘三列即得到逆旋转。
  const basis=[[a*c,b*c,-s],[-b,a,0],[a*s,b*s,c]];
  const origin=orbitalPosition(game,body,time),range=Math.hypot(...origin);
  const sun=basis.map(col=>-(col[0]*origin[0]+col[1]*origin[1]+col[2]*origin[2])/range);
  const pose={time,basis,origin,range,sun};poses.set(body,pose);return pose;
}
export function sunCosine(tile,sky){
  const [x,y,z]=axis(tile.x,tile.y);
  return x*sky.sun[0]+y*sky.sun[1]+z*sky.sun[2];
}
/** 按太阳高度的方向余弦求跟踪式电板的晨昏系数。地平线上仍有余晖，达到约 3.3° 即可满发。 */
export function photovoltaicFactor(incidence){
  return Math.min(1,Math.max(0,2.5*incidence+.857244491577148));
}
/** 将地表网格的天顶换算为恒星坐标，供轨道切入角和行星地平线判断。 */
export function stellarUp(tile,sky){
  const up=axis(tile.x,tile.y);
  return [0,1,2].map(i=>up[0]*sky.basis[0][i]+up[1]*sky.basis[1][i]+up[2]*sky.basis[2][i]);
}
