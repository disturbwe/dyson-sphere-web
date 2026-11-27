import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame} from '../src/actions.js';
import {STEP,tick} from '../src/simulation.js';
import {advanceLift,ceiling,heightOf,jumpFromGround,toggleFlight} from '../src/surface-motion.js';
import {leaveAtmosphere,advanceFlight,bodyOf,depart,positionAt,separation,setCourse,takeHelm,toggleWarp} from '../src/navigation.js';
import {approachRadius,groundContact,launchVector,pilotStep,traceLanding} from '../src/sail-pilot.js';
import {decode} from '../src/save.js';

const load=game=>decode(JSON.stringify(game));
const near=(actual,wanted,tolerance=1e-8)=>assert.ok(Math.abs(actual-wanted)<tolerance,actual+' 与 '+wanted+' 不符');

test('无科技也能起跳，空中不能续跳，弹道中途存读档能回到同一地块',()=>{
  const game=newGame(747183),mecha=game.mecha;
  mecha.target={x:3,y:0};mecha.mining=0;
  assert.equal(jumpFromGround(game),true);assert.equal(mecha.mining,null);assert.equal(mecha.target,null);
  for(let i=0;i<18;i++)tick(game);
  near(heightOf(mecha),3.6);assert.equal(jumpFromGround(game),false);
  assert.throws(()=>toggleFlight(game),/驱动引擎 I/);
  const copy=load(game);
  for(let i=0;i<20;i++){tick(game);tick(copy);}
  assert.deepEqual(copy,game);assert.equal(heightOf(mecha),0);assert.equal(mecha.lift,undefined);
});

test('推进器按固定步扣能量，失电自然回落；旧档悬浮可调高度并安全着陆',()=>{
  const game=newGame();game.techs.push('drive-engine-1');const mecha=game.mecha;
  toggleFlight(game);const initial=mecha.energy;
  for(let i=0;i<60;i++)advanceLift(game,STEP,1);
  near(initial-mecha.energy,2.4);const held=heightOf(mecha);assert.ok(held>18);
  advanceLift(game,STEP);near(heightOf(mecha),held);assert.deepEqual(load(game).mecha.lift,mecha.lift);
  mecha.energy=.01;advanceLift(game,STEP);assert.equal(mecha.flying,false);assert.ok(heightOf(mecha)<held);
  for(let i=0;i<100;i++)advanceLift(game,STEP);assert.equal(heightOf(mecha),0);
  mecha.flying=true;const old=load(game);near(heightOf(old.mecha),6.4);
  for(let i=0;i<30;i++)advanceLift(old,STEP,-1);assert.equal(old.mecha.flying,false);assert.equal(heightOf(old.mecha),0);
  mecha.lift={height:ceiling+1,target:ceiling};assert.throws(()=>load(game));
});

test('从指定经纬度驶离大气，门槛不足保留高度与能量，离轨只扣一次起飞费用',()=>{
  const game=newGame(137,'foundry');const body=bodyOf(game,'home');const mecha=game.mecha;
  game.techs.push('drive-engine-1');mecha.x=27.3;mecha.y=-14.1;toggleFlight(game);
  for(let i=0;i<210;i++)advanceLift(game,STEP,1);
  assert.equal(heightOf(mecha),ceiling);assert.equal(leaveAtmosphere(game),false);
  game.techs.push('drive-engine-2');mecha.energy=11.99;assert.equal(leaveAtmosphere(game),false);near(mecha.energy,11.99);
  mecha.energy=32;const origin=launchVector(game,body,heightOf(mecha));
  assert.equal(leaveAtmosphere(game),true);assert.equal(leaveAtmosphere(game),false);
  const flight=game.space.flight;assert.equal(flight.to,null);assert.deepEqual(flight.position,origin.position);
  near(separation(flight.position,positionAt(game,body)),250);near(mecha.energy,20);near(Math.hypot(...flight.heading),1);
  const site=groundContact(game,body,flight.heading,game.elapsed);near(site.x,27.3);near(site.y,-14.1);
  assert.equal(flight.travelled,0);assert.equal(mecha.lift,undefined);assert.deepEqual(load(game).space.flight,flight);
});

test('自由帆航按实付能源加速，能刹停存档，切换导航不会再次收费或替换出发工厂',()=>{
  const game=newGame(17,'foundry');game.techs.push('drive-engine-1','drive-engine-2');const factory=game.planet;
  game.mecha.flying=true;game.mecha.lift={height:ceiling,target:ceiling};assert.ok(leaveAtmosphere(game));
  const flight=game.space.flight,energy=game.mecha.energy;
  pilotStep(game,1,{boost:true});near(flight.speed,280);near(game.mecha.energy,energy-90);
  const endSpeed=flight.speed+game.mecha.energy/.5;pilotStep(game,1,{boost:true});near(flight.speed,endSpeed);near(game.mecha.energy,0);
  flight.speed=0;const before=flight.position.slice();advanceFlight(game,STEP);assert.deepEqual(flight.position,before);
  const copy=load(game);assert.deepEqual(copy.space.flight,flight);
  for(const state of [game,copy]){
    const stateFlight=state.space.flight;state.mecha.energy=50;setCourse(state,'inner');takeHelm(state);near(Math.hypot(...stateFlight.heading),1);
    setCourse(state,'home');near(state.mecha.energy,50);
    for(let i=0;i<600&&state.space.flight;i++)tick(state);
    assert.equal(state.space.flight,null);assert.equal(state.space.current,'home');assert.deepEqual(Object.keys(state.space.parked),[]);
  }
  assert.strictEqual(game.planet,factory);assert.deepEqual(copy,game);assert.deepEqual(load(game),game);
});

test('跨过移动星球的单步航段落在首个接触点，近陌生行星开曲速也必须脱离重力井',()=>{
  const game=newGame(747183,'sandbox');depart(game,'inner');const f=game.space.flight;takeHelm(game);
  game.elapsed=50;const body=bodyOf(game,'inner');const center0=positionAt(game,body,game.elapsed-STEP),center=positionAt(game,body);
  f.position=[center[0],center[1]+620,center[2]];const stock=game.bag['space-warper'],energy=game.mecha.energy;
  assert.throws(()=>toggleWarp(game),/1,000 m/);assert.equal(game.bag['space-warper'],stock);near(game.mecha.energy,energy);
  f.position[1]+=1000;toggleWarp(game);assert.equal(game.bag['space-warper'],stock-1);toggleWarp(game);
  // 两端均在球外，中间穿过直径。转成相对移动天体的线段以后，首次接触点应在法线的正 Y 半球。
  const start=[center0[0],center0[1]+900,center0[2]],end=[center[0],center[1]-900,center[2]];
  const hit=traceLanding(game,start,end,STEP);assert.equal(hit.body.id,body.id);near(hit.fraction,(900-approachRadius(body))/1800);
  const pole=groundContact(game,body,[0,1,0],game.elapsed-STEP+hit.fraction*STEP);near(hit.site.x,pole.x);near(hit.site.y,pole.y);
  f.position=start;f.heading=[0,-1,0];f.warp=true;f.speed=60000;advanceFlight(game,STEP);
  assert.equal(game.space.current,'inner');assert.equal(game.space.flight,null);assert.ok(game.space.parked.home);
  assert.ok(Math.abs(game.mecha.y-hit.site.y)<.5);assert.deepEqual(load(game),game);
});
