import {bodyOf,starOf} from './cluster.js';
import {elevation,key,makePlanet} from './world.js';
import {newSphere} from './sphere.js';
import {applyGround,settled} from './reform.js';
import {researchRoute} from './research.js';
import {button} from './ui-format.js';

export const acidBody='s1:frontier', oceanBody='s2:frontier';
export const stone='spiniform-stalagmite-crystal';
const surveys=new WeakMap();

/** 为火山灰岸线选择真实取液口。优先离出发点近、东侧有陆地的浅湾；缓存只与行星地貌种子相关。 */
function acidShore(planet){
  let best=null,bestScore=Infinity;
  for(let y=-36;y<=36;y++)for(let x=-80;x<=80;x++){
    const distance=Math.hypot(x,y);
    if(distance*.041>bestScore)continue;
    const level=elevation(x,y,planet.seed,planet.biome);
    if(level>-.09)continue;
    const bank=elevation(x+3,y+2,planet.seed,planet.biome);
    const score=Math.abs(level+.34)+Math.max(0,.35-bank)*2+distance*.041;
    if(score<bestScore){bestScore=score;best={x:x-1,y};}
  }
  if(!best)throw new Error('当前种子没有可用的硫酸岸线');
  return best;
}
/** 测点只取初始地质和矿物身份。读档或矿脉耗尽时仍指向当时建造的设施。 */
export function geologySite(planet){
  if(surveys.has(planet))return surveys.get(planet);
  let center;
  if(planet.biome==='sulfuria')center=acidShore(planet);
  else if(planet.biome==='aquatica'){
    // 以地形判断天然埋深，读档时用户可能已经铺好地基、露出全部矿脉。
    const deposits=planet.veins.filter(v=>v.item===stone&&elevation(v.x,v.y,planet.seed,planet.biome)<.08);
    const near=deposits.reduce((best,v)=>!best||Math.hypot(v.x+4,v.y-2)<Math.hypot(best.x+4,best.y-2)?v:best,null);
    if(!near)throw new Error('当前水世界没有可观测的海床石笋');
    center={x:Math.round(near.x),y:Math.round(near.y)};
  }else throw new Error('测站只设在硫酸海和水世界');
  const at=(dx,dy)=>({x:center.x+dx,y:center.y+dy});
  const site={center,intake:at(1,0),belt:at(3,0),processor:at(3,2),depot:at(5,2),landing:at(2,-1)};
  surveys.set(planet,site);return site;
}

/** 建立两个已勘测的异星营地，生产从空产物仓开始。仅教学交接提供钢钛原料、建设库存和远航燃料。 */
export function makeGeologyLesson(game,put,connect){
  for(const id of ['drive-engine-4','mecha-core-6','universe-exploration-4','environment-modification','high-strength-material','high-strength-titanium-alloy'])game.techs.push(...researchRoute(game,id));
  Object.assign(game.bag,{foundation:180,'mining-machine':2,'space-warper':12,'sorter-3':4});
  // 两段跨恒星往返按每光年 240 MJ 消耗核心储能，六级核心让交接档能实际飞完两段。
  Object.assign(game.mecha,{soil:600000,energy:5600,fuel:{'deuteron-fuel-rod':12}});
  game.space.parked.home=game.planet;
  game.space.spheres.s0=game.dyson;
  for(const id of [oceanBody,acidBody]){
    const body=bodyOf(game,id),planet=makePlanet(body.seed,body.biome);
    game.planet=planet;game.space.current=id;
    const acid=id===acidBody,site=geologySite(planet),{x,y}=site.center;
    Object.assign(game.mecha,site.landing);planet.lastLanding={...site.landing};
    // 工业地坪沿露矿区外侧布置。教学开始后 3×3 海床仍由玩家投料并决定露出或掩埋。
    const build=(type,at,pad=false)=>{
      if(pad)applyGround(game,at,1,1,false);
      return put(game,type,at,0);
    };
    if(acid)build('water-pump',site.intake);
    build('conveyor-belt-2',{x:x+2,y});build('conveyor-belt-2',site.belt);
    const processor=build(acid?'arc-smelter':'chemical-plant',site.processor,true);
    processor.recipe=acid?'titanium-alloy':'carbon-nanotube-advanced';
    if(acid)Object.assign(processor.input,{steel:64,'titanium-ingot':64});
    build('storage-1',site.depot,true);
    build('tesla-tower',{x:x+3,y:y-1},true);
    for(const [dx,dy] of [[3,-3],[5,-3],[7,-3],[6,0],[7,2]])build('wind-turbine',{x:x+dx,y:y+dy});
    connect(game,'sorter-3',site.belt,site.processor);connect(game,'sorter-3',site.processor,site.depot);
    game.dyson=Object.assign(newSphere(),{luminosity:starOf(game,body.star).luminosity});
    if(!acid){game.space.parked[id]=planet;game.space.spheres[body.star]=game.dyson;}
  }
  game.stats.built=Object.keys(game.planet.tiles).length+Object.keys(game.space.parked[oceanBody].tiles).length+4;
}

/** 从实际物料和占位选择教学操作，玩家可先航行、拆建或返回已生产的基地。 */
export function geologyObjective(game){
  if(game.space.flight)return '';
  const id=game.space.current;
  if(id!==acidBody&&id!==oceanBody)return '';
  const p=game.planet,site=geologySite(p),made=game.stats.made;
  const head='<small>异星地质勘查</small>';
  const inspect=(at,text)=>p.tiles[key(at.x,at.y)]?button('inspect-machine',key(at.x,at.y),text):'';
  if(id===acidBody)return head+'<strong>硫酸海岸 · 钛合金</strong><p>累计泵采硫酸 '+(made['sulfuric-acid']||0)+'，冶炼钛合金 '+(made['titanium-alloy']||0)+'。</p>'+inspect(site.intake,'检查取液口 →')+button('warp-depart',oceanBody,'前往水世界 · 1 枚翘曲器');
  if(!settled(p,site.intake.x,site.intake.y))return head+'<strong>勘测海床石笋</strong><p>定位 3 × 3 矿区，铺设地基并选择露出矿脉。</p>'+button('geology-bed','','定位海床矿区 →');
  if(!p.tiles[key(site.intake.x,site.intake.y)])return head+'<strong>将矿机接入化工线</strong><p>出矿口朝东，对接通往化工厂的传送带。</p>'+button('geology-miner','','安装采矿机 →')+button('geology-bed','','检查海床');
  return head+'<strong>石笋制碳纳米管</strong><p>每批消耗 6 份刺笋结晶，产出 2 份碳纳米管。累计产出 '+(made['carbon-nanotube']||0)+'。</p>'+inspect(site.depot,'查看产物仓储 →')+button('warp-depart',acidBody,'返回硫酸海岸');
}
