import {button} from './ui-format.js';
import {count} from './stock.js';
import {researchRoute} from './research.js';

const yellow='conveyor-belt-1',green='conveyor-belt-2';
const west={x:-4,y:0},east={x:4,y:0};
/** 两个料仓各给 1,200 件。铜线两头留出断点，玩家付五节绿带后才会跨过已经运铁的黄带。 */
export function makeBridgeLesson(game,put,connect){
  game.techs.push(...researchRoute(game,'mass-construction-1'));
  game.techs.push(...researchRoute(game,'high-efficiency-logistics-system'));
  Object.assign(game.bag,{[yellow]:30,[green]:35,'sorter-3':8,'storage-1':4});
  const build=(type,x,y,dir=0)=>put(game,type,{x,y},dir);
  const arm=(a,b)=>connect(game,'sorter-3',a,b);
  build('storage-1',0,-5).output['iron-ore']=1200;build('storage-1',0,5);
  for(let y=-4;y<=4;y++)build(yellow,0,y,1);
  build('storage-1',-5,0).output['copper-ore']=1200;build('storage-1',5,0);
  for(const x of [-4,-3,3,4])build(green,x,0);
  build('wind-turbine',-3,-3);build('wind-turbine',3,3);
  build('tesla-tower',-2,2);build('tesla-tower',2,-2);
  arm({x:0,y:-5},{x:0,y:-4});arm({x:0,y:4},{x:0,y:5});
  arm({x:-5,y:0},west);arm(east,{x:5,y:0});
  game.mecha.x=-1;game.mecha.y=-1;game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length;
}
/** 教学快捷键与手动两次选点使用同一条付费施工路径。两端旧带节由报价识别并保留原货物。 */
export function connectBridge(game,lay){
  if(game.scenario!=='bridge'||game.space.current!=='home'||game.space.flight)throw new Error('请回到立体输送教学工厂');
  return lay(game,green,{x:-3,y:0},{x:3,y:0});
}
export function bridgeObjective(game){
  const tiles=game.planet.tiles;
  const iron=count(tiles['0,5']?.output||{},'iron-ore'),copper=count(tiles['5,0']?.output||{},'copper-ore');
  const built=tiles['0,0@1'];
  let text='<small>立体输送</small><strong>'+(built?'检查两条输送线':'让铜矿跨过铁矿线')+'</strong><p>北仓铁矿 '+iron+'　东仓铜矿 '+copper+'</p>';
  return text+(built?button('inspect-machine','0,0@1','检查桥面 →')+button('inspect-machine','0,0','检查桥下 →'):button('belt-bridge','','接通桥带 · 5 节绿带 →'));
}
