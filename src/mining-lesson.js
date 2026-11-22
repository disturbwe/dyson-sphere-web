import {largeMiner} from './advanced-miner.js';
import {researchRoute} from './research.js';
import {setSlotItem,setSlotRule} from './stations.js';
import {count} from './stock.js';
import {button} from './ui-format.js';

const ore='iron-ore';
/** 交接矿场从空矿仓、空皮带和空需求仓开始。核电只预装有限燃料，矿石随实际开采进入冶炼线或无人机货单。 */
export function makeMiningLesson(game,put,link){
  for(const id of ['photon-spotlight-mining-technology','mini-fusion-power-generation','logistics-station-integrated-logistics-1','mass-construction-1'])game.techs.push(...researchRoute(game,id));
  const build=(type,x,y,dir=0)=>put(game,type,{x,y},dir);
  build(largeMiner,-2,2);
  const depot=build('planetary-logistics-station',5,2);
  setSlotItem(game,depot,0,ore);setSlotRule(game,depot,0,'local','demand');
  depot.station.energy=150;depot.station.drones=6;depot.station.minDrone=100;
  for(const x of [-1,0,1])build('conveyor-belt-2',x,2);
  const furnace=build('arc-smelter',2,2);furnace.recipe='iron-ingot';
  build('storage-1',2,0);
  game.bag['sorter-2']=2;link(game,'sorter-2',{x:1,y:2},{x:2,y:2});link(game,'sorter-2',{x:2,y:2},{x:2,y:0});
  for(const x of [-2,2])build('mini-fusion-power-plant',x,-3).input['deuteron-fuel-rod']=40;
  build('tesla-tower',0,-1);build('tesla-tower',5,-1);
  Object.assign(game.bag,{[largeMiner]:1,'conveyor-belt-2':48,'tesla-tower':3,'mining-machine':1,'deuteron-fuel-rod':20});
  game.mecha.x=0;game.mecha.y=-1;
  game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length;
}
export function miningObjective(game){
  const delivered=count(game.freight.delivered,ore),plates=count(game.planet.tiles['2,0']?.output||{},'iron-ingot');
  return '<small>大型采矿机与本地提货</small><strong>调速并向需求塔供矿</strong><p>运输机已交付 '+delivered.toLocaleString()+' 铁矿，带线已冶炼 '+plates.toLocaleString()+' 铁块。</p>'+button('inspect-machine','-2,2','调整采矿机 →')+button('inspect-machine','5,2','检查需求塔 →');
}
