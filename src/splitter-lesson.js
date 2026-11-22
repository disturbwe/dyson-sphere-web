import {items} from './catalog.js';
import {setPriority,setOutputFilter} from './splitter.js';

/** 两个矿机共享一条主带。第二台分流器只允许铁矿石从西口出去，多余的铁进顶仓，铜由东线送仓。 */
export function makeSplitterLesson(game,put,connect){
  const learned=new Set();
  function learn(id){
    if(learned.has(id))return;
    for(const parent of items[id].technology.prerequisites||[])learn(parent);
    learned.add(id);
  }
  for(const id of ['improved-logistics-system','mass-construction-1'])learn(id);
  game.techs=[...learned];
  Object.assign(game.bag,{splitter:3,'storage-1':4,'conveyor-belt-1':40,'conveyor-belt-2':35,'sorter-1':12,'sorter-2':10});
  const build=(type,x,y,dir=0)=>put(game,type,{x,y},dir);
  const belt=(x,y,dir)=>build('conveyor-belt-1',x,y,dir);
  build('mining-machine',-3,2);build('mining-machine',3,2,2);
  for(const x of [-2,-1])belt(x,2,0);
  for(const x of [2,1])belt(x,2,2);
  build('splitter',0,2);
  for(const y of [1,0])belt(0,y,3);
  const separator=build('splitter',0,-1);
  for(const side of [-1,1]){
    const direction=side===1?0:2;
    belt(side,-1,direction);belt(side*2,-1,direction);
    build('storage-1',side*2,-2);
    connect(game,'sorter-2',{x:side*2,y:-1},{x:side*2,y:-2});
  }
  // 教学档只预置建筑与端口配置，两只仓库和顶仓从空库存开始。
  setPriority(game.planet,separator,2);setOutputFilter(separator,'iron-ore');separator.split.depot=true;
  for(const [x,y] of [[-2,4],[2,4],[0,5],[-4,0]])build('wind-turbine',x,y);
  build('tesla-tower',0,3);build('tesla-tower',-1,-2);
  game.mecha.x=0;game.mecha.y=-3;
  game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length+1;
}
