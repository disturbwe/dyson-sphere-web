import {researchRoute} from './research.js';
import {distributorType,botType,setDistributor} from './depot.js';
import {setPersonalRule} from './distribution.js';

/** 铁块来自西仓，碎石从背包真实回收。东仓没有配送机，以展示只需一端配置机队的仓间配送。 */
export function makeDistributionLesson(game,put){
  game.techs.push(...researchRoute(game,'distribution-logistics-system'));
  game.bag={stone:64,coal:6,[botType]:4,[distributorType]:2,'storage-1':3,'tesla-tower':2};
  setPersonalRule(game,'iron-ingot',32,64);setPersonalRule(game,'stone',0,16);
  const build=(type,x,y)=>put(game,type,{x,y},0);
  const supply=build('storage-1',-4,1);
  supply.output['iron-ingot']=240;build(distributorType,-4,1);
  setDistributor(supply,'peers','supply');supply.distributor.bots=4;
  const sink=build('storage-1',4,1);build(distributorType,4,1);
  setDistributor(sink,'item','iron-ingot');setDistributor(sink,'player','off');setDistributor(sink,'peers','demand');
  const recovery=build('storage-1',0,-3);build(distributorType,0,-3);
  setDistributor(recovery,'item','stone');setDistributor(recovery,'all',true);recovery.distributor.bots=2;
  build('tesla-tower',-2,0);build('tesla-tower',2,0);
  build('thermal-power-plant',-2,4).input.coal=100;
  build('thermal-power-plant',2,4).input.coal=100;
  build('wind-turbine',-4,4);build('wind-turbine',4,4);
  game.stats.built=Object.keys(game.planet.tiles).length+3;
}
