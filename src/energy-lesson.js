import {items} from './catalog.js';
import {bodyOf} from './navigation.js';
import {makePlanet,elevation} from './world.js';
import {heatAt,emptyCell,fullCell,exchanger,exchangeMode} from './energy.js';
import {setSlotItem,setSlotRule,setPort} from './stations.js';

/** 沿出生区外缘找真实的熔岩岸线。两个陆上机位和相邻的热源须同时成立，避免换种子后示例失去发电能力。 */
function shore(planet){
  for(let radius=9;radius<=85;radius+=2){
    for(let offset=-radius;offset<=radius;offset++){
      for(const [x,y] of [[offset,radius],[radius,offset],[offset,-radius],[-radius,offset]]){
        if(Math.abs(y)>38||elevation(x-1,y,planet.seed)<.05||elevation(x+1,y,planet.seed)<.05)continue;
        const vents=[];
        for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
          if(Math.hypot(dx,dy)>4.5 || (Math.abs(dx)<=1&&dy>=-1&&dy<=2))continue;
          const point={x:x+dx,y:y+dy},heat=heatAt(planet,point);
          if(heat>.45)vents.push({...point,heat});
        }
        if(vents.length>=5)return {x,y,vents:vents.sort((a,b)=>b.heat-a.heat).slice(0,5)};
      }
    }
  }
  throw new Error('当前熔岩星找不到同时容纳教学生产线和五口热井的岸线');
}
/** 普通物流端口构成往返闭环。每批满电池须先经地热充满，卸空后才能由返程货单送回源星。 */
export function makeEnergyLesson(game,put){
  function unlock(id){
    if(game.techs.includes(id))return;
    for(const parent of items[id].technology.prerequisites||[])unlock(parent);
    game.techs.push(id);
  }
  for(const id of ['geothermal-extraction','interstellar-power-transmission','interstellar-logistics-system','drive-engine-2','universe-exploration-2'])unlock(id);
  Object.assign(game.bag,{[emptyCell]:6,[exchanger]:2,'geothermal-power-station':3,'interstellar-logistics-station':1,'logistics-vessel':2,'conveyor-belt-1':60,'tesla-tower':4});
  function depot(context,center,charging){
    const build=(type,dx,dy,dir=0)=>put(context,type,{x:center.x+dx,y:center.y+dy},dir);
    const tower=build('interstellar-logistics-station',-1,0),unit=build(exchanger,1,0);
    const feed=charging?emptyCell:fullCell,product=charging?fullCell:emptyCell;
    exchangeMode(unit,charging?'charge':'discharge');
    for(const [i,item] of [feed,product].entries()){
      setSlotItem(context,tower,i,item);setSlotRule(context,tower,i,'remote',i?'supply':'demand');
      // 供应仓只有一个货位时，满仓例外让教学产线每完成一只就能发运。
      setSlotRule(context,tower,i,'limit',i?1:25);
    }
    tower.station.vessels=2;tower.station.minVessel=1;tower.station.chargeMW=30;
    tower.station.energy=charging?12000:4000;setPort(tower,1,feed);
    build('conveyor-belt-1',0,0,2);
    for(const [x,y,dir] of [[-1,1,1],[-1,2,0],[0,2,0],[1,2,3],[1,1,3]])build('conveyor-belt-1',x,y,dir);
    if(charging){tower.output[emptyCell]=8;unit.input[emptyCell]=2;}
    return unit;
  }
  depot(game,{x:0,y:1},false);
  // 初始星的塔由进口电芯充电，风机维持少量基础负载。塔自身已有的电量只供飞船运行。
  put(game,'wind-turbine',{x:2,y:-1},0);
  const home=game.planet;home.lastLanding={x:0,y:-1};
  const inner=bodyOf(game,'inner');game.planet=makePlanet(inner.seed,inner.biome);
  game.space.current='inner';game.space.parked.home=home;
  const site=shore(game.planet);depot(game,site,true);
  for(const vent of site.vents)put(game,'geothermal-power-station',{x:vent.x,y:vent.y},0);
  Object.assign(game.mecha,{x:site.x,y:site.y-1});
  game.stats.built=Object.keys(home.tiles).length+Object.keys(game.planet.tiles).length;
}
