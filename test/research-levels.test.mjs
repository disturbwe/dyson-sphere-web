import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame} from '../src/actions.js';
import {decode} from '../src/save.js';
import {tick} from '../src/simulation.js';
import {researchRoute,enqueueResearch,cancelResearch,hashWork} from '../src/research.js';
import {studySpec,jobSpec,studyDone,currentLevelKey,keyAt} from '../src/research-levels.js';
import {capabilitiesOf} from '../src/upgrades.js';

const sixth='veins-utilization-6', seventh=sixth+'@7', white='universe-matrix';
const reload=game=>decode(JSON.stringify(game));
const advance=(game,seconds)=>{for(let step=0;step<seconds*30;step++)tick(game);};
const supply=game=>game.planet.tiles['1,0'].input[white]||0;

test('逐级价格和依赖跨原型延续，达到等级上限后无法再开课题',()=>{
  assert.deepEqual(studySpec(sixth),{hashes:3600000,cost:{[white]:4000}});
  assert.deepEqual(studySpec(seventh),{hashes:7200000,cost:{[white]:8000}});
  assert.equal(keyAt(sixth,10000),sixth+'@10000');
  assert.equal(keyAt(sixth,10001),null);
  assert.equal(studySpec(sixth+'@07'),null);
  const game=newGame();
  const first='logistics-carrier-capacity-9', next='logistics-carrier-capacity-12';
  game.techs.push(...researchRoute(game,first));
  assert.deepEqual(researchRoute(game,next+'@13'),[first+'@10',first+'@11',next,next+'@13']);
  enqueueResearch(game,next+'@13');cancelResearch(game,first+'@10');
  assert.equal(game.research,null);
  assert.deepEqual(game.science.queue,[]);
});

test('七级矿物利用续传保留已付款，同一矿机升完后增产并按新矿耗扣款',()=>{
  const game=newGame(747183,'veins'), baseline=reload(game);
  assert.equal(currentLevelKey(game,sixth),seventh);
  assert.equal(supply(game),4);
  enqueueResearch(game,seventh);advance(game,19);
  const resumed=reload(game);
  assert.equal(resumed.research.hash,7197540);
  assert.equal(supply(resumed),2);
  cancelResearch(resumed,seventh);enqueueResearch(resumed,seventh);advance(resumed,42);
  assert.equal(studyDone(resumed,seventh),true);
  assert.equal(supply(resumed),0);
  assert.ok(Math.abs(capabilitiesOf(resumed).miningRate-1.7)<1e-12);
  assert.equal(capabilitiesOf(resumed).orePerItem,.94**7);
  assert.equal(currentLevelKey(reload(resumed),sixth),sixth+'@8');
  // 以同一座起步矿井的独立存档作对照，排除已堵带或不同矿点数对产量的影响。
  const upgraded=reload(baseline);enqueueResearch(upgraded,seventh);
  hashWork(upgraded,upgraded.planet.tiles['1,0'].input,3600,true);
  for(const [mine,rank] of [[baseline,6],[upgraded,7]]){
    const before=mine.planet.veins.reduce((sum,v)=>sum+(v.amount||0),0);
    advance(mine,10);
    const produced=mine.stats.mined['iron-ore'];
    const remaining=mine.planet.veins.reduce((sum,v)=>sum+(v.amount||0),0);
    assert.equal(produced,8*(10+rank)/2);
    assert.equal(before-remaining,Math.floor(produced*.94**rank));
  }
});

test('九版已开工的课题按当时价格结清，新档与后续等级采用原型价格',()=>{
  const game=newGame(),base='mecha-core-6';
  game.techs.push(...researchRoute(game,base).slice(0,-1));
  game.version=9;game.science.manual=false;delete game.science.ranks;
  game.research={id:base,hash:3600000,paid:{[white]:2000}};
  const carried=reload(game);
  assert.equal(jobSpec(carried.research).hashes,7200000);
  assert.equal(studySpec(base).hashes,1800000);
  cancelResearch(carried,base);enqueueResearch(carried,base);
  hashWork(carried,{[white]:2000},3600000,true);
  assert.equal(capabilitiesOf(carried).coreMJ,5600);
  const next=base+'@7';enqueueResearch(carried,next);
  const spec=studySpec(next);
  hashWork(carried,{...spec.cost},spec.hashes,true);
  assert.equal(capabilitiesOf(reload(carried)).coreMJ,8000);
  carried.science.ranks[base]=10001;
  assert.throws(()=>reload(carried),/无效/);
});
