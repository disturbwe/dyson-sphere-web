import {researchRoute,topicVisible} from './research.js';
import {releaseSails} from './sphere.js';
import {button} from './ui-format.js';

const topic='df-dark-fog-lens-tech';
const matrix='df-dark-fog-matrix';
const lens='df-dark-fog-lens';

/** 复用标准的包内发现、科研与接收站。样本封存在回收仓，取回前不会提前触发隐藏课题。 */
export function makeRelicLesson(game,put) {
  game.techs.push(...researchRoute(game,'planetary-ionosphere-utilization'));
  const locker=put(game,'storage-1',{x:0,y:1},0);
  locker.output[matrix]=1012;
  game.bag['graviton-lens']=1;
  for(const x of [-3,3]){
    const station=put(game,'ray-receiver',{x,y:2},0);
    station.continuous=1;
    if(x<0)station.input['graviton-lens']=3;
  }
  // 发电对照需要充足的恒星预算，实际帆仍有寿命和射线传输损耗。
  const sails=10000;
  releaseSails(game,game.dyson.orbits[0],sails);
  game.dyson.launchedSails+=sails;
  put(game,'tesla-tower',{x:0,y:3},0);
  game.stats.built=Object.keys(game.planet.tiles).length;
}

export function relicObjective(game) {
  const header='<small>黑雾样本与透镜</small>';
  const receiver=game.planet.tiles['3,2'];
  if(!topicVisible(game,topic))return header+'<strong>从回收仓取回黑雾矩阵</strong><p>仓内有 1,012 枚矩阵。取回后在科技页查找黑雾透镜。</p>'+button('inspect-machine','0,1','打开样本仓 →');
  if(!game.techs.includes(topic))return header+'<strong>手动研究黑雾透镜</strong><p>耗用 1,000 枚黑雾矩阵。由机甲上传 30,000 哈希。</p>'+button('focus-tech',topic,'查看已发现课题 →');
  if(receiver?.lensType===lens&&receiver.lensTime>0){
    const output=x=>((game.planet.tiles[x+',2']?.received||0)/1000).toFixed(1);
    return header+'<strong>比较两台接收站的输出</strong><p>引力透镜 '+output(-3)+' MW　黑雾透镜 '+output(3)+' MW</p>'+button('inspect-machine','3,2','查看东侧接收站 →');
  }
  if(game.bag[lens])return header+'<strong>向东侧接收站装填黑雾透镜</strong>'+button('inspect-machine','3,2','打开东侧接收站 →');
  return header+'<strong>用剩余 12 枚矩阵制作透镜</strong><p>复制器消耗 1 枚引力透镜与 12 枚黑雾矩阵。</p>'+button('open-recipe',lens,'打开复制器 →');
}
