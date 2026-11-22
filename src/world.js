import {oreMultiplier} from './sector-rules.js';

// 球面的经纬网同时供建造占位、三维拾取和模拟使用，经线接缝处必须环绕。
export const WIDTH=180, HALF=90, RADIUS=51, ANGLE=Math.PI/90;
export const wrap=x=>((x+HALF)%WIDTH+WIDTH)%WIDTH-HALF;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const key=(x,y)=>wrap(Math.round(x))+','+Math.round(y);
export const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
export const delta=(a,b)=>[wrap(b.x-a.x),b.y-a.y];
export function distance(a,b) { const [dx,dy]=delta(a,b); return Math.hypot(dx*Math.cos((a.y+b.y)*ANGLE/2),dy); }
export function axis(x,y) { const a=x*ANGLE,b=y*ANGLE,c=Math.cos(b); return [Math.sin(a)*c,Math.sin(b),Math.cos(a)*c]; }
export function rng(seed) { let n=seed>>>0; return ()=>{ n=(Math.imul(n,1664525)+1013904223)>>>0; return n/4294967296; }; }
function hash(x,y,z,s) { let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,144269501)+s; n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967296; }
function noise(x,y,z,s) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const smooth=t=>t*t*(3-2*t), lerp=(a,b,t)=>a+(b-a)*t;
  const u=smooth(x-ix),v=smooth(y-iy),w=smooth(z-iz);
  const row=(b,c)=>lerp(hash(ix,iy+b,iz+c,s),hash(ix+1,iy+b,iz+c,s),u);
  return lerp(lerp(row(0,0),row(1,0),v),lerp(row(0,1),row(1,1),v),w);
}
/** 返回相对海面的地形标高。初始着陆区保留连续平地，随机种子不能把必需矿脉沉进海里。 */
export function elevation(x,y,seed,biome='mediterranean') {
  const [a,b,c]=axis(x,y), f=k=>noise(a*k+7.3,b*k+4.8,c*k+2.1,seed);
  const raw=(f(3)*0.58+f(8)*0.26+f(21)*0.12+f(48)*0.04-0.51)*11;
  const home=Math.hypot(wrap(x)*0.90,y*1.10);
  // 水世界只有少量露出海面的岛礁。火山灰星的酸池局限于洼地，灰色高原能支撑普通工厂。
  if(biome==='aquatica')return Math.max(raw*.64-1.55,.32-home*.16);
  if(biome==='sulfuria')return raw*.76+.50;
  const fade=clamp((15-home)/5,0,1);
  return raw*(1-fade)+(0.34+0.32*f(20))*fade;
}
export function surface(x,y,seed){return RADIUS+Math.max(0,elevation(x,y,seed))*0.64;}
/** 每个矿点独立持有余量，重叠矿机从同一矿脉扣除；固定起步四矿，其余矿区随种子分布。 */
export const environments={
  mediterranean:{label:'地中海',wind:1,solar:1,ocean:'water',resources:['iron-ore','copper-ore','stone','coal','crude-oil']},
  lava:{label:'熔岩',wind:.7,solar:1.35,ocean:'lava',resources:['iron-ore','copper-ore','titanium-ore','stone']},
  ashen:{label:'灰烬冻土',wind:.4,solar:.38,ocean:null,resources:['unipolar-magnet','titanium-ore','iron-ore','stone','silicon-ore']},
  gelisol:{label:'冰原冻土',wind:.7,solar:.63,ocean:null,resources:['fire-ice','silicon-ore','iron-ore','copper-ore','stone','titanium-ore']},
  sulfuria:{label:'火山灰',wind:.8,solar:1.10,ocean:'sulfuric-acid',resources:['iron-ore','copper-ore','titanium-ore','stone','silicon-ore','coal']},
  aquatica:{label:'水世界',wind:1.1,solar:.94,ocean:'water',resources:['coal','crude-oil','spiniform-stalagmite-crystal']},
  cyclonius:{label:'飓风石林',wind:1.6,solar:.94,ocean:null,resources:['iron-ore','copper-ore','stone','titanium-ore','silicon-ore','coal']},
  tropicana:{label:'海洋丛林',wind:1,solar:1,ocean:'water',resources:['iron-ore','copper-ore','stone','coal','silicon-ore','crude-oil']},
  gobi:{label:'戈壁',wind:.65,solar:.86,ocean:null,resources:['silicon-ore','titanium-ore','iron-ore','copper-ore','stone','coal']}
};
export const newReform=()=>({cells:{},revision:0});
export function makePlanet(seed,biome='mediterranean',resource='1',home=true) {
  // 巨星只有随行星保存的同步站位，初始化时保持矿脉、树木与地面连接为空。
  if(biome==='gas')return {seed,biome,veins:[],tiles:{},links:[],felled:[],reform:newReform(),revision:0};
  const random=rng(seed), veins=[], used=new Set();
  function patch(x,y,item,number,subsea=false){
    for(let i=0;i<number*5 && number>0;i++){
      const px=wrap(x+(random()-.5)*3.1),py=clamp(y+(random()-.5)*2.4,-44.8,44.8),k=key(px,py)+':'+Math.round(px*3)+':'+Math.round(py*3);
      if(used.has(k))continue;
      const low=environments[biome].ocean && elevation(px,py,seed,biome)<.08;
      if(low&&!subsea)continue;
      const vein={x:px,y:py,item,amount:18000+Math.floor(random()*14000)};
      // 水下矿脉保留实际位置与吨数，填海时按同一个格点显露，也能选择继续埋藏。
      if(low&&item!=='crude-oil')vein.buried=true;
      veins.push(vein);used.add(k);number--;
    }
  }
  // 起步星球附近的四矿和随机数调用次序沿用旧档。外星着陆点也保留可手采的本地代表矿脉。
  const choices=environments[biome].resources;
  if(biome==='aquatica'){
    patch(-4,2,'spiniform-stalagmite-crystal',10,true);
    patch(0,0,'coal',5);
  }else{
    patch(-5,2,choices[0],10);patch(5,3,choices[1],9);patch(-5,-4,choices[2],8);patch(5,-4,choices[3],9);
  }
  for(let k=0;k<145;k++){const x=random()*180-90,y=Math.asin(random()*2-1)/ANGLE;if(Math.hypot(x,y)>14)patch(x,y,choices[k%choices.length],4+Math.floor(random()*6),biome==='aquatica'&&choices[k%choices.length]==='spiniform-stalagmite-crystal');}
  // 原油以单个泉眼和每秒流量计量。固体矿区继续使用原来的随机序列，避免改变其他矿区的形状。
  // 独立随机流保留主体矿带位置。按主题挑选可出现的稀有矿，再生成空间成簇的有限矿脉。
  const rare=biome==='cyclonius'?['kimberlite-ore','fractal-silicon','optical-grating-crystal']:biome==='tropicana'?['organic-crystal','spiniform-stalagmite-crystal']:[];
  for(const [index,item] of rare.entries()){
    const scatter=rng(seed+54381+index*991),count=1+Math.floor(scatter()*5);
    for(let n=0;n<count;n++)patch(wrap(6+scatter()*152),scatter()*64-32,item,4+Math.floor(scatter()*6));
  }
  const sites=veins.filter(v=>v.item!=='crude-oil');
  // 只缩放储量，保持同种子的矿脉坐标和朝向。无限模式在采收端免扣矿量。
  const factor=oreMultiplier(resource,home);
  if(factor!==1)for(const site of sites)site.amount=Math.max(1,Math.round(site.amount*factor));
  if (choices.includes('crude-oil')) {
    const oilRandom=rng(seed+55791);
    const seeps=[{x:biome==='aquatica'?0:-8,y:biome==='aquatica'?0:-2,item:'crude-oil',rate:1.48+oilRandom()}];
    for(const vein of veins){
      if(vein.item==='crude-oil' && seeps.every(p=>distance(p,vein)>3.5)){
        seeps.push({x:vein.x,y:vein.y,item:vein.item,rate:Math.round((1.1+2*oilRandom())*100)/100});
      }
    }
    if(resource==='scarce')for(const seep of seeps)seep.rate*=.5;
    sites.push(...seeps);
  }
  return {seed,biome,veins:sites,tiles:{},links:[],felled:[],reform:newReform(),revision:0};
}
