import {createField,gauss,laser,analysisBase} from './fog-rules.js';
import {add} from './stock.js';

/** 教学从首波前的基地开始。威胁由矿机和设施耗电推进，塔、分析基站与战利品都使用标准模拟。 */
export function makeFogLesson(game,put,link){
  const p=game.planet;
  p.fog=createField(p,'normal',{x:3,y:8},3);p.fog.threat=99.68;
  game.techs.push('electromagnetism','basic-logistics-system','df-weapon-system','df-planetary-defense-system','df-battlefield-analysis-base-tech','environment-modification','geothermal-extraction');
  Object.assign(game.bag,{[gauss]:2,[laser]:1,[analysisBase]:1,'df-magnum-ammo-box':8,foundation:12,'geothermal-power-station':1,'thermal-power-plant':2,'tesla-tower':3,'wind-turbine':3,'sorter-1':2,'storage-1':2});
  game.mecha.x=0;game.mecha.y=-1;game.mecha.soil=2000;game.mecha.fuel.coal=24;
  for(const [x,y] of [[-3,-2],[-1,-3],[2,-3]]){const gen=put(game,'thermal-power-plant',{x,y},0);gen.input.coal=90;}
  put(game,'tesla-tower',{x:0,y:0},0);
  const ballistic=put(game,gauss,{x:-2,y:2},1);ballistic.input['df-magnum-ammo-box']=2;
  put(game,laser,{x:2,y:1},1);
  const lab=put(game,analysisBase,{x:-1,y:-1},0);add(lab.input,gauss,1);
  put(game,'storage-1',{x:-3,y:-1},0);link(game,'sorter-1',lab,{x:-3,y:-1});
  put(game,'mining-machine',{x:-3,y:2},0);
}
