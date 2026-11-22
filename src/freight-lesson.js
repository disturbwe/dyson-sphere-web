import {bodyOf} from './navigation.js';
import {makePlanet} from './world.js';
import {items,stations} from './catalog.js';
import {setSlotItem,setSlotRule,setPort} from './stations.js';

/** 独立教学存档。两颗行星经正常仓位、矿机、皮带和飞船调度供钛；初始库存耗尽后只能依赖实物采矿。 */
export function makeFreightLesson(game,put,linkSorter){
  const unlock=id=>{if(game.techs.includes(id)||!items[id]?.technology)return;for(const p of items[id].technology.prerequisites||[])unlock(p);game.techs.push(id);};
  for(const id of ['interstellar-logistics-system','drive-engine-2','universe-exploration-2','automatic-metallurgy'])unlock(id);
  Object.assign(game.bag,{'interstellar-logistics-station':2,'planetary-logistics-station':2,'logistics-drone':12,'logistics-vessel':4,'conveyor-belt-1':100,'sorter-1':9,'wind-turbine':6,'tesla-tower':8,'mining-machine':3,'storage-1':4});
  const item='titanium-ore',ils=stations[1],pls=stations[0];
  const putTower=(context,type,x,y,local,remote,limit)=>{
    const t=put(context,type,{x,y},0);setSlotItem(game,t,0,item);
    setSlotRule(game,t,0,'local',local);if(type===ils)setSlotRule(game,t,0,'remote',remote);
    setSlotRule(game,t,0,'limit',limit);t.station.energy=type===ils?9000:135;
    return t;
  };
  const hub=putTower(game,ils,-3,3,'supply','demand',800);
  hub.station.vessels=2;
  const depot=putTower(game,pls,2,-1,'demand','storage',200);
  depot.station.drones=6;setPort(depot,0,item);
  for(const x of [3,4,5])put(game,'conveyor-belt-1',{x,y:-1},0);
  put(game,'storage-1',{x:5,y:1},0);linkSorter(game,'sorter-1',{x:5,y:-1},{x:5,y:1});
  for(const [x,y] of [[-4,1],[-1,4],[1,3],[4,2]])put(game,'wind-turbine',{x,y},0);
  put(game,'tesla-tower',{x:0,y:1},0);
  const body=bodyOf(game,'inner'),planet=makePlanet(body.seed,body.biome);
  game.space.parked.inner=planet;const remoteContext={...game,planet};
  const mine=put(remoteContext,'mining-machine',{x:-3,y:-4},0);
  put(remoteContext,'conveyor-belt-1',{x:-2,y:-4},0);
  const supplier=putTower(remoteContext,ils,-1,-4,'storage','supply',1000);
  supplier.output[item]=480;
  put(remoteContext,'tesla-tower',{x:-2,y:-3},0);
  for(const [x,y] of [[-3,-2],[-1,-2],[1,-3],[0,-5]])put(remoteContext,'wind-turbine',{x,y},0);
  // 示例的矿区和普通着陆共用种子生成器，矿机要覆盖真实钛脉才能持续生产。
  if(!mine.veins.length)throw new Error('示例矿机未覆盖矿区');
  game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length+Object.keys(planet.tiles).length;
}
