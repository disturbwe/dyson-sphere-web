import {Group} from 'three';
import {assemblers,smelters,sorters} from './catalog.js';

const graphite='#293941',ceramic='#d0d9d8',aluminium='#90a4ac',aperture='#172931';
const assemblyPaint=['#da892f','#46a984','#3187bb','#345865'];
const sorterPaint=['#d49448','#4bb884','#439ace','#92a9b3'];

/** 用原作敞口制造台的上压盘、四根立柱和三联进料口辨识机型。活动工件交给地块实例批次统一更新。 */
export function assemblyModel(g,type,{box,cyl}){
  const tier=assemblers.indexOf(type),paint=assemblyPaint[tier],glow=tier===3?'#42e4de':'#8fcac7';
  box(g,graphite,0,.28,0,1.53,.37,1.39);
  box(g,paint,0,.49,0,1.50,.13,1.36);cyl(g,aluminium,0,.59,0,.95,.15);
  for(const z of [-1,1])for(const x of [-.45,0,.45]){
    box(g,ceramic,x,.285,z*.69,.42,.37,.10);
    box(g,aperture,x,.30,z*.75,.33,.25,.035);
    box(g,aluminium,x,.19,z*.77,.34,.042,.04);
  }
  for(const x of [-.58,.58])for(const z of [-.49,.49]){
    box(g,graphite,x,1,z,.22,.96,.22);
    box(g,paint,x,1.01,z,.255,.72,.236);
    box(g,aluminium,x*1.07,1.03,z*1.08,.085,.66,.066);
    for(const y of [.64,1.39])box(g,ceramic,x,y,z,.30,.12,.28);
  }
  // 压头悬在上盖之下，侧面始终留出可见的生产腔。顶盖凹缝及压条在远处也保留型号主色。
  box(g,graphite,0,1.53,0,1.45,.15,1.32);cyl(g,paint,0,1.30,0,.82,.36);cyl(g,ceramic,0,1.14,0,.67,.095);
  box(g,paint,0,1.65,0,1.57,.19,1.45);
  for(const x of [-.51,.51]){
    box(g,ceramic,x,1.76,0,.24,.065,1.24);
    for(const z of [-.37,0,.37])box(g,graphite,x,1.80,z,.13,.025,.16);
  }
  cyl(g,aluminium,0,1.76,0,.65,.075);cyl(g,paint,0,1.81,0,.45,.05);
  const turntable=new Group();turntable.position.y=.70;g.add(turntable);g.userData.core=turntable;
  cyl(turntable,graphite,0,0,0,.67,.09);for(const x of [-.25,.25])box(turntable,ceramic,x,.075,0,.15,.12,.36);
  for(const z of [-.724,.724])box(g,glow,0,1.62,z,.60,.032,.018,true);
  return g;
}

/** 三代熔炉共用方形炉基和中央锥形炉喉。平面炉使用红色感应环，负熵炉暴露倒角护板及青色场缝。 */
export function smelterModel(g,type,{box,cyl,part}){
  const tier=smelters.indexOf(type),paint=['#4777b3','#b64249','#355460'][tier];
  const heat=['#ffae57','#f1d2a2','#64e8db'][tier];
  box(g,ceramic,0,.38,0,1.43,.63,1.29);box(g,paint,0,.68,0,1.51,.13,1.38);
  for(const z of [-.67,.67])for(const x of [-.39,.04,.45]){
    box(g,aperture,x,.41,z,.31,.17,.045);box(g,aluminium,x,.30,z,.30,.045,.05);
  }
  cyl(g,graphite,0,.83,0,1.12,.24);cyl(g,tier===2?graphite:aluminium,0,1.20,0,.86,.67);
  for(let i=0;i<4;i++){
    const face=new Group();face.rotation.y=i*Math.PI/2;g.add(face);
    box(face,ceramic,0,1.24,.395,.48,.72,.17).rotation.x=-.14;
    box(face,heat,0,.97,.514,.19,.30,.035,true);
    box(face,graphite,.30,1.38,.37,.065,.27,.095);
  }
  part(g,'disc',graphite,0,1.68,0,.97,.14,.97);cyl(g,paint,0,1.77,0,1.05,.115);
  cyl(g,aluminium,0,1.86,0,.82,.095);cyl(g,aperture,0,1.915,0,.62,.045);
  for(let i=0;i<4;i++){
    const lug=new Group();lug.rotation.y=i*Math.PI/2;g.add(lug);
    box(lug,ceramic,0,1.90,.426,.19,.13,.24);
  }
  part(g,'hoop',heat,0,1.95,0,.56,.6,.56,true);return g;
}

/** 化工厂以横槽和高位反应球区分于蒸馏塔。量子型号在反应球外增加两圈有倾角的约束环。 */
export function chemicalModel(g,quantum,{box,cyl,part}){
  const paint=quantum?'#4576a1':'#406ba2';
  box(g,ceramic,0,.27,0,1.55,.35,1.10);box(g,graphite,0,.46,0,1.47,.09,1.05);
  for(const x of [-.57,-.13,.31,.63])box(g,aperture,x,.29,.57,.24,.16,.04);
  for(const z of [-.34,.34]){
    box(g,paint,-.31,.67,z,.85,.39,.30);
    box(g,aluminium,-.66,.76,z,.14,.50,.27);box(g,ceramic,-.64,.98,z,.29,.12,.34);
    cyl(g,ceramic,.39,.89,z,.16,.80);cyl(g,graphite,.39,.96,z,.20,.10);
  }
  cyl(g,paint,.33,1.18,0,.74,.32);
  part(g,'orb',quantum?'#4b6fb3':'#37658b',.33,1.64,0,.96,.99,.96);
  cyl(g,ceramic,.33,1.39,0,.88,.20);part(g,'hoop','#75c8ec',.33,1.50,0,.94,.85,.94,true);
  if(quantum)for(const angle of [-.58,.65]){
    const field=part(g,'hoop','#7ea6ff',.33,1.68,0,1.22,.69,1.22,true);field.rotation.z=angle;
  }
  return g;
}

/** 分拣器分为固定机座、伸缩导轨和抓爪三套可实例化零件。本地 +X 永远从取货端指向卸货端。 */
export function sorterPart(g,section,type,{box}){
  const paint=sorterPaint[sorters.indexOf(type)];
  if(section==='drive'){
    box(g,graphite,0,-.125,0,.44,.11,.43);box(g,paint,0,.035,0,.36,.28,.39);
    for(const side of [-1,1])box(g,ceramic,.035,.043,side*.20,.26,.29,.070);
    box(g,aluminium,.195,.06,0,.072,.22,.37);box(g,aperture,.235,.075,0,.023,.12,.26);
  }else if(section==='slide'){
    // 导轨的长度单独缩放，电机与钳体始终保持实际宽度。
    for(const z of [-.077,.077])box(g,aluminium,.5,.08,z,1,.048,.048);
  }else{
    box(g,paint,0,.075,0,.14,.12,.29);
    for(const z of [-.14,.14]){
      box(g,ceramic,0,-.01,z,.106,.21,.052);
      box(g,graphite,-.014,-.12,z*.87,.12,.055,.082);
    }
  }
  return g;
}
