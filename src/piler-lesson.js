import {researchRoute} from './research.js';
import {configureMonitor,monitorType} from './traffic.js';
import {beaconType,updateBeacon} from './beacons.js';
import {pilerType} from './piler.js';

/** 两只储液罐共用一批水。三只测点依次读单件、二层与四层，末台高口进料演示拆垛。 */
export function makePilerLesson(game,put){
  game.techs.push(...researchRoute(game,'integrated-logistics-system'));
  const build=(type,x,y,dir=0)=>put(game,type,{x,y},dir);
  build('storage-tank',-5,1).output.water=3600;
  for(const x of [-4,-3,-1,0,2,3,5,6]){
    // 高速上料段提供连续的单件货；中段两条低速带以二层、四层货垛传递同一流量。
    const tier=x< -2?3:x>4?2:1;
    build('conveyor-belt-'+tier,x,1);
  }
  for(const x of [-2,1,4])build(pilerType,x,1,x===4?2:0);
  build('storage-tank',7,1);
  for(const x of [-3,0,2]){
    const {monitor}=build(monitorType,x,1);
    configureMonitor(monitor,'filter','water');
  }
  // 将末端测点绑定给独立的用电信标，改变工厂吞吐就会在地表与星图同时改变颜色。
  game.techs.push(...researchRoute(game,'holo-beacon-tech'));
  const mark=build(beaconType,-1,0);
  updateBeacon(game.planet,mark,{title:'四层集装出口',scope:'cluster',icon:'water',meter:'2,1',tag:'供水,集装',body:'[ ] 校验出口流量 720 件/分'});
  game.bag[beaconType]=2;
  for(const x of [-4,-1,1,5])build('wind-turbine',x,4);
  for(const x of [-2,3])build('tesla-tower',x,3);
  Object.assign(game.bag,{[pilerType]:3,[monitorType]:3,'conveyor-belt-1':40,'conveyor-belt-2':40,'storage-tank':2});
  game.mecha.x=0;game.mecha.y=-1;
  game.stats.built=Object.keys(game.planet.tiles).length+3;
}
