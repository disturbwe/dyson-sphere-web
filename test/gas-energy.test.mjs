import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,place,placeError,remove,count} from '../src/actions.js';
import {tick} from '../src/simulation.js';
import {decode} from '../src/save.js';
import {newStation,setStationRule} from '../src/stations.js';
import {makePlanet} from '../src/world.js';
import {depart,toggleFlight} from '../src/navigation.js';
import {gasProfile,gasRates,runCollector,setupCollector,collector,moorings,snapMooring,sampleGas} from '../src/gas.js';
import {emptyCell,fullCell,exchanger,setupEnergyTile,flowCell,exchangeMode,cellCapacity} from '../src/energy.js';
import {groupPower,solveGrid} from '../src/grid-power.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' ≠ '+b);
const run=(game,ticks)=>{for(let i=0;i<ticks;i++)tick(game);};

test('巨星环绕保持悬浮，只能占用 40 个赤道泊位，拆除归还实物',()=>{
  const game=newGame(747183,'gas');
  assert.throws(()=>toggleFlight(game),/悬浮/);
  assert.equal(moorings.length,new Set(moorings).size);
  assert.equal(moorings.length,40);
  for(const x of moorings)assert.equal(snapMooring({x,y:0}).x,x);
  assert.equal(snapMooring({x:89.7,y:.3}).x,-90);
  assert.match(placeError(game,'wind-turbine',{x:0,y:0},0),/云顶/);
  assert.match(placeError(game,collector,{x:0,y:2},0),/赤道/);
  const tile=place(game,collector,{x:0,y:0});
  assert.match(placeError(game,collector,{x:0,y:0},0),/占用/);
  assert.equal(count(game.bag,collector),2);
  sampleGas(game,'hydrogen');run(game,120);
  assert.ok(game.bag.hydrogen>=23);
  remove(game,tile);assert.equal(game.bag[collector],3);
  depart(game,'home');assert.equal(game.mecha.intake,null);
  for(let i=0;i<2000&&game.space.flight;i++)tick(game);
  assert.equal(game.space.current,'home');assert.equal(game.mecha.flying,false);
  depart(game,'giant');
  for(let i=0;i<2000&&game.space.flight;i++)tick(game);
  assert.equal(game.space.current,'giant');assert.equal(game.mecha.flying,true);
  assert.deepEqual(decode(JSON.stringify(game)),game);
});

test('双气仓按能值支付 30 MW，仓满不堵另一产品，利用率提高净产',()=>{
  const game=newGame();let ice;
  for(let seed=1;seed<12000;seed+=177){const p=makePlanet(seed,'gas');if(gasProfile(p).ice){ice=p;break;}}
  assert.ok(ice);game.planet=ice;
  const rates=gasRates(game,ice);
  close(4.8*rates[0].used+9*rates[1].used,30);
  const t={type:collector,input:{},output:{}};setupCollector(game,t);
  t.output['fire-ice']=5000;
  for(let i=0;i<6000;i++)runCollector(game,ice,t,1/30);
  assert.equal(t.output['fire-ice'],5000);
  assert.equal(t.output.hydrogen,Math.floor(rates[1].net*200));
  game.techs.push('veins-utilization-1','logistics-carrier-capacity-9');
  const boosted=gasRates(game,ice);
  close(boosted[0].used,rates[0].used);close(boosted[0].gross/rates[0].gross,1.1);
  runCollector(game,ice,t,1);assert.equal(t.station.slots[0].limit,6000);
});

test('需求塔关闭采集器选项会拒绝新航班，已订实物跨存档守恒',()=>{
  const g=newGame(747183,'gas'),tower=g.space.parked.home.tiles['0,2'];
  setStationRule(tower,'collectGas',false);run(g,600);
  assert.equal(g.freight.trips.length,0);assert.deepEqual(tower.output,{});
  setStationRule(tower,'collectGas',true);run(g,42);
  assert.ok(g.freight.trips.some(t=>t.collect&&t.source.startsWith('giant/')));
  const broken=structuredClone(g);broken.freight.trips[0].collect=false;
  assert.throws(()=>decode(JSON.stringify(broken)),/货单/);
  const copy=decode(JSON.stringify(g));run(g,5500);run(copy,5500);
  assert.deepEqual(g,copy);assert.ok(tower.output.hydrogen>0&&tower.output.deuterium>0);
  for(const {item} of gasProfile(g.planet).gases){
    const waiting=Object.values(g.planet.tiles).reduce((sum,t)=>sum+count(t.output,item),0);
    const booked=g.freight.trips.filter(t=>t.item===item).reduce((sum,t)=>sum+t.amount,0);
    assert.equal(waiting+booked+count(tower.output,item),g.stats.mined[item]);
  }
});

test('枢纽从余电充电并优先放电，不在满空电芯之间重复搬运能量',()=>{
  const game=newGame(), fixed={type:emptyCell}, unit={type:exchanger,input:{[emptyCell]:1},output:{}},wind={type:'wind-turbine'},load={type:'load'};
  setupEnergyTile(fixed,emptyCell);setupEnergyTile(unit,exchanger);
  exchangeMode(unit,'charge');
  const network={power:groupPower(new Map([[wind,0],[load,0],[unit,0],[fixed,0]]))};
  const step=(use,gen)=>solveGrid(game,game.planet,network,1,t=>t===load?use:0,t=>t===wind?gen:0);
  let state=step(500,2500);
  close(state.charging,2000);close(unit.energyMJ+fixed.energyMJ,2);
  // 部分充电时反向，先由枢纽送电。总剩余能量必须正好等于原有能量减去 0.5 MJ 实际负载。
  exchangeMode(unit,'discharge');const before=fixed.energyMJ;
  state=step(500,0);close(state.discharging,500);close(unit.energyMJ+fixed.energyMJ,1.5);close(fixed.energyMJ,before);
  state=step(0,0);close(state.discharging+state.charging,0);
  while(unit.energyMJ!==null)step(54000,0);
  assert.equal(unit.output[emptyCell],1);assert.equal(unit.output[fullCell],undefined);
  // 直接从快充上限截到最后 1 MJ，用满 540 MJ 才形成能运输的整电芯。
  exchangeMode(unit,'charge');unit.energyMJ=539;
  const kw=cellCapacity(unit,1,false);close(kw,1000);flowCell(game,unit,-kw,1);
  assert.equal(unit.output[fullCell],1);assert.equal(unit.energyMJ,null);
});

test('地热星的满电货单与母星送回的空壳维持电芯总数',()=>{
  const g=newGame(747183,'energy');run(g,10800);
  assert.ok(g.freight.delivered[fullCell]>0&&g.freight.delivered[emptyCell]>0);
  let cells=0;
  for(const planet of [g.planet,...Object.values(g.space.parked)])for(const t of Object.values(planet.tiles)){
    for(const id of [emptyCell,fullCell])cells+=count(t.input,id)+count(t.output,id)+Number(t.cargo===id);
    if(t.type===exchanger&&t.energyMJ!==null)cells++;
  }
  for(const trip of g.freight.trips){if(trip.collect||!trip.back)cells+=trip.amount;}
  assert.equal(cells,10);assert.deepEqual(decode(JSON.stringify(g)),g);
});
