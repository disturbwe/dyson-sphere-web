import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame, planCraft, queueCraft, cancelCraft, startResearch, hashWork, place, layBelt, remove, count} from '../src/actions.js';
import {recipes, unlocked} from '../src/catalog.js';
import {key, distance} from '../src/world.js';
import {tick, STEP} from '../src/simulation.js';
import {decode} from '../src/save.js';

const advance = (game, seconds) => { for (let i=0; i<Math.round(seconds/STEP); i++) tick(game); };

test('固定种子重现资源分布，合法世界可原样从存档恢复', () => {
  for (const seed of [1, 7, 53, 2371, 747183, 99999999]) {
    const game = newGame(seed);
    assert.deepEqual(game.planet.veins, newGame(seed).planet.veins);
    assert.deepEqual(decode(JSON.stringify(game)), game);
  }
});

test('复制器材料不足不扣款，取消嵌套配方返还原矿', () => {
  const game = newGame();
  game.bag={'iron-ore':9, 'copper-ore':5};
  assert.throws(() => queueCraft(game,'magnetic-coil',5), /缺少/);
  assert.deepEqual(game.bag, {'iron-ore':9, 'copper-ore':5});
  game.bag['iron-ore']++;
  const before = {...game.bag};
  assert.equal(planCraft(game,'magnetic-coil',5).time,25);
  queueCraft(game,'magnetic-coil',5);
  advance(game,5);
  cancelCraft(game,0);
  assert.deepEqual(game.bag,before);
  queueCraft(game,'magnetic-coil',5);
  advance(game,25);
  assert.deepEqual(game.bag,{'magnetic-coil':10});
});

test('研究跨供料端共享已支付进度，缺料暂停、恢复后仅扣余款', () => {
  const game = newGame();
  startResearch(game,'electromagnetism');
  const lab={'magnetic-coil':3};
  assert.equal(hashWork(game,lab,840),360);
  assert.equal(hashWork(game,lab,60),0);
  game.bag['magnetic-coil']=7;
  advance(game,14);
  assert.equal(game.research,null);
  assert.deepEqual(game.techs,['electromagnetism']);
  assert.equal(count(game.bag,'magnetic-coil'),0);
  assert.ok(unlocked(game,recipes['mining-machine']));
});

test('两段传送带交叉时整条路径原子失败，原建筑与库存不变', () => {
  const game=newGame(747183,'foundry');
  const before=structuredClone(game);
  assert.throws(()=>layBelt(game,'conveyor-belt-1',{x:1,y:-2},{x:1,y:2}),/占用/);
  assert.deepEqual(game,before);
});

test('生产线实物守恒，保存和恢复不会重复搬运、重新产矿或清空缓冲', () => {
  const game=newGame(747183,'foundry');
  const oreBefore=game.planet.veins.filter(v=>v.item==='iron-ore').reduce((sum,v)=>sum+v.amount,0);
  advance(game,60);
  const store=game.planet.tiles['3,0'];
  assert.ok(store.output['iron-ingot']>20);
  const oreLeft=game.planet.veins.filter(v=>v.item==='iron-ore').reduce((sum,v)=>sum+v.amount,0);
  // 冶炼每块只取一矿。盘点传送带、抓爪、机器缓存和仓库，以检出重复提货。
  const inFactory=Object.values(game.planet.tiles).reduce((sum,t)=>sum+Number(!!t.cargo)+['iron-ore','iron-ingot'].reduce((n,id)=>n+count(t.input,id)+count(t.output,id),0),0);
  const held=game.planet.links.reduce((sum,l)=>sum+(l.hand?.size||0),0);
  assert.equal(oreBefore-oreLeft,inFactory+held);
  const resumed=decode(JSON.stringify(game));
  advance(game,15);advance(resumed,15);
  assert.deepEqual(resumed,game);
  const arms=game.bag['sorter-1'];
  remove(game,game.planet.tiles['1,0']);
  assert.equal(game.bag['sorter-1'],arms+2);
  assert.equal(game.planet.links.length,0);
});

test('经线接缝的邻格相连，未覆盖到的电网不能为远处机器供能', () => {
  const game=newGame(747183,'foundry');
  assert.equal(distance({x:89,y:0},{x:-89,y:0}),2);
  assert.equal(key(90,0),'-90,0');
  game.mecha.x=9;game.mecha.y=-4;
  const isolated=place(game,'arc-smelter',{x:9,y:-4});
  isolated.recipe='iron-ingot';isolated.input['iron-ore']=5;
  advance(game,3);
  assert.equal(isolated.power,0);
  assert.equal(isolated.status,'未供电');
  assert.equal(isolated.input['iron-ore'],5);
});
