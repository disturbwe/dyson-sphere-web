import {items} from './catalog.js';
import {capabilitiesOf} from './upgrades.js';
import {add,count,total} from './stock.js';
import {distance,delta,wrap,key,ANGLE} from './world.js';
import {homeSystemOf} from './cluster.js';
import {equipment,stocked,missile,jammer,signal,signalReach} from './defense-equipment.js';
import {selectOrbit,stationaryRelay,damageOrbit} from './defense-orbit.js';
import {damageGround,groundContact,fireRound,resolveMissiles,moveFactor} from './defense-fire.js';
import {soilLimit} from './reform.js';
import {stationed} from './space-hive.js';
import {hurtStructure,laser,analysisBase,battleCap,maxHull,coreHealth,spawnDebris,randomRoll,restoreRuin} from './fog-rules.js';

const indexes=new WeakMap(), visuals=new WeakMap();
const beat=.2;
/** 设施只在拓扑改变时编入列表。所有来袭单位复用最近的工厂接触点，避免每个单位每帧遍历整个星球。 */
function installations(planet){
  let idx=indexes.get(planet);
  if(idx?.revision===planet.revision)return idx;
  const targets=Object.values(planet.tiles).filter(t=>maxHull(t)).sort((a,b)=>distance(planet.fog.base,a)-distance(planet.fog.base,b));
  const front=targets.find(t=>t.hull!==0),towers=targets.filter(t=>t.defense&&t.hull!==0);
  idx={revision:planet.revision,targets,front,towers,signals:towers.filter(t=>t.type===signal)};indexes.set(planet,idx);return idx;
}
/** 仅保存当前地表约一帧的光束。游戏结算不读取视觉历史，后台行星也不积攒绘制对象。 */
export const combatStrokes=p=>visuals.get(p)||[];
function recordBeam(game,p,a,b,color,endHeight=.43){
  if(p!==game.planet||game.space.flight)return;
  let events=visuals.get(p);if(!events){events=[];visuals.set(p,events);}
  while(events.length&&(events[0].until<game.elapsed||events.length>=60))events.shift();
  events.push({a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},color,endHeight,until:game.elapsed+.16});
}
function launch(f,front,now){
  if(!front||f.units.length||f.ready<1)return;
  const n=Math.min(battleCap,Math.floor(f.ready),4+f.wave*2+f.base.level);
  f.ready-=n;f.wave++;f.lastWave=n;f.unitCount+=n;f.threat=0;
  for(let i=0;i<n;i++){
    const kind=(i+f.wave)%4===0?'ranger':'raider',level=f.base.level;
    const angle=2*Math.PI*(i/n+randomRoll(f)*.09),hp=kind==='raider'?55+5*level:40+4*level;
    f.units.push({id:f.nextId++,kind,level,hp,x:wrap(f.base.x+2.1*Math.cos(angle)),y:f.base.y+2.1*Math.sin(angle),angle,goal:key(front.x,front.y)});
  }
}
function enemies(game,p,f,idx,dt,signals){
  for(const u of f.units){
    let target=p.tiles[u.goal];
    // 信号范围内才改写当前进攻目标，前哨停电后可重新选择最近存活的工厂。
    const lure=signals.find(t=>distance(u,t)<=signalReach);
    if(lure){target=lure;u.goal=key(lure.x,lure.y);}
    else if(target?.type===signal&&!target.power)target=null;
    const localTime=dt*moveFactor(u,game.elapsed);
    if(!target||target.hull===0){target=idx.front;if(!target||target.hull===0)continue;u.goal=key(target.x,target.y);}
    const dist=distance(u,target),ranger=u.kind==='ranger';
    if(dist>(ranger?2.5:.92)){
      const speed=ranger?1.36:.94,[dx,dy]=delta(u,target),fraction=Math.min(1,speed*localTime/dist);
      u.x=wrap(u.x+dx*fraction);u.y+=dy*fraction;u.angle=Math.atan2(dx*Math.cos(u.y*ANGLE),dy);continue;
    }
    // 耐久按基础生命记录，受击量折算后旧损伤和重建费用不随研究重复放大。
    hurtStructure(p,target,localTime*(ranger?11:15)*(1+u.level*.025)/capabilitiesOf(game).durability);
    recordBeam(game,p,u,target,0xff735d);
  }
}
function reaim(f,idx,body,hive,signals){
  // 标记按行星共享，先按导航节拍扫描至多 48 个敌人。多少座导弹塔都复用同一份结果。
  const marked=new Set();
  for(const unit of f.units)if(signals.some(t=>distance(unit,t)<=signalReach))marked.add(unit.id);
  const markedBase=f.base.hp>0&&signals.some(t=>distance(f.base,t)<=signalReach);
  for(const t of idx.signals)t.defense.marked=t.power&&t.defense.enabled?f.units.filter(u=>distance(t,u)<=signalReach).length+Number(f.base.hp>0&&distance(t,f.base)<=signalReach):0;
  for(const tile of idx.towers){
    const d=tile.defense;d.target=0;if(!d.enabled||tile.hull===0)continue;
    if(tile.type===analysisBase){
      const canPick=d.collect&&total(tile.output)<300&&f.debris.some(p=>distance(tile,p)<=13.5);
      if(canPick||(d.mend&&idx.targets.some(t=>t.hull!==undefined&&distance(tile,t)<=9&&(t.hull>0||count(tile.input,t.type)))))d.target=-2;
      continue;
    }
    if(tile.type===signal||!stocked(tile))continue;
    const rule=equipment[tile.type]||{near:0,far:6};
    if(rule.orbital){d.target=selectOrbit(hive,body,f,d);if(d.target)continue;}
    if(!rule.far||d.ground===false)continue;
    const guided=tile.type===missile;
    let closest=Infinity;
    for(const u of f.units){
      const r=distance(tile,u);
      if(u.hp>0&&r>=rule.near&&r<closest&&(r<=rule.far||guided&&marked.has(u.id))){closest=r;d.target=u.id;}
    }
    if(tile.type!==jammer&&!d.target&&f.base.hp>0){
      const r=distance(tile,f.base);
      if(r>=rule.near&&(r<=rule.far||guided&&markedBase))d.target=-1;
    }
  }
}
/** 每 0.2 秒刷新单位导航和目标。目标在电网结算前产生，使交战功耗按实际档位分配，低电会直接降低输出。 */
export function prepareCombat(game,planet,dt,body=game.space.current){
  const f=planet.fog;if(!f)return;
  f.clock+=dt;if(f.clock+1e-9<beat)return;f.clock=Math.max(0,f.clock-beat);
  const idx=installations(planet),signals=idx.signals.filter(t=>t.defense.enabled&&t.power>0);
  const lure=signals.find(t=>distance(f.base,t)<=signalReach);
  if(f.base.hp>0&&!f.sealed){
    const production=beat*(lure?10:1);
    f.matter=Math.min(15000,f.matter+production*3);const ready=Math.min(battleCap-f.ready,f.matter/16,production*.25);
    f.ready+=ready;f.matter-=ready*16;
    if(f.threat>=100||lure)launch(f,lure||idx.front,game.elapsed);
  }else if(!f.sealed&&f.relayMatter>=600){
    f.rebuild=Math.max(0,f.rebuild-beat);
    if(!f.rebuild){f.relayMatter-=600;f.base.hp=coreHealth(f.base.level);f.ready=4;f.matter=240;f.threat=0;}
  }
  enemies(game,planet,f,idx,beat,signals);
  for(let i=f.debris.length-1;i>=0;i--)if(f.debris[i].until<=game.elapsed){f.expired+=f.debris[i].count;f.debris.splice(i,1);}
  reaim(f,idx,body,game.space.fogNet.hives[homeSystemOf(body)],signals);
}
export function defenseDemand(t){
  const m=items[t.type].machine,d=t.defense;
  return d.enabled&&d.target&&stocked(t)?m.usage:m.drain;
}
function attackLaser(game,planet,tile,dt){
  const d=tile.defense,field=planet.fog,target=groundContact(field,d.target);
  if(!target?.hp){d.target=0;tile.status='警戒';return;}
  if(!tile.power){tile.status='未供电';return;}
  const damage=capabilitiesOf(game).energyDamage*120*dt*tile.power;
  damageGround(field,target,damage);d.shots+=damage;tile.status='激光照射';
  if(field.clock<dt+1e-6)recordBeam(game,planet,tile,target,0x9895ff);
}
function pick(game,f,pile,bag,cap){
  const n=Math.min(pile.count,cap);if(n<=0)return 0;
  add(bag,pile.item,n);add(f.loot,pile.item,n);pile.count-=n;
  if(!pile.count){f.soil+=pile.soil;game.mecha.soil=Math.min(soilLimit,game.mecha.soil+pile.soil);f.debris.splice(f.debris.indexOf(pile),1);}return n;
}
/** 以实际机甲位置取附近残骸。远程面板不扩大拾取半径，分析站和手拾共用同一残骸账本。 */
export function collectNearby(game){
  const f=game.planet.fog;if(!f||game.space.flight)throw new Error('需要抵达地面战区');
  let n=0;for(let i=f.debris.length-1;i>=0;i--)if(distance(f.debris[i],game.mecha)<=3)n+=pick(game,f,f.debris[i],game.bag,Infinity);
  if(!n)throw new Error('三格内没有可回收的残骸');return n;
}
function service(game,p,t,idx,dt){
  const d=t.defense;d.work+=dt*t.power;if(d.work<.45)return;d.work=0;
  if(d.mend){const patient=idx.targets.find(x=>x.hull!==undefined&&distance(x,t)<=9&&(x.hull>0||count(t.input,x.type)));
    if(patient){if(!patient.hull){restoreRuin(p,patient,t.input);t.status='设施重建';}else{patient.hull=Math.min(maxHull(patient),patient.hull+30);if(patient.hull===maxHull(patient))delete patient.hull;t.status='修复设施';}return;}}
  if(d.collect){const pile=p.fog.debris.find(x=>distance(t,x)<=13.5);if(pile){pick(game,p.fog,pile,t.output,300-total(t.output));t.status='残骸分析';}}
}
function selfDefense(game,p,f,dt){
  if(p!==game.planet||game.space.flight||!game.mecha.battle||game.mecha.energy<.05)return;
  const mecha=game.mecha,core=mecha.battle==='base'&&f.base.hp>0&&distance(mecha,f.base)<=5;
  if(mecha.battle==='relay'&&stationed(f)&&distance(mecha,f.base)<=5){
    // 上空中继只接受玩家明确下达的攻击指令。机甲实际耗能造成伤害，驻空期间的命中会迅速提高太空威胁。
    const time=Math.min(dt,mecha.energy/2.8);mecha.energy-=time*2.8;
    damageOrbit(null,f,stationaryRelay,time*42*capabilitiesOf(game).energyDamage);
    if(f.clock<dt+1e-6)recordBeam(game,p,mecha,f.base,0x8cedfd,5.6);return;
  }
  const target=core?f.base:f.units.find(u=>u.hp>0&&distance(mecha,u)<=5);
  if(!target)return;
  const time=Math.min(dt,mecha.energy/2.8);mecha.energy-=time*2.8;
  damageGround(f,target,time*42*capabilitiesOf(game).energyDamage);if(f.clock<dt+1e-6)recordBeam(game,p,mecha,target,0xff9c52);
}
/** 按已送达的电力累计威胁，用电不足和待机均按实值收费。波次、作战与战利品在所有已开发行星后台结算。 */
export function settleCombat(game,planet,grid,dt,body=game.space.current){
  const f=planet.fog;if(!f)return;
  if(f.base.hp>0&&!f.sealed&&game.fogMode!=='passive'){
    const usedMW=(grid.delivered+grid.charging)/1000;f.spent+=usedMW*dt;
    f.threat=Math.min(100,f.threat+usedMW*dt*(game.fogMode==='sharp'?.14:.035));
  }
  const idx=installations(planet),hive=game.space.fogNet.hives[homeSystemOf(body)];
  resolveMissiles(game,planet,body,hive);
  for(const tile of idx.towers){
    const d=tile.defense;if(tile.hull===0)continue;
    if(!d.enabled){tile.status='已停用';continue;}
    if(tile.type===signal)continue;
    if(!d.target){tile.status=!tile.power?'未供电':!stocked(tile)?'等待装填':'警戒';continue;}
    if(tile.type===analysisBase)service(game,planet,tile,idx,dt);
    else if(tile.type===laser)attackLaser(game,planet,tile,dt);
    else fireRound(game,planet,body,hive,tile,dt,recordBeam);
  }
  selfDefense(game,planet,f,dt);
  for(let i=f.units.length-1;i>=0;i--){const u=f.units[i];if(u.hp>0)continue;spawnDebris(f,u,game.elapsed);f.kills++;f.units.splice(i,1);}
}
