import {elevation,wrap} from './world.js';
import {researchRoute} from './research.js';

const surveys=new Map();
/** 从真实种子高程中选一对相邻的三格样方，要求第一块的土足以填第二块；结果只供教学导航，不改变地貌。 */
export function coastSurvey(seed){
  if(surveys.has(seed))return surveys.get(seed);
  const heights=new Map();
  const height=(x,y)=>{const k=(y+45)*180+wrap(x)+90;if(!heights.has(k))heights.set(k,elevation(x,y,seed));return heights.get(k);};
  function area(x,y){let sum=0,wet=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const h=height(x+i,y+j);sum+=h-.1;if(h<-.05)wet++;}return {sum,wet};}
  let best=null;
  for(let r=10;r<=87&&!best;r++){
    for(let y=-Math.min(38,r);y<=Math.min(38,r);y++)for(const x of Math.abs(y)===r?Array.from({length:2*r+1},(_,i)=>i-r):[-r,r]){
      if(height(x,y)<.55)continue;const land=area(x,y);if(land.sum<3)continue;
      for(const [dx,dy] of [[4,0],[0,-4],[-4,0],[0,4],[3,3],[-3,-3],[3,-3],[-3,3]]){
        const bx=wrap(x+dx),by=y+dy;if(Math.abs(by)>40||height(bx,by)>=-.05)continue;
        const sea=area(bx,by);if(sea.wet<5||sea.sum>-.75||land.sum<-sea.sum*1.30)continue;
        best={cut:{x,y},fill:{x:bx,y:by},center:{x:wrap(x+dx/2),y:y+dy/2}};break;
      }
      if(best)break;
    }
  }
  if(!best)throw new Error('当前种子未找到合适的相邻海岸测点');
  // 反复在标题换种子时只需保留少数近期勘测记录。
  if(surveys.size>=8)surveys.delete(surveys.keys().next().value);surveys.set(seed,best);return best;
}
/** 教学从一张空海岸开工。地基和仓储为教学库存，沙土从零开始，两个测点都走普通整地命令。 */
export function makeCoastLesson(game){
  game.techs.push(...researchRoute(game,'environment-modification'));
  const {center}=coastSurvey(game.seed);game.mecha.x=center.x;game.mecha.y=center.y-1;
  game.bag={foundation:120,'storage-1':3,'wind-turbine':2,'conveyor-belt-1':50,'water-pump':1};
}
