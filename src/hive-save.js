import {homeSystemOf,starOf} from './cluster.js';
import {relayHealth,relayTripSeconds} from './space-hive.js';

const integer=(value,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const bounded=(value,min,max=Infinity)=>Number.isFinite(value)&&value>=min&&value<=max;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const point=value=>record(value)&&integer(value.x,-90,89)&&integer(value.y,-43,43);
function check(condition){if(!condition)throw new Error('太空巢穴或在途货单存档无效');}
/** 核对在途目的星和库存的合法范围。中继、驳船与来袭编队绑定到实际模拟中的行星，切换星球读档可继续原订单。 */
export function validateHives(game){
  const net=game.space.fogNet;
  check(record(net)&&bounded(net.clock,0,1)&&record(net.hives));
  const worlds=new Map([[game.space.current,game.planet],...Object.entries(game.space.parked)]);
  const systems=new Set();
  for(const [id,p] of worlds){
    const f=p.fog;if(!f)continue;systems.add(homeSystemOf(id));
    if(f.relayHP!==undefined)check(bounded(f.relayHP,0,relayHealth(f.base.level)));
    if(f.relaySerial!==undefined)check(integer(f.relaySerial,0));
    if(f.vacant!==undefined)check(f.vacant===true&&f.sealed&&f.relayHP===0&&!f.well);
    if(f.bulk!==undefined)check(integer(f.bulk,0));
    if(f.relayEnergy!==undefined)check(bounded(f.relayEnergy,0));
    if(f.grievance!==undefined)check(bounded(f.grievance,0));
    if(f.oldWells!==undefined){check(record(f.oldWells));for(const [key,level] of Object.entries(f.oldWells)){
      const xy=key.split(',').map(Number);check(xy.length===2&&xy.join(',')===key&&point({x:xy[0],y:xy[1]})&&integer(level,0,30));
    }}
  }
  for(const [star,h] of Object.entries(net.hives)){
    check(systems.has(star)&&starOf(game,star)&&record(h));
    const destination=body=>typeof body==='string'&&worlds.get(body)?.fog&&homeSystemOf(body)===star;
    check(integer(h.matter,0)&&bounded(h.energyMJ,0)&&integer(h.frame,-1,899)&&integer(h.docked,0)&&integer(h.retry,0,30));
    check(integer(h.keel,-1,179)&&integer(h.lancers,0,12)&&bounded(h.threat,0,100));
    for(const key of ['attempts','landed','repelled','delivered','waves','volleys'])check(integer(h[key],0));
    for(const prop of ['lostRelays','lostLancers'])if(h[prop]!==undefined)check(integer(h[prop],0));
    check(h.delivered%6000===0&&h.landed+h.repelled<=h.attempts);
    if(h.flight!==null){const f=h.flight;check(f.cargo===6000&&f.energy===1500&&point(f)&&destination(f.body)&&['approach','return'].includes(f.leg)&&integer(f.left,1,relayTripSeconds));
      if(f.hp!==undefined)check(bounded(f.hp,1,relayHealth(30)));}
    check(Array.isArray(h.withdrawals)&&h.withdrawals.length<=worlds.size);
    const leaving=new Set();
    for(const w of h.withdrawals){check(point(w)&&destination(w.body)&&!leaving.has(w.body)&&integer(w.cargo,0)&&bounded(w.energy,0)&&integer(w.left,1,relayTripSeconds));leaving.add(w.body);}
    check(Array.isArray(h.barges)&&h.barges.length<=worlds.size);
    const routes=new Set();
    for(const t of h.barges){check(point(t)&&destination(t.body)&&!routes.has(t.body)&&['matter','energy'].includes(t.leg)&&integer(t.left,1,relayTripSeconds)&&bounded(t.energy,0,1500)&&(t.leg==='energy'||!t.energy));routes.add(t.body);}
    if(h.raid!==null){const a=h.raid;check(record(a)&&destination(a.body)&&integer(a.ships,1,12-h.lancers)&&['approach','fire','return'].includes(a.leg)&&integer(a.left,1,18)&&integer(a.round,0,3)&&(a.mark===null||point(a.mark)));
      if(a.maxHP!==undefined||a.frontHP!==undefined)check(integer(a.maxHP,2500,7000)&&bounded(a.frontHP,0,a.maxHP)&&a.frontHP>0);}
  }
}
