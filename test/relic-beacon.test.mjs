import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,put,takeOutput,queueCraft,loadMachine,accepts} from '../src/actions.js';
import {decode} from '../src/save.js';
import {items,research,retiredTopics,technologies,recipes,unlocked} from '../src/catalog.js';
import {discoverSamples,enqueueResearch,handResearch,hashWork,topicVisible,startResearch} from '../src/research.js';
import {tick,STEP} from '../src/simulation.js';
import {facilityConfig} from '../src/blueprint-config.js';
import {updateBeacon,resolveMark,visibleFrom,beamColor,beaconDemand} from '../src/beacons.js';
import {workingLabs} from '../src/lab.js';

const darkLens='df-dark-fog-lens';
const lensTopic=darkLens+'-tech';
const matrix='df-dark-fog-matrix';

test('五份黑雾样本分别触发题目，已退役的六个分拣原型不占正常研究槽位',()=>{
  const candidates=new Set(technologies.map(item=>item.id));
  assert.equal(candidates.size,301);
  assert.deepEqual(new Set(Object.keys(research)),candidates);
  for(const retired of retiredTopics)assert.equal(candidates.has(retired),false);
  const topics=[
    [lensTopic,matrix,1000],['df-digital-analog-computation','df-silicon-based-neuron',800],
    ['df-matter-recombination','df-matter-recombinator',600],['df-negentropy-recursion','df-negentropy-singularity',1200],
    ['df-high-density-controlled-annihilation','df-core-element',2000]
  ];
  for(const [id,sample,need] of topics){
    const game=newGame();game.bag[sample]=1;discoverSamples(game);
    assert.equal(topicVisible(game,id),false);
    game.techs.push(...items[id].technology.prerequisites);delete game.bag[sample];
    assert.equal(topicVisible(decode(JSON.stringify(game)),id),true);
    assert.equal(research[id].cost[matrix],need);
  }
});

test('仓内黑雾矩阵在领取后显题，研究站拒绝代研，读档后用余料制成四倍透镜',()=>{
  const game=newGame(747183,'relic');
  assert.throws(()=>enqueueResearch(game,lensTopic),/样本/);
  takeOutput(game,game.planet.tiles['0,1']);startResearch(game,lensTopic);
  assert.equal(game.science.reserve[matrix],1000);assert.equal(game.bag[matrix],12);
  const lab=put(game,'matrix-lab',{x:0,y:0},0);lab.recipe='research';lab.input[matrix]=1000;
  assert.equal(accepts(lab,matrix,game),false);assert.equal(workingLabs(game,lab),0);
  assert.equal(hashWork(game,lab.input,120,true),0);assert.equal(lab.input[matrix],1000);
  handResearch(game,120);const resumed=decode(JSON.stringify(game));
  handResearch(resumed,380);assert.equal(unlocked(resumed,recipes[darkLens]),true);
  assert.equal(resumed.bag[matrix],12);queueCraft(resumed,darkLens,1);
  for(let i=0;i<182;i++)tick(resumed,STEP);
  assert.equal(resumed.bag[darkLens],1);const east=resumed.planet.tiles['3,2'];
  loadMachine(resumed,east,darkLens,1);tick(resumed,STEP);
  const west=resumed.planet.tiles['-3,2'];assert.equal(east.lensType,darkLens);
  assert.equal(west.lensType,'graviton-lens');assert.equal(east.received,west.received*2);
  assert.deepEqual(decode(JSON.stringify(resumed)).planet.tiles['3,2'],east);
  // 旧档的催化剂没有类型字段，保持普通引力透镜的两倍倍率。
  delete west.lensType;const old=decode(JSON.stringify(resumed));tick(old,STEP);
  assert.equal(old.planet.tiles['-3,2'].received,30000);
});

test('信标功耗、可见范围、跟随测点颜色及迁移设置在重载后仍归属正确星球',()=>{
  const game=newGame(747183,'piling');for(let i=0;i<240;i++)tick(game,STEP);
  const planet=game.planet,tile=planet.tiles['-1,0'],meter=planet.tiles['2,1'];
  assert.equal(beaconDemand(tile.beacon),330);assert.equal(visibleFrom(game,'home',tile,'cluster'),true);
  const oldColor=beamColor(planet,tile);meter.monitor.state='fail';assert.notEqual(beamColor(planet,tile),oldColor);
  updateBeacon(planet,tile,{title:'供水总线',scope:'system',body:'[x] 已查验'});
  assert.equal(visibleFrom(game,'home',tile,'cluster'),false);assert.equal(visibleFrom(game,'home',tile,'system'),true);
  assert.equal(facilityConfig(tile).beacon.meter,null);
  assert.throws(()=>updateBeacon(planet,tile,{meter:'63,30'}),/监测器/);
  const resumed=decode(JSON.stringify(game));assert.equal(resolveMark(resumed,'home@-1,0').tile.beacon.body,'[x] 已查验');
  updateBeacon(planet,tile,{scope:'off'});assert.equal(beaconDemand(tile.beacon),0);assert.equal(visibleFrom(game,'home',tile,'surface'),false);
  const invalid=structuredClone(resumed);invalid.science.samples=32;
  assert.throws(()=>decode(JSON.stringify(invalid)),/研究/);
});
