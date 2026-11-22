import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {belts,stores,smelters,assemblers,poles} from './catalog.js';
import {levelRise} from './belt-level.js';
import {assemblyModel,smelterModel,chemicalModel,sorterPart} from './workshop-models.js';
import {miningGantry} from './mine-model.js';
import {populateFogModel} from './fog-models.js';

const mats=new Map();
const geo={box:new T.BoxGeometry(1,1,1),round:new T.CylinderGeometry(.5,.5,1,12),cone:new T.ConeGeometry(.5,1,6),orb:new T.IcosahedronGeometry(.5,1),hoop:new T.TorusGeometry(.5,.032,5,36).rotateX(Math.PI/2),disc:new T.CylinderGeometry(.5,.5,1,36)};
// 电池片四角切平，沿白色基板露出串接缝。九片共用同一截面并由工厂模型统一批绘。
const cellShape=new T.Shape();
for(const [i,[x,y]] of [[-.38,-.5],[.38,-.5],[.5,-.38],[.5,.38],[.38,.5],[-.38,.5],[-.5,.38],[-.5,-.38]].entries()){
  if(i===0)cellShape.moveTo(x,y);else cellShape.lineTo(x,y);
}
cellShape.closePath();
geo.solarCell=new T.ExtrudeGeometry(cellShape,{depth:1,bevelEnabled:false}).translate(0,0,-.5).rotateX(-Math.PI/2);
const steel='#435562',base='#263946',white='#d1d7cb',amber='#ed9950',cyan='#58e4df',blue='#56799c';
function material(color,glow){const k=color+glow;if(!mats.has(k))mats.set(k,new T.MeshStandardMaterial({color,roughness:.62,metalness:.32,emissive:glow?color:0,emissiveIntensity:.85}));return mats.get(k);}
function part(parent,shape,color,x,y,z,sx,sy,sz,glow=false){const mesh=new T.Mesh(geo[shape],material(color,glow));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;}
function box(g,c,x,y,z,a,b,d,e){return part(g,'box',c,x,y,z,a,b,d,e);}
function cyl(g,c,x,y,z,r,h,e){return part(g,'round',c,x,y,z,r,h,r,e);}
function footing(g){box(g,base,0,.08,0,1.45,.16,1.28);for(const x of [-.57,.57])for(const z of [-.5,.5])box(g,white,x,.18,z,.23,.20,.23);}
function stripe(g,color,y=.28){for(const z of [-.57,.57])box(g,color,0,y,z,.95,.075,.06,true);}
/** 地热井使用护盖与三条埋入岩浆的支腿；枢纽的白色撑臂围成开放电场，保证远看也能分清充电与发电设备。 */
function energyEquipment(g,type){
  if(type==='accumulator'||type==='accumulator-full'){
    cyl(g,steel,0,.76,0,.69,1.11);
    for(const x of [-.40,.40])for(const z of [-.39,.39]){
      cyl(g,white,x,.78,z,.15,1.13);cyl(g,blue,x,.31,z,.23,.24);
    }
    for(const h of [.36,.52,.73,.94,1.16])cyl(g,h===.73?cyan:blue,0,h,0,.74,.058,h===.73);
    box(g,white,0,1.40,0,1.04,.20,.99);cyl(g,base,0,1.60,0,.39,.23);cyl(g,amber,0,1.74,0,.24,.085);return true;
  }
  if(type==='geothermal-power-station'){
    cyl(g,steel,0,.44,0,.93,.61);cyl(g,white,0,.81,0,1.02,.17);
    cyl(g,'#774139',0,1.28,0,.68,.86);
    for(const h of [1.01,1.17,1.34,1.51])cyl(g,'#ff922c',0,h,0,.71,.065,true);
    cyl(g,base,0,1.78,0,.85,.21);cyl(g,blue,0,1.91,0,.71,.08);
    for(let i=0;i<3;i++){
      const arm=new T.Group();arm.rotation.y=i*Math.PI*2/3;g.add(arm);
      const beam=box(arm,'#788b9a',.55,.48,0,.29,.94,.33);beam.rotation.z=-.53;
      box(arm,amber,.76,.22,0,.38,.12,.40);box(arm,base,.73,.11,0,.48,.19,.45);
      box(arm,white,.32,1.32,0,.14,.96,.14);
    }
    cyl(g,steel,-.26,1.83,.21,.11,.77);cyl(g,amber,-.26,2.27,.21,.15,.15);return true;
  }
  if(type!=='energy-exchanger')return false;
  cyl(g,white,0,.36,0,1.27,.36);cyl(g,base,0,.65,0,.85,.36);
  cyl(g,blue,0,1.15,0,.39,1.02);part(g,'orb','#9edcf6',0,1.68,0,.28,.28,.28,true);
  for(let i=0;i<4;i++){
    const arm=new T.Group();arm.rotation.y=(i+.5)*Math.PI/2;g.add(arm);
    const strut=box(arm,white,.62,1.04,0,.15,1.33,.22);strut.rotation.z=-.56;
    const rib=box(arm,steel,.81,.94,0,.12,1.11,.17);rib.rotation.z=.26;
    box(arm,'#83deef',.96,1.57,0,.14,.15,.20,true);
    const arc=box(arm,cyan,.49,1.60,0,.91,.019,.022,true);arc.rotation.z=-.12;
    box(arm,base,.55,.29,0,.55,.29,.42);box(arm,amber,.80,.33,0,.09,.15,.30);
  }
  part(g,'hoop','#77c7e7',0,1.51,0,1.89,1,1.89,true);return true;
}
/** 根据承压罐、抽油桅杆、蒸馏塔与氢回流弯管塑造轮廓。机头沿本地 +X，与模拟中的正面出料口一致。 */
function fluidEquipment(g,type){
  const enamel='#b8c5c4',pipe='#323d47',band='#7097a2',signal='#79e4ed';
  function tube(x,y,z,diameter,length,axis='y',color=pipe){
    const p=cyl(g,color,x,y,z,diameter,length);
    if(axis==='x')p.rotation.z=Math.PI/2;
    if(axis==='z')p.rotation.x=Math.PI/2;
    return p;
  }
  if(type==='storage-tank'){
    // 卧式罐的支座和束带略突出于筒壁，垂直加建后从侧面仍能辨认每一层。
    tube(0,.79,0,.94,1.23,'x','#4c91a8');
    for(const x of [-.56,-.17,.17,.56])tube(x,.79,0,.98,.066,'x',x*x>.2?enamel:band);
    for(const x of [-.63,.63]){tube(x,.79,0,.86,.09,'x',enamel);tube(x*1.1,.78,0,.45,.05,'x',steel);}
    for(const x of [-.4,.4]){box(g,steel,x,.27,0,.25,.19,1.12);box(g,enamel,x,.44,0,.20,.36,.92);}
    tube(-.23,1.27,0,.20,.18,'y',enamel);cyl(g,amber,-.23,1.38,0,.27,.06);
    for(const z of [-.55,.55])box(g,cyan,0,.76,z,.62,.045,.024,true);
    return true;
  }
  if(type==='oil-extractor'){
    for(const side of [-1,1]){
      const shaft=side*.40;
      cyl(g,steel,shaft,.52,.06,.39,.67);cyl(g,enamel,shaft,1.22,.06,.29,1.02);
      cyl(g,band,shaft,1.69,.06,.41,.13);tube(shaft,1.93,.06,.16,.39,'y',pipe);
      tube(shaft,2.11,.06,.24,.09,'y',amber);
      box(g,steel,shaft,.53,-.38,.42,.55,.28);box(g,white,shaft,.80,-.38,.46,.12,.31);
    }
    tube(0,.51,-.36,.14,1.28,'x',band);tube(.63,.39,0,.23,.34,'x');
    cyl(g,steel,-.48,1.59,-.39,.12,2.47);cyl(g,amber,-.48,2.77,-.39,.18,.16);
    part(g,'cone','#ff9356',-.48,2.95,-.39,.12,.31,.12,true);return true;
  }
  if(type==='oil-refinery'){
    const x=-.32,z=-.18;
    tube(x,1.37,z,.53,2.33,'y','#85989f');
    for(const [i,y] of [.51,.96,1.35,1.75,2.14,2.48].entries()){
      cyl(g,pipe,x,y,z,.65,.09);cyl(g,i%2?enamel:'#c9a269',x,y+.073,z,.63,.045);
    }
    part(g,'cone',enamel,x,2.67,z,.54,.27,.54);
    for(const pos of [[.25,-.31],[.43,.26],[-.28,.39]]){
      const [px,pz]=pos;tube(px,.63,pz,.29,.78,'y',enamel);tube(px,1.19,pz,.13,.42,'y',band);
    }
    for(const y of [.69,1.38,2.12]){tube(.09,y,z,.07,.42,'x',pipe);tube(.3,y-.19,z,.07,.42,'y',pipe);}
    for(let y=.39;y<2.45;y+=.19)box(g,amber,x-.22,y,z+.30,.20,.034,.05);
    box(g,steel,x-.33,1.43,z+.30,.033,2.19,.048);box(g,steel,x-.11,1.43,z+.30,.033,2.19,.048);return true;
  }
  if(type==='fractionator'){
    box(g,enamel,0,.25,0,1.54,.25,1.38);
    for(const z of [-.48,.48]){
      tube(-.30,.88,z,.41,1.12,'y','#738b73');cyl(g,pipe,-.3,1.39,z,.44,.13);
      tube(.39,.61,z,.25,.64,'y',band);cyl(g,enamel,.39,.95,z,.30,.14);
      tube(0,.38,z*1.43,.22,.23,'z',pipe);
    }
    tube(-.21,1.62,0,.68,.71,'x',enamel);tube(-.50,1.62,0,.72,.14,'x',pipe);
    tube(.21,1.62,0,.27,.32,'x',pipe);tube(.42,1.26,0,.20,.76,'y',pipe);
    tube(.43,.84,0,.22,.16,'y',signal);tube(.58,.43,0,.27,.38,'x',band);
    for(const x of [-.03,.30])tube(x,1.62,0,x<0?.70:.30,.08,'x',band);return true;
  }
  return false;
}
/** 返回本地 +Y 朝上的设施模型。旋转节点单独标记，渲染器只更新会动的部件。 */
export function facility(type){
  const g=new T.Group();
  if(type.startsWith('arm/')){const [,section,id]=type.split('/');return sorterPart(g,section,id,{box});}
  if((type.startsWith('fog-')||type.startsWith('df-'))&&populateFogModel(g,type,{part,box,cyl,material}))return g;
  if(type==='holo-beacon'){
    // 三只外倾发射爪包围投影源，设施本体参与工厂批绘；离线时仍能从地面找到底座。
    cyl(g,base,0,.16,0,.68,.25);cyl(g,white,0,.46,0,.43,.46);cyl(g,steel,0,.74,0,.47,.18);
    for(let i=0;i<3;i++){
      const claw=new T.Group();claw.rotation.y=i*Math.PI*2/3;g.add(claw);
      const leg=box(claw,white,0,.24,.29,.16,.42,.23);leg.rotation.x=.30;
      const rail=box(claw,steel,0,.89,.21,.085,.49,.12);rail.rotation.x=.35;
      box(claw,'#9ac77a',0,1.09,.26,.08,.10,.08,true);
    }
    cyl(g,'#c1f79a',0,.90,0,.28,.11,true);return g;
  }
  if(type.startsWith('depot-roof/')){
    const [,baseType,levelText]=type.split('/');
    const levels=Number(levelText);
    // 同一栋仓只保留一个停机坪，扩层时把整个坪抬到顶层，仓间净高与货物交接高度相同。
    for(let floor=0;floor<levels;floor++){
      const level=facility(baseType);level.position.y=floor*1.16;g.add(level);
    }
    const roof=facility('logistics-distributor');roof.position.y=levels*1.16;g.add(roof);return g;
  }
  if(type==='logistics-distributor'){
    box(g,base,0,.10,0,1.04,.19,.91);
    const red='#bd5b42';
    for(const side of [-1,1]){
      const brace=box(g,red,side*.40,.22,0,.12,.52,.72);brace.rotation.z=-side*.31;
      const wing=box(g,white,side*.35,.50,.02,.65,.12,.92);wing.rotation.z=side*.15;
      box(g,steel,side*.56,.58,.04,.08,.08,.71);
      for(const z of [-.27,.14])box(g,cyan,side*.51,.61,z,.09,.035,.14,true);
      box(g,red,side*.38,.28,.49,.42,.08,.08);
    }
    cyl(g,steel,0,.51,.04,.48,.11);part(g,'hoop',cyan,0,.58,.04,.39,1,.39,true);
    cyl(g,base,-.43,.78,-.27,.054,.46);cyl(g,white,-.43,1.02,-.27,.06,.05);
    return g;
  }
  if(type==='spray-coater'||type.includes('-coated')){
    if(type.includes('-coated'))g.add(facility(type.split('-coated')[0]));
    // 下孔沿带向保持通透，上孔横穿喷头背部。斜撑和筒形储罐让两个入口从地表视角就能辨认。
    for(const z of [-.49,.49]){
      box(g,base,0,.18,z,1.50,.22,.21);
      const strut=box(g,white,-.20,.63,z,.17,.99,.23);strut.rotation.z=-.56;
      box(g,white,.42,.58,z,.23,.83,.23);
    }
    box(g,steel,.25,.94,0,.79,.14,1.48);
    for(const x of [.03,.51])for(const z of [-.42,.42])box(g,white,x,1.22,z,.09,.50,.12);
    box(g,white,.27,1.51,0,.73,.14,1.08);box(g,base,.24,1.61,0,.55,.05,.80);
    cyl(g,steel,-.35,1.08,0,.57,.18);const reservoir=new T.Group();reservoir.position.set(-.35,1.34,0);g.add(reservoir);g.userData.core=reservoir;
    cyl(reservoir,'#ffffff',0,0,0,.49,.43,true);
    cyl(g,white,-.35,1.60,0,.56,.10);cyl(g,steel,-.35,1.68,0,.45,.07);
    for(const z of [-.53,.53])box(g,amber,-.26,.49,z,.31,.09,.045);
    return g;
  }
  if(type==='traffic-monitor'||type.endsWith('-metered')){
    // 表头跨在带面上，正中保留四层货物的净空。信号面独立合批，换色无需重建整格。
    if(type.endsWith('-metered'))g.add(facility(type.slice(0,-8)));
    for(const z of [-.47,.47]){
      box(g,steel,0,.65,z,.50,1.18,.13);box(g,white,0,1.12,z,.56,.28,.18);
    }
    box(g,white,0,1.36,0,.66,.20,1.19);box(g,base,0,1.48,0,.55,.055,.87);
    const lamp=new T.Group();g.add(lamp);g.userData.core=lamp;
    for(const x of [-.17,0,.17])box(lamp,'#ffffff',x,1.519,0,.10,.018,.70,true);
    for(const z of [-.575,.575]){
      box(g,base,0,1.06,z,.57,.43,.03);
      for(let row=0;row<2;row++)for(let col=0;col<3;col++)box(lamp,'#ffffff',(col-1)*.14,1.14-row*.14,z*1.04,.09,.08,.03,true);
    }
    return g;
  }
  if(type==='automatic-piler'){
    // 高端平台与低端斜槽给出真实带向线索，蓝色人字灯由低到高排列。
    box(g,base,0,.13,0,1.64,.22,1.17);
    for(const z of [-.47,.47]){
      box(g,steel,.28,.64,z,.67,.92,.19);box(g,white,.48,.82,z,.43,.83,.22);
      const cheek=box(g,white,-.25,.69,z,.95,.27,.24);cheek.rotation.z=.64;
      box(g,'#959fa7',.28,1.23,z,.66,.18,.22);
    }
    const ramp=new T.Group();ramp.position.set(-.18,.72,0);ramp.rotation.z=.64;g.add(ramp);
    box(ramp,steel,0,0,0,1.33,.17,.76);box(ramp,'#203957',0,.105,0,1.21,.05,.59);
    for(const x of [-.43,.02,.46])for(const z of [-.13,.13]){
      const chevron=box(ramp,'#5ab7ff',x,.145,z,.085,.038,.35,true);chevron.rotation.y=z<0?.68:-.68;
    }
    box(g,steel,.48,1.22,0,.51,.24,.82);for(const x of [.31,.46,.61])box(g,'#283540',x,1.35,0,.073,.031,.62);
    return g;
  }
  if(type==='orbital-collector'){
    // 悬挂式泵舱在宽码头下方，两圈码头之间留出泊船通道。机体底部的电离光晕位于云层上方。
    part(g,'orb','#547188',0,.53,0,1.54,1.33,1.54);cyl(g,base,0,1.48,0,1.26,1.56);
    for(const height of [.34,.74,1.81])cyl(g,white,0,height,0,1.45,.15);
    part(g,'disc',blue,0,2.32,0,3.39,.21,3.39);part(g,'disc',white,0,2.52,0,3.64,.19,3.64);
    part(g,'disc',base,0,2.63,0,3.35,.09,3.35);cyl(g,white,0,2.79,0,1.06,.28);
    for(let i=0;i<10;i++){
      const bay=new T.Group();bay.rotation.y=i*Math.PI/5;g.add(bay);
      box(bay,steel,1.22,2.69,0,.60,.09,.43);box(bay,white,1.43,2.73,0,.19,.06,.44);
      box(bay,cyan,1.61,2.48,0,.07,.045,.25,true);
      if(i%2===0){const arm=box(bay,'#ac7255',.62,1.61,0,.19,1.25,.21);arm.rotation.z=-.21;}
    }
    cyl(g,cyan,0,-.18,0,.73,.12,true);part(g,'hoop','#67a8ef',0,-.36,0,1.03,.67,1.03,true);
    return g;
  }
  if(belts.includes(type)||type.startsWith('ramp/')){
    const [,kind,entry,exit]=type.split('/'),belt=kind||type;
    const rail=['#edb147','#67ad72','#5faccb'][belts.indexOf(belt)];
    // 以节点中心把带面分成两半。拱顶前半爬坡、后半下坡，直连两端会削平最高点并让货物悬空。
    for(const side of [-1,1]){
      const slope=(Number(side<0?entry:exit)||0)*levelRise/1.8;
      const run=new T.Group();run.position.set(side*.45,side*.45*slope,0);
      run.rotation.z=Math.atan(slope);run.scale.x=Math.hypot(1,slope);g.add(run);
      box(run,base,0,.075,0,.90,.14,.73);box(run,'#414b4d',0,.172,0,.90,.065,.53);
      for(const z of [-.326,.326]){box(run,rail,0,.184,z,.90,.095,.058);}
      // 暗色分节带芯、彩色侧轨及浅色方向纹来自三档带的实际地表轮廓。
      for(const x of [-.29,.16])box(run,'#303a3a',x,.209,0,.018,.009,.48);
      for(const z of [-.062,.062]){const mark=box(run,'#91a39e',0,.216,z,.039,.014,.16);mark.rotation.y=z<0?-.68:.68;}
    }
    return g;
  }
  if(type==='advanced-mining-machine')return miningGantry(g,{box,cyl,part});
  footing(g);
  if(type==='splitter'||type==='splitter-with-depot'){
    // 四侧的门洞对齐传送带。顶仓是独立的可拆件，底座几何与单层分流器完全相同。
    box(g,steel,0,.42,0,1.26,.61,1.26);
    for(let side=0;side<4;side++){
      const face=new T.Group();face.rotation.y=side*Math.PI/2;g.add(face);
      box(face,'#182730',0,.37,.642,.82,.43,.045);
      for(const x of [-.46,.46]){
        box(face,'#adb6b3',x,.41,.67,.16,.55,.13);
        box(face,amber,x,.66,.67,.16,.055,.14);
      }
      box(face,white,0,.68,.67,.85,.11,.14);
      box(face,'#75c8cf',0,.25,.676,.51,.03,.02,true);
    }
    box(g,'#c3c9c2',0,.78,0,1.38,.15,1.38);
    box(g,base,0,.875,0,.83,.065,.83);
    for(const x of [-.48,.48])box(g,white,x,.9,0,.27,.11,1.01);
    if(type==='splitter-with-depot'){
      const depot=facility('storage-1');depot.position.y=.91;g.add(depot);
    }
    return g;
  }
  if(energyEquipment(g,type)||fluidEquipment(g,type))return g;
  if(type==='miniature-particle-collider') {
    // 对撞机由偏置的两座磁极支撑上方加速环。环内留空，斜看时能辨清支座、束流管和中央焦点。
    part(g,'disc',steel,0,.29,0,1.58,.22,1.36);
    for(const [x,z,height] of [[-.53,.20,1.22],[.36,-.22,2.13]]) {
      part(g,'disc',white,x,.46,z,.67,.15,.65);
      cyl(g,base,x,.51+height/2,z,.31,height);
      for(const step of [.15,.45,.77]) {
        cyl(g,blue,x,.47+step*height,z,.40,.13);
        part(g,'hoop','#72b6eb',x,.55+step*height,z,.38,.71,.38,true);
      }
      part(g,'disc',white,x,height+.53,z,.85,.10,.85);
      part(g,'hoop',blue,x,height+.61,z,.77,.90,.77);
      cyl(g,steel,x,height+.65,z,.16,.32);
    }
    const ringX=.30,ringZ=-.18;
    part(g,'hoop',white,ringX,2.90,ringZ,1.36,2.35,1.36);
    part(g,'hoop','#73bfff',ringX,2.86,ringZ,1.23,1,1.23,true);
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4;
      const magnet=box(g,steel,ringX+.65*Math.cos(angle),2.90,ringZ+.65*Math.sin(angle),.18,.13,.28);
      magnet.rotation.y=-angle;
    }
    cyl(g,cyan,ringX,2.90,ringZ,.053,.58,true);
    return g;
  }
  if(type==='vertical-launching-silo') {
    cyl(g,steel,0,.38,0,1.25,.55);cyl(g,white,0,1.02,0,.52,1.15);
    part(g,'cone',amber,0,1.83,0,.52,.51,.52);
    for(const side of [-1,1]){box(g,steel,side*.52,1.22,0,.16,2.16,.20);box(g,amber,side*.37,1.93,0,.35,.15,.20);}
    cyl(g,cyan,0,.67,0,.72,.10,true);return g;
  }
  if(type==='em-rail-ejector') {
    cyl(g,steel,0,.45,0,1.05,.62);const cradle=new T.Group();g.add(cradle);cradle.position.y=.88;cradle.rotation.z=.65;
    for(const side of [-1,1]){box(cradle,white,.44,.12,side*.22,1.95,.16,.14);box(cradle,cyan,.42,.23,side*.22,1.8,.045,.07,true);}
    box(cradle,amber,-.39,.02,0,.68,.51,.65);return g;
  }
  if(type==='ray-receiver') {
    cyl(g,white,0,.54,0,.59,.87);cyl(g,steel,0,.99,0,1.19,.19);
    for(let i=0;i<8;i++){const petal=new T.Group();petal.position.y=1.02;petal.rotation.y=i*Math.PI/4;g.add(petal);const blade=box(petal,blue,.52,.22,0,.85,.12,.39);blade.rotation.z=.52;}
    cyl(g,amber,0,1.35,0,.14,.76);part(g,'orb',cyan,0,1.82,0,.29,.29,.29,true);return g;
  }
  if(type==='planetary-logistics-station'||type==='interstellar-logistics-station'){
    const interstellar=type==='interstellar-logistics-station',h=interstellar?6.4:4.15,w=interstellar?2.75:1.95;
    const alloy='#99acb2',dark='#223641',panel='#758994',navy='#335982',stripe='#f0aa55';
    // 纵向桁架、电梯主轴、环形泊位分别建立轮廓。行星塔和星际塔可从地平线凭冠部宽度与层数辨认。
    part(g,'disc',dark,0,.23,0,1.65,.35,1.65);part(g,'disc',alloy,0,.43,0,1.40,.16,1.40);
    cyl(g,dark,0,h*.46,0,.56,h*.8);
    for(let i=0;i<4;i++){
      const shaft=new T.Group();shaft.rotation.y=i*Math.PI/2+.785;g.add(shaft);
      box(shaft,alloy,0,h*.43,.33,.21,h*.68,.16);box(shaft,navy,0,h*.47,.429,.14,h*.31,.07);
      for(const n of [0,1]){const leg=box(shaft,dark,0,.83+n*.80,.54-n*.11,.25,.98,.22);leg.rotation.x=-.24;}
      box(shaft,cyan,0,h*.46,.47,.042,h*.21,.026,true);
      box(shaft,dark,0,.34,.77,.39,.46,.48);box(shaft,stripe,0,.51,.81,.40,.07,.46);
    }
    for(const level of [.24,.42,.68,.78]){cyl(g,dark,0,h*level,0,.85,.16);cyl(g,alloy,0,h*level+.09,0,.77,.045);}
    const bays=interstellar?10:6;
    part(g,'disc',dark,0,h-.47,0,w*.55,.31,w*.55);
    part(g,'disc',navy,0,h-.12,0,w*.94,.20,w*.94);
    part(g,'disc',alloy,0,h+.012,0,w,.11,w);
    for(let i=0;i<bays;i++){
      const bay=new T.Group();bay.rotation.y=i*2*Math.PI/bays;g.add(bay);
      const brace=box(bay,alloy,0,h-.59,w*.285,.12,1.03,.16);brace.rotation.x=.65;
      box(bay,panel,0,h+.10,w*.379,w*.22,.12,w*.22);box(bay,dark,0,h+.173,w*.385,w*.17,.05,w*.18);
      for(const side of [-1,1])box(bay,interstellar?'#8edcff':'#7edbd0',side*w*.073,h+.20,w*.38,.035,.018,w*.14,true);
      box(bay,stripe,0,h-.24,w*.452,.18,.16,.08);
    }
    part(g,'hoop',alloy,0,h-.19,0,w,1,w);part(g,'hoop',dark,0,h+.09,0,w*.63,1,w*.63);
    cyl(g,navy,0,h+.18,0,w*.38,.36);cyl(g,alloy,0,h+.39,0,w*.25,.11);
    if(interstellar){cyl(g,dark,-.28,h+.41,.20,.095,.52);part(g,'orb',cyan,-.28,h+.68,.20,.09,.08,.09,true);}
    return g;
  }
  if(type==='wind-turbine'){
    const frame='#d56b4e',foil='#c4d1ce';
    part(g,'disc',steel,0,.27,0,.96,.29,.96);part(g,'disc',frame,0,.44,0,1.04,.12,1.04);
    cyl(g,blue,0,1.81,0,.15,2.83);cyl(g,white,0,3.21,0,.28,.13);
    const hub=new T.Group();g.add(hub);hub.position.y=.55;g.userData.rotor=hub;
    // 原机型绕竖轴旋转。三片翼沿高度扭转，拼成宽中段、收窄的上下端；固定支架不会跟叶片转动。
    for(let wing=0;wing<3;wing++){
      for(let band=0;band<9;band++){
        const v=(band+.5)/9,az=wing*Math.PI*2/3+v*1.42,r=.20+.22*Math.sin(Math.PI*v);
        const mount=new T.Group();mount.rotation.y=az;hub.add(mount);
        const blade=box(mount,band%3===0?'#aebec0':foil,r,v*2.54,0,.072,.30,.38);blade.rotation.x=-.21;
        box(mount,frame,r,v*2.54,.19,.083,.295,.045).rotation.x=-.21;
      }
    }
    for(const top of [.55,3.02]){cyl(g,steel,0,top,0,.57,.105);cyl(g,frame,0,top+.062,0,.50,.043);}
    return g;
  }
  if(poles.includes(type)){
    cyl(g,white,0,.36,0,.64,.55);part(g,'cone',steel,0,1.14,0,.58,1.5,.58);cyl(g,steel,0,1.8,0,.12,1.03);
    for(let i=0;i<3;i++)cyl(g,i%2?cyan:blue,0,1.56+i*.22,0,.58-i*.08,.12,i%2);part(g,'orb',cyan,0,2.30,0,.28,.29,.28,true);return g;
  }
  if(type==='mining-machine'){
    box(g,blue,-.16,.48,0,1.32,.6,1.12);box(g,white,.2,.80,0,.89,.23,.82);box(g,amber,.74,.42,0,.54,.37,.6);
    for(const z of [-.47,0,.47]){const boom=box(g,amber,-.79,.60,z,1,.17,.18);boom.rotation.z=.27;part(g,'cone',steel,-1.23,.31,z,.36,.58,.36).rotation.z=Math.PI;cyl(g,cyan,-1.21,.50,z,.34,.08,true);}
    stripe(g,cyan);return g;
  }
  if(smelters.includes(type))return smelterModel(g,type,{box,cyl,part});
  if(assemblers.includes(type))return assemblyModel(g,type,{box,cyl});
  if(type==='chemical-plant'||type==='quantum-chemical-plant')return chemicalModel(g,type==='quantum-chemical-plant',{box,cyl,part});
  if(type.includes('power-plant')||type==='artificial-star'){
    cyl(g,steel,0,.45,0,1.24,.62);cyl(g,blue,0,.93,0,.88,.55);cyl(g,'#ffc579',0,1.21,0,.91,.12,true);part(g,'cone',white,0,1.42,0,.90,.46,.9);
    for(const x of [-.48,.48]){cyl(g,steel,x,1.12,-.33,.24,1.48);cyl(g,amber,x,1.73,-.33,.30,.16);}return g;
  }
  if(type.endsWith('lab')){
    cyl(g,white,0,.40,0,1.37,.45);cyl(g,blue,0,.70,0,1.03,.27);
    const core=part(g,'box','#4edaf7',0,1.25,0,.57,.57,.57,true);core.rotation.set(.66,.66,.66);g.userData.core=core;
    for(const x of [-.45,.45])for(const z of [-.45,.45])cyl(g,white,x,1.13,z,.10,.90);cyl(g,blue,0,1.64,0,1.26,.13);cyl(g,cyan,0,1.73,0,.77,.06,true);return g;
  }
  if(type==='solar-panel'){
    // 原型的三乘三深蓝电池片装在白色背板上，青色铰链把整块面板举离四只支脚。
    for(const angle of [Math.PI/4,-Math.PI/4])box(g,white,0,.19,0,1.08,.10,.16).rotation.y=angle;
    cyl(g,steel,0,.36,0,.33,.32);cyl(g,blue,0,.64,0,.26,.48);
    cyl(g,cyan,0,.80,0,.34,.10,true);
    const panel=new T.Group();panel.position.y=1.04;panel.rotation.x=-.40;g.add(panel);g.userData.core=panel;
    box(panel,'#d4d6c5',0,0,0,1.65,.095,1.45);
    for(const x of [-1,0,1])for(const z of [-1,0,1]){
      const cell=part(panel,'solarCell',x===z?'#273756':'#344163',x*.52,.065,z*.455,.50,.045,.435);
      box(panel,'#7889a3',cell.position.x,.09,cell.position.z,.008,.004,.385);
    }
    box(panel,steel,0,-.10,0,.92,.12,.26);return g;
  }
  if(stores.includes(type)){
    box(g,white,0,.61,0,1.24,.84,1.01);for(const z of [-.53,.53]){box(g,steel,0,.61,z,1.22,.45,.08);for(const x of [-.38,0,.38])box(g,amber,x,.63,z*1.09,.10,.43,.06);}box(g,blue,0,1.08,0,1.37,.18,1.14);return g;
  }
  // 管线类设备共用耐压塔体，泵、精炼与化工按端口和塔高区分。
  const tall=type.includes('refinery')||type.includes('chemical');cyl(g,white,-.27,tall?1:.68,0,.60,tall?1.6:.85);cyl(g,blue,.34,.62,.12,.58,.78);
  for(const y of [.4,.8,1.2])cyl(g,amber,-.27,y,0,.64,.09);box(g,steel,0,.65,-.40,1.05,.19,.2);stripe(g,cyan);return g;
}
const robotMaterials=[new T.MeshStandardMaterial({vertexColors:true,metalness:.42,roughness:.46}),new T.MeshBasicMaterial({vertexColors:true})];
let robotPatterns;
function bakeJoint(root){
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),transform=new T.Matrix4(),pieces=[[],[]];
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    geometry.applyMatrix4(transform.multiplyMatrices(inverse,mesh.matrixWorld));
    const colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)mesh.material.color.toArray(colors,i);
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));pieces[mesh.material.emissive.getHex()?1:0].push(geometry);
  });
  return pieces.flatMap((sources,index)=>{
    if(!sources.length)return [];
    const shape=mergeGeometries(sources);for(const source of sources)source.dispose();
    return [{shape,material:robotMaterials[index]}];
  });
}
function robotParts(){
  const chest=new T.Group(),leg=new T.Group();
  const armor='#eea33e',edge='#c77d2c',graphite='#263340',joint='#475765',heat='#ffd983',light='#66dce9';
  function plate(parent,color,x,y,z,w,h,d,lean=0){const p=part(parent,'orb',color,x,y,z,w,h,d);p.rotation.z=lean;return p;}
  function badge(parent,color,x,y,z,r,h,lit=false){const disk=part(parent,'disc',color,x,y,z,r,h,r,lit);disk.rotation.x=Math.PI/2;return disk;}
  // 以腰部、双胯为刚体分界，同一套装甲用于地面和航行。每块只区分反光金属与自发光端口。
  plate(chest,graphite,0,1.20,0,.64,.69,.37);
  box(chest,graphite,0,.92,0,.44,.18,.32);
  for(let i=0;i<3;i++){
    const y=1.02+i*.10;box(chest,i%2?armor:edge,0,y,-.153,.30+i*.045,.062,.10);
    box(chest,light,0,y+.012,-.209,.19+i*.036,.021,.013,true);
  }
  plate(chest,joint,0,1.43,.08,.79,.51,.48);
  for(const side of [-1,1]){
    plate(chest,armor,side*.22,1.43,-.092,.46,.44,.40,-side*.28);
    box(chest,graphite,side*.244,1.52,-.272,.18,.029,.035).rotation.z=side*.25;
    plate(chest,armor,side*.46,1.50,.012,.49,.33,.52,-side*.36);
    box(chest,edge,side*.48,1.48,-.14,.16,.18,.18).rotation.z=-side*.10;
    cyl(chest,joint,side*.48,1.30,0,.14,.28);
    plate(chest,armor,side*.52,1.16,-.008,.22,.30,.25,side*.15);
    box(chest,graphite,side*.54,1.12,-.113,.07,.19,.04);
    part(chest,'orb',joint,side*.54,.997,-.013,.16,.16,.17);
    for(const finger of [-1,1])box(chest,armor,side*.54+finger*.052,.945,-.02,.039,.11,.12);
    cyl(chest,joint,side*.22,1.37,.237,.20,.48);cyl(chest,armor,side*.22,1.49,.24,.25,.29);
    cyl(chest,graphite,side*.22,1.12,.24,.18,.13);cyl(chest,light,side*.22,1.05,.24,.108,.018,true);
  }
  badge(chest,graphite,0,1.41,-.277,.266,.085);badge(chest,edge,0,1.41,-.329,.223,.023);
  badge(chest,heat,0,1.41,-.347,.178,.017,true);badge(chest,'#fff3c5',0,1.41,-.357,.093,.010,true);
  plate(chest,graphite,0,1.70,-.033,.28,.247,.26);plate(chest,armor,0,1.79,-.014,.30,.146,.27);
  box(chest,light,0,1.72,-.157,.193,.047,.02,true);box(chest,armor,0,1.64,-.136,.115,.086,.065);
  // 下肢局部原点取髋关节，步态摆动不会围着脚底转圈。
  plate(leg,joint,0,-.13,0,.22,.32,.23);plate(leg,armor,0,-.18,-.035,.285,.33,.29);
  badge(leg,graphite,0,-.36,-.045,.20,.18);plate(leg,armor,0,-.39,-.132,.237,.179,.16);
  plate(leg,joint,0,-.56,0,.22,.40,.24);plate(leg,armor,0,-.65,-.036,.267,.39,.30);
  box(leg,graphite,0,-.66,-.169,.083,.20,.032);plate(leg,armor,0,-.823,-.085,.28,.19,.42);
  box(leg,graphite,0,-.897,-.052,.248,.06,.33);
  return {chest:bakeJoint(chest),leg:bakeJoint(leg)};
}
/** 创建机甲骨架，胸身和两条腿可独立姿态更新；地表与航行共用已烘焙的装甲几何和材质。 */
export function mechaModel(){
  robotPatterns??=robotParts();const root=new T.Group(),body=new T.Group();root.add(body);root.userData.body=body;
  const bind=(joint,parts)=>{for(const {shape,material} of parts)joint.add(new T.Mesh(shape,material));};
  bind(body,robotPatterns.chest);
  for(const side of [-1,1]){const bone=new T.Group();bone.position.set(side*.180,.929,0);body.add(bone);root.userData[side<0?'legL':'legR']=bone;bind(bone,robotPatterns.leg);}
  return root;
}

