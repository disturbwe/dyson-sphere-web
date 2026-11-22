import assert from 'node:assert/strict';
import test from 'node:test';
import {newGame} from '../src/actions.js';
import {tick} from '../src/simulation.js';
import {decode,storeGame,savedGames,readGame} from '../src/save.js';
import {clusterOutput} from '../src/mission-record.js';
import {groupSlots} from '../src/galaxy-map.js';

const advance=(game,seconds)=>{for(let i=0;i<seconds*30;i++)tick(game);};

test('最后四份矩阵来自真实光子，已交付数量、研究与副产氢在读档后守恒',()=>{
  const game=newGame(747183,'mission');
  assert.equal(game.research.paid['universe-matrix'],3996);
  assert.equal(game.science.completion,undefined);
  advance(game,30);
  assert.equal(game.research.hash,3596400);
  assert.equal(game.stats.made['critical-photon'],undefined);
  game.planet.tiles['-5,1'].mode='photon';advance(game,45);
  assert.ok(game.stats.made.antimatter>0);
  const restored=decode(JSON.stringify(game));advance(game,85);advance(restored,85);
  assert.deepEqual(restored,game);
  const record=game.science.completion;
  assert.ok(record.elapsed>75 && record.elapsed<160);
  assert.equal(game.techs.filter(id=>id==='mission-completed').length,1);
  assert.equal(game.stats.made.hydrogen,game.stats.made.antimatter);
  const tiles=Object.values(game.planet.tiles);
  const remaining=tiles.reduce((n,t)=>n+(t.input['universe-matrix']||0)+(t.output['universe-matrix']||0)+(t.cargo==='universe-matrix'),0);
  assert.equal(game.stats.made['universe-matrix'],4+remaining);
  const produced=game.stats.made['universe-matrix'];advance(game,30);
  assert.ok(game.stats.made['universe-matrix']>produced);
  assert.deepEqual(game.science.completion,record);
  assert.ok(clusterOutput(game).power>0);
  assert.ok(!newGame(747183,'sandbox').science.completion);
  const invalid=structuredClone(game);invalid.science.completion.elapsed=game.elapsed+1;
  assert.throws(()=>decode(JSON.stringify(invalid)),/研究序列/);
});

test('银河星区按种子和星数聚合，教学和标准存档分别计分，缓存仅在存储成功后更新',()=>{
  const records=new Map();let reads=0,full=false;
  globalThis.localStorage={get length(){return records.size;},key:i=>[...records.keys()][i],getItem(k){reads++;return records.get(k);},setItem(k,v){if(full)throw Error('配额已满');records.set(k,v);}};
  const game=newGame(747183,'mission'),normal=newGame(747183,'landing'),smaller=newGame(747183,'landing',32);
  storeGame('mission',game);storeGame('normal',normal);storeGame('small',smaller);
  const rows=savedGames(),afterScan=reads;
  assert.equal(rows.length,3);savedGames();assert.equal(reads,afterScan);
  const both=groupSlots(rows,'all'),primary=both.find(g=>g.id==='00747183-64-Z10');
  assert.equal(both.length,2);assert.equal(primary.slots[0].slot,'mission');
  const standard=groupSlots(rows,'landing').find(g=>g.id===primary.id);
  assert.equal(standard.slots.length,1);assert.equal(standard.x,primary.x);assert.equal(standard.slots[0].report.power,0);
  const before=savedGames().find(x=>x.slot==='normal').date;
  full=true;assert.throws(()=>storeGame('normal',game),/配额已满/);full=false;
  assert.equal(savedGames().find(x=>x.slot==='normal').date,before);
  assert.equal(readGame('normal').scenario,'landing');
});
