import {flow,recordFlow} from './production-log.js';
import {capabilitiesOf} from './upgrades.js';
import {gradeOf,speedRate} from './proliferation.js';
import {items} from './catalog.js';
import {count, add, total} from './actions.js';
import {sphereTotals,orbitById,firingPitch,rocketTarget,sendRocket,receiverVisible,releaseSails} from './sphere.js';

/** 发射准备情况也是电网负载依据。无目标时保留已充能进度，重新开窗后才能扣除库存。 */
export function launcherReady(game,tile,sphere,sky) {
  if (tile.type==='vertical-launching-silo') {
    if (!count(tile.input,'small-carrier-rocket')) return '等待小型运载火箭';
    if (!rocketTarget(sphere)) return '等待结构点订单';
    return '';
  }
  if (!count(tile.input,'solar-sail')) return '等待太阳帆';
  const orbit=orbitById(sphere,tile.orbit);
  if (!orbit) return '未选择轨道';
  tile.pitch=firingPitch(tile,sky,orbit);
  return tile.pitch>=5 && tile.pitch<=60 ? '' : '俯仰角受限';
}
export function runLauncher(game,tile,dt,sphere,sky,planet=game.planet) {
  const wait=launcherReady(game,tile,sphere,sky);
  if(wait || !tile.power) {tile.status=wait||'未供电';return;}
  const isSilo=tile.type==='vertical-launching-silo';
  tile.status='充能发射';tile.progress+=dt*tile.power*speedRate[gradeOf(tile.input,isSilo?'small-carrier-rocket':'solar-sail')]/(isSilo?12:3);
  if(tile.progress+1e-9<1) return;
  tile.progress=Math.max(0,tile.progress-1);
  recordFlow(planet,game.elapsed,isSilo?'small-carrier-rocket':'solar-sail',flow.used);
  if(isSilo) {
    const order=rocketTarget(sphere);
    add(tile.input,'small-carrier-rocket',-1);sendRocket(game,order,sphere);
  } else {
    add(tile.input,'solar-sail',-1);releaseSails(game,orbitById(sphere,tile.orbit),1,sphere);sphere.launchedSails++;
  }
}
function receivingEfficiency(game,continuous) {
  const levels=capabilitiesOf(game).rayEfficiencyLevel;
  const loss=.7*Math.pow(.9,Math.min(6,levels))*Math.pow(.85,Math.max(0,levels-6));
  return 1-loss*(1-.4*continuous);
}
/** 接收站共享恒星功率。先算所有站的请求再按比例供给，多座站不能各拿一份完整的戴森球发电。 */
export function shareRays(game,groups,dt,sphere=game.dyson) {
  sphere.receivedKW=0;
  if (!groups.length) return;
  const available=sphereTotals(sphere).power;
  // 星云可长期累积许多发射批次，用线性归约求外缘可避免大存档超出函数参数上限。
  const radius=Math.max(sphereTotals(sphere).outerRadius,0);
  let requested=0;const requests=[];
  for (const {sky,receivers,planet=game.planet} of groups) for (const tile of receivers) {
    tile.received=0;
    if(tile.lensTime<=0 && game.techs.includes('planetary-ionosphere-utilization')) {
      // 当前透镜到期后才换件。混合供料时先用黑雾透镜，与四倍请求一起保存实际消耗的那一件。
      const lens=count(tile.input,'df-dark-fog-lens')?'df-dark-fog-lens':'graviton-lens';
      if(count(tile.input,lens)){
        recordFlow(planet,game.elapsed,lens,flow.used);tile.lensType=lens;tile.lensInc=add(tile.input,lens,-1);tile.lensTime=600;
      }
    }
    const lensed=tile.lensTime>0, visible=available>0&&receiverVisible(tile,sky,radius,lensed);
    tile.continuous=Math.max(0,Math.min(1,tile.continuous+dt*(visible?1/1200:-1/300)));
    const photon=tile.mode==='photon';
    if(!visible || (photon&&total(tile.output)>=50)) {tile.status=visible?'输出堆积':'等待射线';continue;}
    // 原型的 Ability 分别为 200、400。带喷点的透镜继续用该件的加速倍率，旧档中的工作透镜按引力透镜处理。
    const lensFactor=tile.lensType==='df-dark-fog-lens'?4:2;
    const gain=lensed?lensFactor*speedRate[tile.lensInc||0]:1;
    const limit=(6000+9000*tile.continuous)*gain*(photon?8:1), efficiency=receivingEfficiency(game,tile.continuous);
    requests.push({tile,photon,limit,efficiency,planet});requested+=limit/efficiency;
  }
  if(!requested) return;
  sphere.receivedKW=Math.min(available,requested);
  const share=sphere.receivedKW/requested;
  for(const {tile,photon,limit,planet} of requests) {
    tile.received=limit*share;tile.lensTime=Math.max(0,tile.lensTime-dt);tile.status=photon?'凝聚光子':'接收射线';
    if(!photon) continue;
    // 临界光子需 1.2 GJ。按实际接收的 kW 积分，缺发电时产率自然下降。
    tile.progress+=tile.received*dt/1200000;
    if(tile.progress>=1) {tile.progress--;add(tile.output,'critical-photon',1);add(game.stats.made,'critical-photon',1);recordFlow(planet,game.elapsed,'critical-photon',flow.made);}
  }
}
