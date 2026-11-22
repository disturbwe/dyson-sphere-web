import {items} from './catalog.js';

/** 原油分流教学存档。设备只使用常规端口、筛选器和电网，玩家可拆除任一节带观察整条回路的背压。 */
export function makeRefineryLesson(game,put,connect){
  const learned=new Set();
  function learn(id){
    if(learned.has(id))return;
    for(const parent of items[id].technology.prerequisites||[])learn(parent);
    learned.add(id);
  }
  for(const id of ['energy-matrix-technology','deuterium-fractionation-technology','smelting-purification','electromagnetic-matrix-technology'])learn(id);
  game.techs=[...learned];
  Object.assign(game.bag,{'storage-tank':3,'oil-extractor':1,'oil-refinery':1,'fractionator':2,'matrix-lab':1,'tesla-tower':3,'conveyor-belt-2':80,'sorter-1':25});
  const build=(type,x,y,dir=0)=>put(game,type,{x,y},dir);
  const belt=(x,y,dir)=>build('conveyor-belt-2',x,y,dir);
  function arm(x,y,toX,toY,id){
    const sorter=connect(game,'sorter-1',{x,y},{x:toX,y:toY});
    sorter.filter=id;
  }
  build('oil-extractor',-8,-2);for(const x of [-7,-6,-5])belt(x,-2,0);
  build('oil-refinery',-4,-2).recipe='plasma-refining';arm(-5,-2,-4,-2,'crude-oil');
  // 精炼油与氢共用同一个炼厂输出，分别过滤才可保持两条输送线纯净。
  belt(-4,-1,1);build('storage-tank',-4,0);arm(-4,-2,-4,-1,'refined-oil');
  belt(-3,-2,0);belt(-2,-2,0);arm(-4,-2,-3,-2,'hydrogen');
  const hydrogen=build('storage-tank',-1,-2);hydrogen.output.hydrogen=48;
  belt(-1,-1,1);belt(-1,0,1);build('fractionator',-1,1,2);
  // 回流带回到同一只氢罐，前口产出的重氢独立入罐，现场可看到两种流体分开累计。
  for(const [x,y,dir] of [[-1,2,1],[-1,3,0],[0,3,0],[1,3,3],[1,2,3],[1,1,3],[1,0,3],[1,-1,3],[1,-2,2],[0,-2,2]])belt(x,y,dir);
  belt(-2,1,2);build('storage-tank',-3,1);
  build('mining-machine',3,-4,2);belt(2,-4,2);
  build('arc-smelter',1,-4).recipe='energetic-graphite';arm(2,-4,1,-4,'coal');
  build('matrix-lab',-1,-4).recipe='energy-matrix';arm(1,-4,-1,-4,'energetic-graphite');arm(-1,-1,-1,-4,'hydrogen');
  build('storage-1',-3,-4);arm(-1,-4,-3,-4,'energy-matrix');
  // 风力可独立冷启动矿机和分拣器，产线从同一条煤带给火电与石墨炉供料。
  for(const y of [-3,-6]){build('thermal-power-plant',2,y);arm(2,-4,2,y,'coal');}
  for(const x of [-6,-3,0])for(const y of [4,6])build('wind-turbine',x,y);
  for(const [x,y] of [[-6,0],[-2,0],[2,-1]])build('tesla-tower',x,y);
  game.mecha.x=-2;game.mecha.y=-3;
  game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length;
}
