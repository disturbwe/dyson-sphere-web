import {rng} from './world.js';

export const AU=40000, LY=60*AU, birthStar='s0';
export const homeSystemOf=id=>id?.includes(':')?id.split(':',1)[0]:birthStar;
const cached=new WeakMap();
const tau=2*Math.PI;
export const spectra={
  M:['M 型主序星','#f36c43',.40],K:['K 型主序星','#ffa856',.74],G:['G 型主序星','#ffda80',1],F:['F 型主序星','#fff0cb',1.24],
  A:['A 型主序星','#c0e7ff',1.56],B:['B 型主序星','#73c8ff',2.13],O:['O 型主序星','#4199ff',2.65],
  giant:['红巨星','#ff5943',1.86],white:['白矮星','#e5eaff',.38],neutron:['中子星','#9d87ff',.39],hole:['黑洞','#8f8ccf',.014]
};
const constellations=['Lyrae','Cygni','Orionis','Aquilae','Draconis','Centauri','Carinae','Velorum','Tauri','Pegasi','Persei','Leonis'];
const letters=['α','β','γ','δ','ε','ζ','η'];
function typeFor(index,count,random){
  if(index===0)return 'G';
  if(index>=count-5)return ['O','giant','white','neutron','hole'][index-count+5];
  return ['M','M','K','K','G','G','F','F','A','B'][Math.floor(random()*10)];
}
function titleFor(index,kind,seed){
  if(!index)return '初始恒星';
  if(kind==='hole'||kind==='neutron')return (kind==='hole'?'XTE J':'PSR J')+String(seed%2400).padStart(4,'0')+'+'+String(seed%6000).padStart(4,'0');
  // 用拜耳命名法给图上的恒星分配无重复标签，同一个种子只置换星座和字母的起点。
  return letters[Math.floor((index-1)/constellations.length)]+ ' '+constellations[(index-1+seed)%constellations.length];
}
/** 星团只保存生成参数。恒星位置用光年存储，恒星系内的航行、物流在同一米制坐标中结算。第一次查看恒星系才生成其行星目录。 */
export function clusterOf(game){
  const hit=cached.get(game);if(hit)return hit;
  const count=game.space.starCount??64, random=rng(game.seed^0x5b26fd),stars=[],byId=new Map(),systems=new Map();
  for(let i=0;i<count;i++){
    const kind=typeFor(i,count,random),seed=1+Math.floor(random()*99999998);
    let position=[0,0,0];
    if(i){
      // 用黄金角分层取样，最近的邻星总能常规抵达，远端的致密天体带来长途运输需求。
      const r=i===1?2.4+random():3.2+Math.sqrt((i-1)/(count-1))*(13+random()*3);
      const phi=i*2.39996323+random()*.48+game.seed%19;
      position=[r*Math.cos(phi),(random()-.5)*Math.min(6,r*.55),r*Math.sin(phi)];
    }
    const luminosity=i?Number((spectra[kind][2]*(.87+.28*random())).toFixed(3)):1;
    const star={id:'s'+i,kind,seed,title:titleFor(i,kind,i>=count-2?seed:game.seed),position,luminosity};
    stars.push(star);byId.set(star.id,star);
  }
  const value={stars,byId,systems};cached.set(game,value);return value;
}
export const starOf=(game,id)=>clusterOf(game).byId.get(id);
export const activeStar=game=>starOf(game,homeSystemOf(game.space.current));
export const distanceLY=(a,b)=>Math.hypot(...a.position.map((v,i)=>v-b.position[i]));
/** 返回指定恒星的星历。母星沿用旧种子的采样顺序，以兼容先前所有轨道、坐标和在途存档。 */
export function starSystem(game,starId=homeSystemOf(game.space.current)){
  const catalog=clusterOf(game),record=catalog.byId.get(starId);
  if(!record)return [];
  if(catalog.systems.has(starId))return catalog.systems.get(starId);
  const local=starId===birthStar,random=rng(local?game.seed:record.seed),bodies=[];
  function planet(id,title,biome,radius,period,parent=null){
    const phase=random()*tau,tilt=(random()-.5)*.19,seed=id==='home'?game.seed:1+Math.floor(random()*99999998);
    bodies.push({id:local?id:starId+':'+id,title,biome,radius,period,parent,phase,tilt,seed,star:starId});
  }
  if(local){
    planet('inner','初始恒星 I','lava',(.55+random()*.15)*AU,2700);
    planet('giant','初始恒星 II','gas',(1+random()*.11)*AU,5500);
    planet('home','初始行星','mediterranean',(.066+random()*.011)*AU,710,'giant');
    planet('outer','初始恒星 III','gobi',(1.6+random()*.23)*AU,8650);
  }else{
    const compact=['neutron','hole'].includes(record.kind),size=compact?1:2+Math.floor(random()*4);
    const labels=['I','II','III','IV','V'];
    for(let i=0;i<size;i++){
      const biome=compact?'ashen':(i===0?(random()<.46?'lava':'gobi'):['mediterranean','gobi','gas','gelisol'][Math.floor(random()*4)]);
      const radius=(.49+i*.45+random()*.21)*AU;
      planet('p'+i,record.title+' '+labels[i],biome,radius,Math.round(4800*Math.pow(radius/AU,1.5)));
    }
    if(!compact){
      // 新地质带在既有星历算完后追加，旧档里的工厂种子、轨道和运输船目的地仍能命中原天体。
      const themes=['sulfuria','aquatica','cyclonius','tropicana'];
      const index=Number(starId.slice(1))-1;
      const biome=themes[(index<4?index:Math.abs(index+record.seed))%themes.length];
      const radius=(.49+size*.45+random()*.21)*AU;
      planet('frontier',record.title+' '+[...labels,'VI'][size],biome,radius,Math.round(4800*Math.pow(radius/AU,1.5)));
    }
  }
  catalog.systems.set(starId,bodies);return bodies;
}
export const bodyOf=(game,id)=>typeof id==='string'?starSystem(game,homeSystemOf(id)).find(body=>body.id===id):undefined;
export const centerMeters=star=>star.position.map(v=>v*LY);
