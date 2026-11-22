import {recipes, research} from './catalog.js';
import {researchRoute, startResearch, hashWork} from './research.js';
import {seedOrbitalYard} from './orbital-yard.js';

/** 接管末批矩阵生产。教学档继承前 3996 份研究，余款须从接收站起实际生产，标准着陆共用同一套配方与结算。 */
export function makeMissionLesson(game, put, connect) {
  const mission = 'mission-completed';
  for (const goal of ['universe-matrix-technology','miniature-particle-collider-technology','basic-logistics-system']) {
    game.techs.push(...researchRoute(game, goal));
  }
  game.bag = {'sorter-3':20, 'matrix-lab':2, 'graviton-lens':8, 'conveyor-belt-3':40};
  game.mecha.x = 0;
  game.mecha.y = -2;
  seedOrbitalYard(game);
  const build = (id,x,y,dir=0) => put(game,id,{x,y},dir);
  const arm = (x,y,tx,ty,item) => {
    const link = connect(game,'sorter-3',{x,y},{x:tx,y:ty});
    link.filter = item;
  };
  // 两座接收站争用同一颗恒星的功率。一座持续供电，另一座要由玩家从发电切到光子模式。
  for (const [x,y] of [[-5,1],[-3,3]]) {
    const receiver = build('ray-receiver',x,y);
    receiver.continuous = 1;
    receiver.input['graviton-lens'] = 4;
  }
  const collider = build('miniature-particle-collider',-2,1);
  collider.recipe = 'mass-energy-storage';
  arm(-5,1,-2,1,'critical-photon');
  const byproduct = build('storage-1',-2,-1);
  arm(-2,1,byproduct.x,byproduct.y,'hydrogen');
  const makeWhite = build('matrix-lab',1,1);
  makeWhite.recipe = 'universe-matrix';
  arm(-2,1,1,1,'antimatter');
  // 五色矩阵由交接料仓按生产配方补给。将五种货物放在同一仓内，分拣器按目标缓存余量依次补料。
  const feed = build('storage-2',1,4);
  for (const item of Object.keys(recipes['universe-matrix'].in)) {
    if (item !== 'antimatter') feed.output[item] = 12;
  }
  arm(1,4,1,1,null);
  build('conveyor-belt-3',2,1,0);
  build('conveyor-belt-3',3,1,0);
  build('matrix-lab',5,1).recipe = 'research';
  arm(1,1,2,1,'universe-matrix');
  arm(3,1,5,1,'universe-matrix');
  build('tesla-tower',2,0);
  build('tesla-tower',-1,2);
  game.stats.built = Object.keys(game.planet.tiles).length + game.planet.links.length;
  game.science.manual = false;
  startResearch(game,mission);
  const spec = research[mission], handover = spec.cost['universe-matrix'] - 4;
  hashWork(game, {'universe-matrix':handover}, spec.hashes * handover / spec.cost['universe-matrix']);
}
