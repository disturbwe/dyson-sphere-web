import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,put,remove,stackDepot} from '../src/actions.js';
import {STEP,tick} from '../src/simulation.js';
import {setPersonalRule,runDistribution,routeMetres,transferBot} from '../src/distribution.js';
import {setDistributor,deliverDepot,depotRoom,clearOverflow} from '../src/depot.js';
import {researchRoute} from '../src/research.js';
import {captureBlueprint,blueprintBill} from '../src/blueprint.js';
import {decode} from '../src/save.js';

const lesson=()=>newGame(747183,'distribution');
function run(game,seconds){for(let i=0;i<Math.round(seconds/STEP);i++)tick(game,STEP);}
function balance(game,item){
  const warehouses=Object.values(game.planet.tiles).filter(t=>t.distributor);
  return (game.bag[item]||0)+warehouses.reduce((n,t)=>n+(t.output[item]||0)+(t.distributor.overflow[item]||0),0)+game.planet.distribution.trips.reduce((n,t)=>n+(t.item===item?t.load:0),0);
}
test('三条配送路线在飞行中存读档保持一致，背包改量后多余实物回仓',()=>{
  const game=lesson();run(game,4);
  assert.ok(game.planet.distribution.trips.some(t=>t.load>0));
  const restored=decode(JSON.stringify(game));
  for(const s of [game,restored]){
    run(s,45);assert.equal(s.bag.stone,16);assert.equal(s.bag['iron-ingot'],32);
    assert.equal(balance(s,'stone'),64);assert.equal(balance(s,'iron-ingot'),240);
    setPersonalRule(s,'iron-ingot',0,16);run(s,32);
    assert.equal(s.bag['iron-ingot'],16);assert.equal(s.planet.distribution.fromPlayer,64);
    assert.ok(s.planet.tiles['4,1'].output['iron-ingot']>0);
  }
  assert.deepEqual(game.planet.distribution,restored.planet.distribution);
});
test('移动目标需要追上才能签收，出勤机禁止调出，飞离本星后货物返港',()=>{
  const game=lesson(),supply=game.planet.tiles['-4,1'];
  const recovery=game.planet.tiles['0,-3'];recovery.distributor.bots=0;
  setDistributor(supply,'peers','off');supply.distributor.energy=27;supply.distributor.bots=1;
  runDistribution(game,game.planet,[supply],STEP);
  const flight=game.planet.distribution.trips[0];assert.equal(flight.load,8);
  assert.throws(()=>transferBot(game,supply,true),/没有停靠/);assert.throws(()=>remove(game,supply),/返航/);
  game.mecha.x=4;
  runDistribution(game,game.planet,[supply],flight.remaining);
  assert.equal(flight.bx,4);assert.equal(flight.back,false);assert.equal(game.bag['iron-ingot'],undefined);
  game.space.flight={to:'lava'};runDistribution(game,game.planet,[supply],flight.remaining);
  assert.equal(flight.back,true);runDistribution(game,game.planet,[supply],flight.remaining);
  assert.equal(supply.output['iron-ingot'],240);assert.equal(game.planet.distribution.trips.length,0);
  assert.ok(routeMetres({x:89,y:0},{x:-89,y:0})<14);
});
test('仓格容量、配送暂存、拆顶和图纸只结算真正的设施与库存',()=>{
  const game=lesson(),supply=game.planet.tiles['-4,1'];
  stackDepot(game,supply);supply.output={'iron-ingot':6000};
  assert.equal(depotRoom(supply,'iron-ingot'),0);deliverDepot(supply,'stone',8);
  assert.equal(supply.distributor.overflow.stone,8);
  supply.output['iron-ingot']-=100;clearOverflow(supply);assert.equal(supply.output.stone,8);
  game.techs.push(...researchRoute(game,'mass-construction-1'));
  const plan=captureBlueprint(game,supply,supply);
  assert.equal(plan.tiles[0].distributor.bots,undefined);assert.equal(plan.tiles[0].distributor.energy,undefined);
  assert.deepEqual(blueprintBill(plan),{'storage-1':2,'logistics-distributor':1});
  const prior=game.bag['logistics-bot'];remove(game,supply);assert.equal(game.bag['logistics-bot'],prior+4);
  remove(game,supply);assert.equal(supply.layers,1);assert.equal(depotRoom(supply,'stone'),0);
  assert.equal(supply.output['iron-ingot']+game.bag['iron-ingot'],5900);
});
test('仓间取件可由需求端派机。缺电时停靠，坏档不能虚增机腹或重复一架机',()=>{
  const game=lesson(),source=game.planet.tiles['-4,1'],dest=game.planet.tiles['4,1'];
  source.distributor.bots=0;dest.distributor.bots=1;game.planet.tiles['0,-3'].distributor.bots=0;
  const ports=[source,dest];runDistribution(game,game.planet,ports,STEP);
  assert.equal(game.planet.distribution.trips.length,0);dest.distributor.energy=27;
  for(let i=0;i<14;i++)runDistribution(game,game.planet,ports,STEP);
  const trip=game.planet.distribution.trips[0];assert.equal(trip.pick,true);assert.equal(trip.load,0);
  const duplicate=structuredClone(game);duplicate.planet.distribution.trips.push({...trip,id:++duplicate.planet.distribution.serial});
  assert.throws(()=>decode(JSON.stringify(duplicate)),/配送器/);
  const fake=structuredClone(game);fake.planet.distribution.trips[0].load=8;assert.throws(()=>decode(JSON.stringify(fake)),/配送器/);
  run(game,22);assert.ok(dest.output['iron-ingot']>=8);assert.equal(balance(game,'iron-ingot'),240);
});
