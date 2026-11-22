import assert from 'node:assert/strict';
import test from 'node:test';
import {newGame} from '../src/actions.js';
import {makePlanet} from '../src/world.js';
import {drawOil} from '../src/oil.js';
import {sampleMatrices,validMeter,homeAddress} from '../src/matrix-meter.js';
import {postPeak,holdings,reserveClaim,deliverClaims,redeem} from '../src/metadata.js';
import {decode} from '../src/save.js';
import {startResearch,hashWork,buyoutCost} from '../src/research.js';

const blue='electromagnetic-matrix',white='universe-matrix';
const wallet=()=>({sectors:{},claims:{}});
function produce(game,second,items){
  game.elapsed=second;
  for(const [item,quantity] of Object.entries(items))game.stats.made[item]=(game.stats.made[item]||0)+quantity;
  sampleMatrices(game);
}

test('窗口恰好过一小时才到期，累计产量和同址旧档不能反复兑现',()=>{
  const game=newGame(17,'landing',64,'normal','scarce');
  produce(game,1,{[blue]:120});produce(game,3600,{[blue]:60,[white]:20});
  assert.deepEqual(game.meta.total,[180,0,0,0,0,20]);
  assert.deepEqual(game.meta.peak,[19,0,0,0,0,2]);
  const snapshot=decode(JSON.stringify(game));
  produce(game,3601,{});assert.equal(game.meta.total[0],60);
  produce(game,7201,{});assert.deepEqual(game.meta.total,[0,0,0,0,0,0]);
  assert.deepEqual(game.meta.peak,snapshot.meta.peak);
  const account=wallet();assert.equal(postPeak(account,game),true);assert.equal(postPeak(account,snapshot),false);
  assert.equal(validMeter(game),true);snapshot.meta.buckets['1'][0]++;assert.equal(validMeter(snapshot),false);
  // v12 只有终身产量，未知发生时刻的旧矩阵不能当成过去一小时产出。
  game.version=12;delete game.meta;delete game.resource;
  const restored=decode(JSON.stringify(game));produce(restored,7202,{});assert.equal(restored.meta.peak[0],0);
});

test('资源选项保持矿脉坐标，极少母星与外星倍率不同，无限油泉持续出油',()=>{
  const normal=makePlanet(109),scarce=makePlanet(109,'mediterranean','scarce'),outer=makePlanet(109,'mediterranean','scarce',false);
  normal.veins.forEach((v,i)=>{
    const homeVein=scarce.veins[i],farVein=outer.veins[i];
    assert.deepEqual([v.x,v.y,v.item],[farVein.x,farVein.y,farVein.item]);
    if(v.item==='crude-oil')assert.equal(homeVein.rate,v.rate/2);
    else {assert.equal(homeVein.amount,Math.round(v.amount*.1));assert.equal(farVein.amount,Math.round(v.amount*.07));}
  });
  const seep={rate:1.8},up={miningRate:1,orePerItem:1};
  assert.equal(drawOil(seep,18000,up,'infinite'),32400);assert.equal(seep.rate,1.8);
  drawOil(seep,18000,up,'scarce');assert.ok(Math.abs(seep.rate-.9)<1e-10);
});

test('同址排除、分色逐笔扣款与白矩阵组合交付，已预留的物资可退回',()=>{
  const source=newGame(18),other=newGame(18,'landing',64,'normal','2'),account=wallet();
  source.meta.peak=[12,0,0,0,0,2];postPeak(account,source);
  assert.throws(()=>reserveClaim(account,source,'self',{item:blue,quantity:1}),/不足/);
  const fake=newGame(21,'sandbox');fake.meta.peak[0]=10000;assert.equal(postPeak(account,fake),false);
  fake.scenario='landing';fake.meta.foreign=true;assert.equal(postPeak(account,fake),false);
  // 已为当前课题预留四份，真正上传一份后，外区只需支付剩余九份。
  other.bag[blue]=4;startResearch(other,'universe-exploration-1');hashWork(other,other.science.reserve,1);
  assert.deepEqual(buyoutCost(other,'universe-exploration-1'),{[blue]:9});
  reserveClaim(account,other,'B',{tech:'universe-exploration-1'});reserveClaim(account,other,'B',{item:'spectrum',quantity:2});
  const stateBeforeFailure=JSON.stringify(account);
  assert.throws(()=>reserveClaim(account,other,'B',{item:blue,quantity:4}),/不足/);assert.equal(JSON.stringify(account),stateBeforeFailure);
  assert.equal(deliverClaims(account,other,'B'),true);assert.equal(deliverClaims(account,other,'B'),false);
  assert.ok(other.techs.includes('universe-exploration-1'));assert.equal(other.bag[blue],5);assert.equal(other.bag['gravity-matrix'],2);
  assert.equal(other.research,null);assert.deepEqual(other.science.reserve,{});assert.equal(other.meta.applied,2);
  assert.deepEqual(holdings(account,homeAddress(other)).available,[3,0,0,0,0,0]);assert.equal(postPeak(account,source),false);
  assert.deepEqual(decode(JSON.stringify(other)),other);
});

test('扣款前写档失败保持余额，扣款后断电只给原槽补发一次',async()=>{
  const store=new Map();globalThis.localStorage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_,callback)=>Promise.resolve().then(callback)}}});
  const source=newGame(31),game=newGame(32),account=wallet(),key='dyson-metadata-v1';
  source.meta.peak[0]=12;postPeak(account,source);store.set(key,JSON.stringify(account));
  const order={item:blue,quantity:7};
  await assert.rejects(redeem(game,'B',order,()=>{throw Error('配额已满');},()=>true),/配额已满/);
  assert.deepEqual(JSON.parse(store.get(key)),account);
  let disk;
  await assert.rejects(redeem(game,'B',order,(_,state)=>{if(disk)throw Error('意外关页');disk=JSON.stringify(state);},()=>true),/意外关页/);
  const paid=JSON.parse(store.get(key)),restored=decode(disk);
  assert.equal(holdings(paid,homeAddress(restored)).available[0],5);
  assert.equal(deliverClaims(paid,restored,'另一个槽'),false);
  assert.equal(deliverClaims(paid,restored,'B'),true);assert.equal(restored.bag[blue],7);
  assert.equal(deliverClaims(paid,decode(JSON.stringify(restored)),'B'),false);
});
