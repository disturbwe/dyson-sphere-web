import {recordBatch} from './production-log.js';
import {productiveRecipes} from './catalog.js';
import {count,merge,stockPoints} from './stock.js';

// Mk.III 给四点。不同标记混仓后可能得到三点，仍按游戏对应的中间档结算。
export const extraRate=[0,.125,.2,.225,.25];
export const speedRate=[1,1.25,1.5,1.75,2];
export const loadRate=[1,1.3,1.7,2.1,2.5];
export const gradeOf=(bag,id)=>count(bag,id)?Math.floor(stockPoints(bag,id)/count(bag,id)):0;
/** 一批的倍率取所有配料中的最低值。普通库存直接返回零，工厂规模增大时不用遍历配方。 */
export function ingredientGrade(tile,cost){
  if(!tile.inputPoints||!cost)return 0;
  let floor=4;
  for(const id in cost){
    floor=Math.min(floor,gradeOf(tile.input,id));
    if(!floor)break;
  }
  return floor;
}
export function speedMode(tile){return tile.accelerate===true||!productiveRecipes.has(tile.recipe);}
/** 所有产物按完整批次同时结算。余数与当前配方一同存档，额外产物没有母料的喷点。 */
export function finishBatch(game,tile,recipe,planet=game.planet){
  const grade=ingredientGrade(tile,recipe.in);
  let batches=1;
  if(grade&&!speedMode(tile)){
    const accumulated=(tile.bonusWork||0)+extraRate[grade];
    if(accumulated>=1-1e-9){batches++;tile.bonusCycles=(tile.bonusCycles||0)+1;}
    tile.bonusWork=Math.max(0,accumulated-(batches-1));
  }
  recordBatch(planet,game.elapsed,recipe.in,recipe.out,batches);
  merge(tile.input,recipe.in,-1);merge(tile.output,recipe.out,batches);merge(game.stats.made,recipe.out,batches);
}
export const recipeSpeed=(tile,recipe)=>speedMode(tile)?speedRate[ingredientGrade(tile,recipe.in)]:1;
