import test from 'node:test';
import assert from 'node:assert/strict';
import {SphereGeometry,Quaternion,Vector3} from 'three';
import {terrainSectors} from '../src/surface-sectors.js';
import {layerPeriod,layerRotation} from '../src/layer-orbit.js';
import {skyAt,stellarUp,sunCosine,photovoltaicFactor,orbitalPosition} from '../src/ephemeris.js';
import {bodyOf} from '../src/cluster.js';
import {newGame} from '../src/actions.js';
import {tick} from '../src/simulation.js';
import {panelReading} from '../src/grid-power.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' 与 '+b+' 不符');

test('跨两极裁剪后完整恢复原来的三角面和绕序，相机不动时不重新上传',()=>{
  const cols=36,rows=18,geometry=new SphereGeometry(51,cols,rows);
  const winding=list=>Array.from({length:list.length/3},(_,i)=>list.slice(i*3,i*3+3).join(',')).sort();
  const originals=winding(geometry.index.array.slice());
  const update=terrainSectors(geometry,cols,rows),north={sees:p=>p.direction.y>.8};
  update(north);
  const partial=geometry.drawRange.count,version=geometry.index.version;
  assert.ok(partial>0&&partial<originals.length*3);
  update(north);assert.equal(geometry.index.version,version);
  update({sees:()=>false});assert.equal(geometry.drawRange.count,0);
  update({sees:()=>true});assert.equal(geometry.drawRange.count,originals.length*3);
  assert.deepEqual(winding(geometry.index.array),originals);geometry.dispose();
});

test('旋转壳层在纪元吻合设计，四分之一周扫过直角，一整周恢复',()=>{
  const layer={radius:12000,tilt:47,longitude:85,epoch:123.456},primary={period:400,radius:24000};
  const period=layerPeriod(layer,primary);near(period,400*Math.sqrt(.125));
  const orient=t=>layerRotation(new Quaternion(),layer,t,primary);
  const x=t=>new Vector3(1,0,0).applyQuaternion(orient(t));
  const up=t=>new Vector3(0,1,0).applyQuaternion(orient(t));
  near(x(layer.epoch).dot(x(layer.epoch+.25*period)),0);
  near(x(layer.epoch).dot(x(layer.epoch+period)),1);
  near(up(layer.epoch).y,Math.cos(47*Math.PI/180));
  near(up(0).dot(up(600)),1);
});

test('卫星继承母星公转，全局太阳投影等于当地天顶读数，晨昏供电与实际电网相符',()=>{
  const g=newGame(747183,'sandbox'),home=bodyOf(g,'home'),parent=bodyOf(g,home.parent),tile=g.planet.tiles['2,1'];
  assert.ok(parent);
  const gains=[];
  for(const time of [0,142,155,507,515]){
    g.elapsed=time;tick(g);
    const sky=skyAt(g,home),sun=new Vector3(...sky.origin).normalize().negate();
    const starUp=new Vector3(...stellarUp(tile,sky)),local=sunCosine(tile,sky),gain=photovoltaicFactor(local);
    near(starUp.dot(sun),local);
    near(new Vector3(...sky.origin).distanceTo(new Vector3(...orbitalPosition(g,parent))),home.radius);
    const actual=panelReading(tile);near(actual.available,360*gain);
    assert.ok(actual.delivered<=actual.available&&actual.delivered>=0);gains.push(gain);
  }
  assert.equal(gains[0],1);assert.ok(gains[1]>0&&gains[1]<.10);assert.equal(gains[2],0);
  assert.ok(gains[3]>.85&&gains[3]<.90);assert.equal(gains[4],1);
});
