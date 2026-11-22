import {cancelResearch,hashWork,researchRoute,startResearch} from './research.js';
import {studyDone,studySpec} from './research-levels.js';
import {capabilitiesOf} from './upgrades.js';
import {button} from './ui-format.js';

const sixth='veins-utilization-6';
const seventh=sixth+'@7';
const white='universe-matrix';

/** 矿区交接档从七级的末批开始。已付的 7,996 枚和余下四枚分别存在课题、实验室，继续和暂停走普通研究流程。 */
export function makeVeinsLesson(game,put,connect) {
  game.techs.push(...researchRoute(game,sixth));
  game.science.manual=false;
  startResearch(game,seventh);
  const spec=studySpec(seventh),settled=spec.cost[white]-4;
  hashWork(game,{[white]:settled},spec.hashes*settled/spec.cost[white]);
  cancelResearch(game,seventh);
  const build=(type,x,y)=>put(game,type,{x,y},0);
  const lab=build('matrix-lab',1,0);
  lab.recipe='research';lab.input[white]=4;
  build('mining-machine',-3,2);
  for(let x=-2;x<=1;x++)build('conveyor-belt-2',x,2);
  build('storage-1',3,2);
  // 交接时这台分拣器从建设库存安装，安装后随矿区保存。
  game.bag['sorter-3']=1;
  connect(game,'sorter-3',{x:1,y:2},{x:3,y:2});
  build('tesla-tower',0,1);
  for(const [x,y] of [[-3,-2],[-2,5],[2,5],[3,-2]])build('wind-turbine',x,y);
  game.stats.built=Object.keys(game.planet.tiles).length+game.planet.links.length;
}

export function veinsObjective(game) {
  const head='<small>矿物利用与连续研究</small>';
  if(!studyDone(game,seventh)) {
    const job=game.research?.id===seventh?game.research:game.science.suspended[seventh];
    const remaining=studySpec(seventh).cost[white]-(job?.paid[white]||0);
    return head+'<strong>完成矿物利用七级</strong><p>六级矿机正在运行。交接课题尚需 '+remaining+' 枚宇宙矩阵，研究站可直接上传。</p>'+button('focus-tech',seventh,'查看七级研究 →');
  }
  const cap=capabilitiesOf(game);
  return head+'<strong>检查铁矿区的采矿效率</strong><p>额定速度 '+Math.round(cap.miningRate*100)+'%　矿脉消耗 '+(cap.orePerItem*100).toFixed(2)+'%</p>'+button('inspect-machine','-3,2','查看同一台采矿机 →');
}
