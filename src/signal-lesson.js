import {cannon,jammer,missile,plasma,shortPlasma,signal} from './defense-equipment.js';
import {createField} from './fog-rules.js';
import {newHive} from './space-hive.js';
import {markGround} from './reform.js';
import {button} from './ui-format.js';

const relayKey='4,2',plasmaKey='-3,-1',launcherKey='-6,-2';
/** 建立一个需要玩家主动启用标记的前哨。弹药、燃料和敌方编队均来自教学档的有限初始库存。 */
export function makeSignalLesson(game,put){
  const planet=game.planet;
  planet.fog=createField(planet,'normal',{x:11,y:7},1);
  game.techs.push('electromagnetism','high-efficiency-plasma-control','artificial-star-technology','df-signal-tower-tech','df-jammer-tower-tech','df-implosion-cannon-tech','df-missile-turret-tech','df-plasma-turret-tech');
  // 教学设施有固定基座，避免随机海岸把关键的信号节点放在水面下。
  function install(type,x,y,direction=1){
    planet.reform.cells[x+','+y]=1;markGround(planet,x,y);
    return put(game,type,{x,y},direction);
  }
  const star=install('artificial-star',-4,-4);star.input['antimatter-fuel-rod']=8;
  install('tesla-tower',0,-2);
  const launcher=install(missile,-6,-2);launcher.input['df-missile-set']=24;
  const orbital=install(plasma,-3,-1);orbital.input['df-antimatter-capsule']=4;
  const mortar=install(cannon,-1,1);mortar.input['df-shell-set']=12;
  const node=install(signal,4,2);node.defense.enabled=false;
  const slow=install(jammer,3,1);slow.input['df-jamming-capsule']=3;
  const near=install(shortPlasma,0,0);near.input['df-plasma-capsule']=5;
  game.space.fogNet.hives.s0=newHive();
  Object.assign(game.mecha,{x:.5,y:-1.4,energy:64});
  Object.assign(game.bag,{[signal]:2,[missile]:1,'df-missile-set':8,'df-suppressing-capsule':2,'df-plasma-capsule':8});
}
export function signalObjective(game){
  const planet=game.planet,node=planet.tiles[relayKey],launcher=planet.tiles[launcherKey];
  const h=game.space.fogNet.hives.s0;
  const lost=h?.lostLancers||0,shots=launcher?.defense?.shots||0;
  const title=!node?.defense?.enabled?'启用前哨信号塔':!lost?'观察远程标记与轨道拦截':'已拦截 '+lost+' 艘枪骑';
  const hint=!node?.defense?.enabled?'在信号塔面板启用设施，观察后方导弹塔发射。':!lost?'在磁化电浆炮中开启高空中继，观察太空巢穴的反应。':'导弹已发射 '+shots+' 枚，本行星回收的战利品可在战况面板查看。';
  return '<small>信号前哨</small><strong>'+title+'</strong><p>'+hint+'</p>'+button('inspect-machine',relayKey,'检查信号塔 →')+button('inspect-machine',plasmaKey,'检查磁化电浆炮 →')+button('inspect-machine',launcherKey,'检查导弹塔 →');
}
