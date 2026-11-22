import {flow,recordFlow} from './production-log.js';
import {items} from './catalog.js';
import {capabilitiesOf} from './upgrades.js';
import {rng,wrap} from './world.js';
import {add,count} from './stock.js';

export const collector='orbital-collector';
export const moorings=Array.from({length:40},(_,i)=>wrap(Math.round(i*4.5)));
const fields=new WeakMap();

/** 星图和采集器从同一个天体种子读取气体组分。按公开的中位产量作小幅种子扰动，单位为个/秒。 */
export function gasProfile(body){
  let field=fields.get(body);
  if(field)return field;
  const random=rng((body.seed^0x53fa42)>>>0),ice=random()<.48;
  const components=ice?[['fire-ice',.64],['hydrogen',.30]]:[['hydrogen',.90],['deuterium',.04]];
  const gases=components.map(([item,median])=>({item,base:Math.round(median*(.84+.32*random())*1000)/1000}));
  field={ice,label:ice?'冰巨星':'气态巨星',gases};fields.set(body,field);return field;
}

/** 将赤道附近的指针吸附到最近的同步轨道位，跨越换日线也只会选中一个位置。高纬点击保留无效提示。 */
export function snapMooring(point){
  if(!point||Math.abs(point.realY??point.y)>1.35)return point;
  return {...point,x:wrap(Math.round(Math.round((point.realX??point.x)/4.5)*4.5)),y:0};
}
export const collectorCapacity=game=>5000+capabilitiesOf(game).storageBonus;

/** 两种气体各占一个固定仓位，库存与普通货单共享预订、装船和交付语义。采集器接待来船，船只归需求塔。 */
export function setupCollector(game,tile){
  const gas=gasProfile(game.planet),limit=collectorCapacity(game);
  tile.station={slots:gas.gases.map(({item})=>({item,limit,local:'storage',remote:'supply',incoming:0,held:0})),drones:0,vessels:0,awayDrone:0,awayVessel:0,warpers:0};
  tile.fractions=[0,0];
}
const ratesCache=new WeakMap();
/** 燃烧原始气流的一部分维持 30 MW。两种产物按热值占比分摊，单仓满载不会改变另一种的自耗。 */
export function gasRates(game,planet){
  const mining=capabilitiesOf(game).miningRate;
  const previous=ratesCache.get(planet);
  if(previous?.mining===mining)return previous.rows;
  const gases=gasProfile(planet).gases;
  const grossPower=gases.reduce((sum,{item,base})=>sum+base*mining*8*items[item].fuel.value,0);
  const fuelPart=Math.min(1,30/grossPower);
  const rows=gases.map(({item,base})=>{const gross=base*8*mining;return {item,gross,used:gross*fuelPart,net:gross*(1-fuelPart)};});
  ratesCache.set(planet,{mining,rows});return rows;
}
export function runCollector(game,planet,tile,dt){
  let gathering=false;
  const rates=gasRates(game,planet),limit=collectorCapacity(game);
  for(let i=0;i<rates.length;i++){
    const rate=rates[i],slot=tile.station.slots[i];
    // 固定气仓随载量科技扩容，已建采集器也应在完成升级后受益。
    slot.limit=limit;
    const room=limit-count(tile.output,rate.item)-slot.held;
    if(room<=0)continue;
    gathering=true;
    const accumulated=tile.fractions[i]+dt*rate.net,whole=Math.floor(accumulated);
    const amount=Math.min(room,whole);
    tile.fractions[i]=amount<whole?0:accumulated-whole;
    if(amount){add(tile.output,rate.item,amount);add(game.stats.mined,rate.item,amount);recordFlow(planet,game.elapsed,rate.item,flow.made,amount);}
  }
  tile.status=gathering?'采集中':'仓储已满';
}
export function setCollectionMode(tile,index,mode){
  if(tile?.type!==collector||!tile.station.slots[index]||!['storage','supply'].includes(mode))throw new Error('请选择采集器物品的仓储或供应状态');
  tile.station.slots[index].remote=mode;
}
/** 手动采样沿用星图基础流速，仅在机甲悬停于当前巨星时记入背包。换气体后余数重新从零累积。 */
export function sampleGas(game,item){
  if(game.planet.biome!=='gas'||game.space.flight||!gasProfile(game.planet).gases.some(g=>g.item===item))throw new Error('需要悬停在对应气体的巨星云顶');
  const m=game.mecha;m.intake=m.intake===item?null:item;m.intakeWork=0;m.target=null;
}
export function workGas(game,dt){
  const m=game.mecha;
  if(!m.intake)return;
  const {base}=gasProfile(game.planet).gases.find(g=>g.item===m.intake);
  m.intakeWork+=base*dt*(m.energy>0?1:.25);
  const n=Math.floor(m.intakeWork);
  if(n){add(game.bag,m.intake,n);add(game.stats.mined,m.intake,n);recordFlow(game.planet,game.elapsed,m.intake,flow.made,n);m.intakeWork-=n;}
}
