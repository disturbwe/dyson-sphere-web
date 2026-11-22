import {extraDefenses} from './defense-equipment.js';
import data from '../data/dsp.json' with { type: 'json' };
import zh from '../data/zh.json' with { type: 'json' };
import totals from '../data/research.json' with { type: 'json' };
import upgrades from '../data/upgrades.json' with { type: 'json' };

// 数据集中同时有实体物品、科技和计算器使用的虚拟产物；只有实体物品能进入库存。
export const items = Object.fromEntries(data.items.map(item => [item.id, item]));
export const recipes = Object.fromEntries(data.recipes.map(recipe => [recipe.id, recipe]));
export const physical = data.items.filter(i => ['buildings', 'components'].includes(i.category));
// 全息信标来自后续版本，按游戏科技条目修正计算器目录中的早期前置。
items['holo-beacon-tech'].technology={...items['holo-beacon-tech'].technology,prerequisites:['high-efficiency-plasma-control']};
// 3301—3306 是已退役的旧分拣科技。数值底本也保留了它们，当前升级页使用 3311—3316 的集装分拣器改良。
export const retiredTopics = new Set(['sorter-cargo-integration', ...[1,2,3,4,5].map(level => 'sorter-cargo-stacking-'+level)]);
export const technologies = data.items.filter(item => item.technology && !retiredTopics.has(item.id));
// 配方中的科技成本按固定哈希归一化，实际课题须使用核实的整级成本。
export const research = {...totals,...upgrades};
export const name = id => zh.items[id] || zh.recipes[id] || items[id]?.name || recipes[id]?.name || id;
export const recipeName = id => zh.recipes[id] || name(id);
export const product = r => Object.keys(r.out)[0];
export const ingredientList = bag => Object.entries(bag).map(([k,v]) => name(k) + ' ×' + v).join(' · ');
export const smelters = ['arc-smelter','plane-smelter','df-negentropy-smelter'];
export const assemblers = ['assembling-machine-1','assembling-machine-2','assembling-machine-3','df-recomposing-assembler'];
export const machines = [...smelters, ...assemblers, 'matrix-lab','df-self-evolution-lab','oil-refinery','chemical-plant','quantum-chemical-plant','miniature-particle-collider'];
export const belts = ['conveyor-belt-1','conveyor-belt-2','conveyor-belt-3'];
export const sorters = ['sorter-1','sorter-2','sorter-3','sorter-4'];
export const stores = ['storage-1','storage-2','storage-tank'];
export const poles = ['tesla-tower','wireless-power-tower','satellite-substation'];
export const generators = ['wind-turbine','solar-panel','geothermal-power-station','thermal-power-plant','mini-fusion-power-plant','artificial-star'];
export const extractors = ['mining-machine','advanced-mining-machine','water-pump','oil-extractor'];
export const launchers = ['em-rail-ejector','vertical-launching-silo'];
export const stations=['planetary-logistics-station','interstellar-logistics-station'];
export const buildable = [...extraDefenses,'df-planetary-shield-generator','holo-beacon','df-gauss-turret','df-laser-turret','df-battlefield-analysis-base',...stations,'orbital-collector',...generators,...poles,...extractors,...belts,...sorters,'splitter','automatic-piler','traffic-monitor','spray-coater','logistics-distributor',...machines,...stores,...launchers,'ray-receiver','fractionator','energy-exchanger','accumulator','accumulator-full'];
// 原始配方表明确标注允许额外产出的配方，升级建筑和裂解等只允许加速。
export const productiveRecipes=new Set(data.limitations.productivity);
export const productionRecipes = data.recipes.filter(r => !['technologies','upgrades'].includes(r.category));
export const forMachine = id => productionRecipes.filter(r => r.producers.includes(id));
export function unlocked(s,r) {
  if (!r?.flags?.includes('locked')) return !!r;
  return s.techs.some(id => items[id]?.technology?.recipeUnlock?.includes(r.id));
}
// 机甲复制器能处理基础冶炼与装配。矩阵实验室以外，后期化工与粒子配方必须走对应设备。
export function handRecipe(r) {
  return !!r && !r.flags?.includes('technology') && (r.producers.some(p => assemblers.includes(p)) || ['iron-ingot','copper-ingot','magnet','stone-brick','glass','electromagnetic-matrix'].includes(r.id));
}
export const oreColors = {'iron-ore':'#79b5ea','copper-ore':'#f39759',stone:'#c6c1a6',coal:'#605781','silicon-ore':'#9ed58b','titanium-ore':'#d2c1df','crude-oil':'#ac74ae','unipolar-magnet':'#754b80','fire-ice':'#80dce6','kimberlite-ore':'#8cb6d9','fractal-silicon':'#8cdd9e','organic-crystal':'#f1ae3e','optical-grating-crystal':'#d7b8f2','spiniform-stalagmite-crystal':'#67c5c9',water:'#60cbe0'};
export function tint(id) {
  if (oreColors[id]) return oreColors[id];
  if (/matrix/.test(id)) return ({'energy-matrix':'#ff756d','structure-matrix':'#ffd467','information-matrix':'#bd81ff','gravity-matrix':'#70f4aa','universe-matrix':'#ffffff'})[id] || '#55d7ff';
  if (id.includes('copper') || id.includes('coil')) return '#f2a16d';
  if (belts.includes(id)||sorters.includes(id)) return '#e8bd6f';
  if (poles.includes(id)||generators.includes(id)) return '#83e1d6';
  return '#9dbad6';
}
