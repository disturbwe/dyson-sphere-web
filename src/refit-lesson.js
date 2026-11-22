import {researchRoute} from './research.js';
import {configureMonitor,monitorRate} from './traffic.js';
import {button} from './ui-format.js';
import {applyGround} from './reform.js';

const iron='iron-ingot';
const intake='-4,1',meter='-1,1',shop='2,-1';

/** 用有限铁块给同一条带线试车。尾仓优先给齿轮台送料，其余铁块经独立蓝带返回起点，便于连续比较各档流量。 */
export function makeRefitLesson(game,put,connect){
  for(const id of ['high-speed-assembling-processes','pile-sorter-6','environment-modification'])game.techs.push(...researchRoute(game,id));
  const build=(type,x,y,dir=0)=>put(game,type,{x,y},dir);
  const arm=(type,x,y,a,b)=>connect(game,type,{x,y},{x:a,y:b});
  Object.assign(game.bag,{'sorter-1':1,'sorter-2':2,'sorter-4':4,'conveyor-belt-3':5,'assembling-machine-2':1});
  // 整块地坪与两行通道走玩家的地基结算，支架和货垛在同一标高，种子变化也能正确填埋矿点。
  game.bag.foundation=49;game.mecha.soil=100000;
  applyGround(game,{x:-1,y:1},7,2,true);
  for(let x=-4;x<=2;x++)for(const y of [0,2])applyGround(game,{x,y},1,1,true);
  build('storage-2',-4,1).output[iron]=5400;
  build('storage-1',2,1);
  for(let x=-3;x<=1;x++)build('conveyor-belt-1',x,1);
  const sensor=build('traffic-monitor',-1,1).monitor;
  configureMonitor(sensor,'filter',iron);configureMonitor(sensor,'target',7200);
  build('assembling-machine-1',2,-1).recipe='gear';
  build('storage-2',0,-1);
  for(let x=2;x>=-4;x--)build('conveyor-belt-3',x,3,2);
  const feeder=arm('sorter-1',-4,1,-3,1);feeder.filter=iron;
  arm('sorter-4',1,1,2,1);
  arm('sorter-2',2,1,2,-1).filter=iron;
  arm('sorter-2',2,-1,0,-1).filter='gear';
  arm('sorter-4',2,1,2,3).filter=iron;
  arm('sorter-4',-4,3,-4,1).filter=iron;
  // 让制造台始终有稳定供电，读数变化只来自传送带、分拣器和制造台的型号。
  for(const [x,y] of [[-4,-3],[-2,4],[0,5],[2,4],[4,2]])build('wind-turbine',x,y);
  build('tesla-tower',0,0);build('tesla-tower',-2,2);
  game.mecha.x=-.5;game.mecha.y=-2;
  game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length+1;
}

/** 从带上最近完整采样窗及产线真实累计量生成目标。玩家可以按任意顺序检查或改造三个瓶颈。 */
export function refitObjective(game){
  const monitor=game.planet.tiles[meter]?.monitor;
  const rate=monitor&&monitor.samples===monitor.buckets.length?monitorRate(monitor).toLocaleString()+' 件/分':'采样中';
  return '<small>产线原位换装</small><strong>铁块 '+rate+'</strong><p>更换供料臂、五节主带和齿轮制造台。已制成 '+(game.stats.made.gear||0).toLocaleString()+' 个齿轮。</p>'+
    button('inspect-machine',intake,'供料分拣器')+button('inspect-machine',meter,'带线与流量')+button('inspect-machine',shop,'齿轮制造台');
}
