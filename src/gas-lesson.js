import {items} from './catalog.js';
import {bodyOf} from './navigation.js';
import {makePlanet} from './world.js';
import {collector,gasProfile} from './gas.js';
import {setSlotItem,setSlotRule} from './stations.js';

/** 在母星配置实际的取货船，再把机甲放进气体巨星的同步轨道。教学气仓从空仓起步，首船货物须逐件采出。 */
export function makeGasLesson(game,put){
  const done=new Set();
  function unlock(id){
    if(done.has(id))return;
    for(const parent of items[id].technology.prerequisites||[])unlock(parent);
    done.add(id);game.techs.push(id);
  }
  for(const id of ['gas-giants-exploitation','drive-engine-2','universe-exploration-2'])unlock(id);
  const giant=bodyOf(game,'giant');
  const {gases}=gasProfile(giant);
  const tower=put(game,'interstellar-logistics-station',{x:0,y:2},0);
  gases.forEach(({item},i)=>{
    setSlotItem(game,tower,i,item);setSlotRule(game,tower,i,'remote','demand');setSlotRule(game,tower,i,'limit',750);
  });
  tower.station.vessels=2;tower.station.minVessel=10;tower.station.energy=10000;
  put(game,'wind-turbine',{x:1,y:1},0);
  game.planet.lastLanding={x:0,y:-1};game.space.parked.home=game.planet;
  game.planet=makePlanet(giant.seed,giant.biome);game.space.current='giant';
  for(const x of [-4,5,9])put(game,collector,{x,y:0},0);
  Object.assign(game.bag,{[collector]:3,hydrogen:20,'hydrogen-fuel-rod':8});
  Object.assign(game.mecha,{x:.55,y:-1.2,flying:true,fuel:{'hydrogen-fuel-rod':3}});
  game.stats.built=5;
}
