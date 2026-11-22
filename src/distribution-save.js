import {isDepot,deliveryItem,distributorConfig,distributorType} from './depot.js';
import {icarusPort,validLimits} from './distribution.js';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonnegative=v=>Number.isSafeInteger(v)&&v>=0;
function check(condition){if(!condition)throw new Error('配送器存档中的仓位、机体或在途货单无效');}
export function validatePersonal(plan){
  if(plan===undefined)return;
  check(record(plan)&&typeof plan.enabled==='boolean'&&record(plan.rules));
  for(const [item,r] of Object.entries(plan.rules))check(deliveryItem(item)&&record(r)&&validLimits(r.low,r.high));
}
/** 旧档未开启配送时没有航单。导入时从在途记录核对归属与机体总数，防止重复领取航班或突破机库上限。 */
export function validateDistribution(planet,maxLayers){
  for(const tile of Object.values(planet.tiles)){
    check(tile.type!==distributorType);
    if(isDepot(tile.type))check(tile.layers===undefined||Number.isInteger(tile.layers)&&tile.layers>=1&&tile.layers<=maxLayers);
    if(tile.distributor===undefined)continue;
    const dock=tile.distributor;
    check(isDepot(tile.type)&&record(dock));distributorConfig(dock);
    check(nonnegative(dock.bots)&&dock.bots<=10&&Number.isFinite(dock.energy)&&dock.energy>=0&&dock.energy<=27&&record(dock.overflow));
    check(dock.nextPeer===undefined||nonnegative(dock.nextPeer));
    for(const [id,n] of Object.entries(dock.overflow))check(deliveryItem(id)&&nonnegative(n));
  }
  const service=planet.distribution;
  if(service===undefined)return;
  check(record(service)&&['serial','cursor','toPlayer','fromPlayer','between'].every(k=>nonnegative(service[k])));
  check(Number.isFinite(service.clock)&&service.clock>=0&&service.clock<=.400001&&Array.isArray(service.trips));
  const seen=new Set(),away=new Map();
  for(const t of service.trips){
    check(record(t)&&nonnegative(t.id)&&t.id>0&&t.id<=service.serial&&!seen.has(t.id));seen.add(t.id);
    check(planet.tiles[t.home]?.distributor&&t.home!==t.peer&&(t.peer===icarusPort||planet.tiles[t.peer]?.distributor));
    check(typeof t.pick==='boolean'&&typeof t.back==='boolean'&&deliveryItem(t.item)&&nonnegative(t.amount)&&t.amount>0&&t.amount<=20);
    check(t.inc===undefined||nonnegative(t.inc)&&t.inc<=4*t.load);
    check(nonnegative(t.load)&&t.load<=t.amount&&(t.back||t.load===(t.pick?0:t.amount)));
    check([t.ax,t.bx].every(x=>Number.isFinite(x)&&Math.abs(x)<=90)&&[t.ay,t.by].every(y=>Number.isFinite(y)&&Math.abs(y)<=45));
    check(Number.isFinite(t.leg)&&t.leg>0&&Number.isFinite(t.remaining)&&t.remaining>0&&t.remaining<=t.leg);
    const n=(away.get(t.home)||0)+1;check(n<=planet.tiles[t.home].distributor.bots);away.set(t.home,n);
  }
}
