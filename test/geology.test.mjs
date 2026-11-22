import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {newGame,place,siteError} from '../src/actions.js';
import {bodyOf} from '../src/cluster.js';
import {axis,environments,key,makePlanet} from '../src/world.js';
import {geologySite,oceanBody,stone} from '../src/geology-lesson.js';
import {depart} from '../src/navigation.js';
import {applyGround,takeGroundChanges} from '../src/reform.js';
import {surfaceLife} from '../src/surface-life.js';
import {groundRadius} from '../src/reform-terrain.js';
import {STEP,tick} from '../src/simulation.js';
import {decode} from '../src/save.js';

const run=(game,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)tick(game);};

test('星历在不同种子下保留四种外星地质和相应的矿产',()=>{
  for(const seed of [1,747183,99999999]){
    const g=newGame(seed,'landing',32);
    for(const [index,biome] of ['sulfuria','aquatica','cyclonius','tropicana'].entries()){
      const body=bodyOf(g,'s'+(index+1)+':frontier');
      assert.equal(body.biome,biome);
      const p=makePlanet(body.seed,biome);
      if(biome==='aquatica')assert.ok(p.veins.some(v=>v.item===stone&&v.buried));
      if(biome==='cyclonius')assert.deepEqual(new Set(p.veins.filter(v=>/^(fractal-|kimberlite-|optical-grating-)/.test(v.item)).map(v=>v.item)),new Set(['kimberlite-ore','fractal-silicon','optical-grating-crystal']));
      if(biome==='sulfuria')assert.equal(environments[biome].ocean,'sulfuric-acid');
    }
  }
});

test('酸海到水世界的飞行、显矿、开采与异星读档守恒',()=>{
  const game=newGame(747183,'geology');
  run(game,38);
  assert.equal(game.stats.made.water,undefined);
  assert.ok(game.stats.made['sulfuric-acid']>20&&game.stats.made['titanium-alloy']>=4);
  depart(game,oceanBody,true);
  for(let i=0;i<120/STEP&&game.space.flight;i++)tick(game);
  assert.equal(game.space.current,oceanBody);
  const p=game.planet,site=geologySite(p),ore=()=>p.veins.reduce((sum,v)=>sum+(v.item===stone?v.amount:0),0);
  assert.match(siteError(game,'mining-machine',site.intake,0),/水下/);
  const before=ore(),soil=game.mecha.soil,foundations=game.bag.foundation;
  const plan=applyGround(game,site.center,3);
  assert.equal(plan.veins,9);assert.equal(game.mecha.soil,soil+plan.soil);assert.equal(plan.soil,-4817);
  assert.equal(game.bag.foundation,foundations-9);assert.equal(ore(),before);
  place(game,'mining-machine',site.intake,0);
  run(game,20);const restored=decode(JSON.stringify(game));run(game,20);run(restored,20);
  assert.deepEqual(game.stats,restored.stats);
  assert.deepEqual(game.planet.tiles,restored.planet.tiles);
  assert.equal(before-ore(),game.stats.mined[stone]);
  const out=game.planet.tiles[key(site.depot.x,site.depot.y)].output;
  assert.ok(out['carbon-nanotube']>=10);
});

test('首次铺地后石笋属于原分区包围球，掩埋与再次显露无需重建场景',()=>{
  const game=newGame(747183,'geology'),p=game.space.parked[oceanBody];
  game.space.current=oceanBody;game.planet=p;Object.assign(game.mecha,p.lastLanding);
  const decor=surfaceLife(p,(obj,x,y)=>obj.position.fromArray(axis(x,y)).multiplyScalar(groundRadius(p,x,y)));
  const position=new THREE.Vector3(),matrix=new THREE.Matrix4();
  const center=geologySite(p).center,initiallyHidden=[];
  // 施工区跨越分区边缘。记录实际掩埋的实例，不能假定它在最后一个网格的首位。
  for(const batch of decor.children){
    for(let index=0;index<batch.count;index++){
      batch.getMatrixAt(index,matrix);
      if(position.setFromMatrixPosition(matrix).lengthSq()===0)initiallyHidden.push({batch,index});
    }
  }
  function change(bury){
    applyGround(game,center,3,1,bury);decor.userData.reshape(takeGroundChanges(p));
    return initiallyHidden.filter(({batch,index})=>{
      batch.getMatrixAt(index,matrix);position.setFromMatrixPosition(matrix);
      if(position.lengthSq()===0)return false;
      assert.ok(position.length()>50&&batch.boundingSphere.containsPoint(position));return true;
    });
  }
  const exposed=change(false);
  assert.equal(exposed.length,9*5);
  assert.equal(change(true).length,0);
  assert.deepEqual(change(false),exposed);
});
