import {researchRoute} from './research.js';
import {coaterType,fillCoater} from './coater.js';

/** 两条线各给 120 铁矿。分别预灌两瓶同档喷剂，让两座炉在相同供电、皮带和开机时刻下比较。 */
export function makeCoatingLesson(game,put,connect){
  game.techs.push(...researchRoute(game,'proliferator-3-technology'));
  const build=(type,x,y,dir=0)=>put(game,type,{x,y},dir);
  const sorter=(x,y,a,b)=>connect(game,'sorter-3',{x,y},{x:a,y:b});
  Object.assign(game.bag,{'proliferator-3':12,'spray-coater':3,'sorter-3':15,'conveyor-belt-1':50,'arc-smelter':2});
  for(const y of [0,2]){
    build('storage-1',-5,y).output['iron-ore']=120;
    for(let x=-4;x<=0;x++)build('conveyor-belt-1',x,y);
    const sprayer=build(coaterType,-2,y);
    fillCoater(game,sprayer,'proliferator-3',2);
    const furnace=build('arc-smelter',1,y);
    furnace.recipe='iron-ingot';furnace.accelerate=y===2;
    build('storage-1',3,y);
    sorter(-5,y,-4,y);sorter(0,y,1,y);sorter(1,y,3,y);
  }
  // 同一条侧带穿过两个真实上层货位。第一台满罐后多余的瓶子才抵达第二台和尾仓。
  build('storage-1',-2,-4).output['proliferator-3']=30;
  for(const y of [-3,-2,-1,1,3])build('conveyor-belt-1',-2,y,1);
  build('storage-1',-2,4);sorter(-2,-4,-2,-3);sorter(-2,3,-2,4);
  for(const [x,y] of [[-4,-2],[0,-2],[3,-2],[-4,4],[0,4],[3,4]])build('wind-turbine',x,y);
  // 两炉满速加上喷头、分拣器的尖峰超过六台风机，补充稳定热电，免得对照实验混入欠电减速。
  build('thermal-power-plant',-1,4).input['energetic-graphite']=100;
  for(const [x,y] of [[-4,1],[0,1],[3,1]])build('tesla-tower',x,y);
  game.mecha.x=0;game.mecha.y=-1;
  game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length+2;
}
