import {newHive} from './space-hive.js';
import {shieldType,shieldMap} from './planet-shield.js';
import {elevation} from './world.js';
import {markGround} from './reform.js';
import {button} from './ui-format.js';

export const lessonTower={x:22,y:18};
const towerSites=[lessonTower,{x:-22,y:18},{x:22,y:-18},{x:-22,y:-18},
  {x:68,y:18},{x:-68,y:18},{x:68,y:-18},{x:-68,y:-18}];
/** 护盾教学接管一颗已有八塔的行星。各塔的本地储备及燃料是场景初始资产，来舰、着陆和维护照常模拟。 */
export function makeShieldLesson(game,put){
  const p=game.planet,f=p.fog;
  Object.assign(f,{sealed:true,vacant:true,relayHP:0,relayMatter:0,ready:0,matter:0});f.base.hp=0;
  game.techs.push('electromagnetism','df-planetary-defense-system','artificial-star-technology','environment-modification');
  for(const site of towerSites){
    const powerSite={x:site.x-1,y:site.y};
    // 预建平台随种子跨过海岸时保留下方矿床，铺面同时更新可见地形与未来建造检查。
    for(const point of [site,powerSite]){p.reform.cells[point.x+','+point.y]=1;markGround(p,point.x,point.y);}
    const t=put(game,shieldType,site,0);t.capacitorMJ=3500;
    const star=put(game,'artificial-star',powerSite,0);star.input['antimatter-fuel-rod']=24;
  }
  p.shield.fieldMJ=900;
  game.mecha.x=lessonTower.x;game.mecha.y=lessonTower.y-1;game.mecha.soil=8000;
  Object.assign(game.bag,{[shieldType]:2,'antimatter-fuel-rod':12,'tesla-tower':3,foundation:12});
  // 目标是阵地附近实际存在的干地。到达时重新检查该经纬度，让玩家来得及从轨道观察同一航线。
  let target={x:0,y:0},best=Infinity;
  for(let dx=-14;dx<=14;dx++)for(let dy=-12;dy<=12;dy++){
    if(Math.abs(dx)+Math.abs(dy)<3)continue;
    const x=lessonTower.x+dx,y=lessonTower.y+dy,score=dx*dx+dy*dy;
    if(score<best&&elevation(x,y,p.seed,p.biome)>.14){target={x,y};best=score;}
  }
  const h=newHive();game.space.fogNet.hives.s0=h;
  h.attempts=1;h.matter-=6000;h.energyMJ-=1500;
  h.flight={body:'home',...target,cargo:6000,energy:1500,leg:'approach',left:24};
  // 先前战斗已让巢穴集结一支两舰编队。目标随此波锁定本星，玩家离开时照样依命中情况扣能。
  h.threat=100;
}
export function shieldObjective(game){
  const p=game.planet,map=shieldMap(p);
  const summary=p.shield.repelled?'已拒止 '+p.shield.repelled+' 次中继降落':'中继正在接近地表';
  return '<small>行星防御</small><strong>'+summary+'</strong><p>护盾覆盖 '+(map.coverage*100).toFixed(1)+'%　已抵挡 '+Math.round(p.shield.absorbed)+' 点轨道伤害</p>'+
    button('shield-overview','','观察轨道 →')+button('inspect-machine',lessonTower.x+','+lessonTower.y,'检查发生器 →');
}
