import {research} from './catalog.js';
import {sphereTotals} from './sphere.js';

export const finalTopic = 'mission-completed';
export const scenarios = {landing:'标准着陆', defense:'黑雾地面防守', shield:'行星护盾与中继', signal:'信号前哨与轨道拦截', mining:'大型采矿机与本地提货', relic:'黑雾样本与透镜', veins:'矿物利用与连续研究', geology:'异星地质勘查', sandbox:'恒星工程沙盒', foundry:'自动冶炼线', refit:'产线原位换装', coast:'海岸整地与填海', sorting:'双矿分流与筛选', bridge:'立体交叉输送', piling:'集装与流速监测', coating:'喷涂与冶炼对照', distribution:'仓储与机甲配送', blueprint:'蓝图与建设机', refinery:'原油精炼与分馏', freight:'跨星球物流线', energy:'跨星球输电', gas:'巨星轨道采集', mission:'宇宙矩阵与主线交付'};

/** 读取当前及驻留星系的实物发电量。按恒星计数，一颗恒星的多个壳层共用同一个能量账本。 */
export function clusterOutput(game) {
  const output = {power:0, spheres:0, sails:0, structure:0, cells:0};
  for (const sphere of [game.dyson, ...Object.values(game.space?.spheres || {})]) {
    const totals = sphereTotals(sphere);
    output.power += totals.power;
    output.sails += totals.sails;
    output.structure += totals.structure;
    output.cells += totals.cells;
    if (totals.structure || totals.cells) output.spheres++;
  }
  return output;
}

/** 最后一个真实课题结算时冻结交付快照。预解锁科技的沙盒从未经过这笔付款，故没有交付时间。 */
export function archiveCompletion(game, job) {
  if (job.id !== finalTopic || game.science.completion) return;
  const spec = research[finalTopic];
  if (job.hash < spec.hashes - 1e-6 || job.paid['universe-matrix'] !== spec.cost['universe-matrix']) {
    throw new Error('宇宙矩阵或研究哈希尚未交付完毕');
  }
  game.science.completion = {elapsed:game.elapsed, body:game.space.current, read:false, ...clusterOutput(game)};
}
