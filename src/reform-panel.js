import {applyGround,pavingColors,pavingNames,settled,soilLimit,surveyGround} from './reform.js';
import {clamp,key} from './world.js';
import {count} from './stock.js';
import {coastSurvey} from './coast-lesson.js';
import {button,line,note,section} from './ui-format.js';

const format=n=>n.toLocaleString('zh-CN');
const signed=n=>(n>0?'+':'')+format(n);

/** 笔刷设置只属于本次操作。切换天体时重新定位，避免在另一颗行星上沿用同一对经纬坐标。 */
export function openBrush(game,ui){
  if(game.space.flight||game.planet.biome==='gas')throw new Error('地形改造需要固态行星表面');
  if(ui.brush?.planet===game.planet)return;
  ui.brush={planet:game.planet,size:game.scenario==='coast'?3:1,style:1,bury:false,
    anchor:{x:Math.round(game.mecha.x),y:Math.round(game.mecha.y)},cache:null};
}

/** 三维预览、浮动提示和预算栏共用一份报价。鼠标在同一格内移动时无需逐格重算高程。 */
export function brushQuote(game,ui){
  const brush=ui.brush,point=ui.hover||brush.anchor,planet=game.planet;
  const stamp=[point.x,point.y,brush.size,brush.style,brush.bury,planet.reform.revision,planet.construction?.revision,
    game.mecha.x,game.mecha.y,game.mecha.soil,count(game.bag,'foundation'),game.techs.length].join('|');
  if(brush.cache?.stamp!==stamp){
    brush.cache={stamp,plan:surveyGround(game,point,brush.size,brush.style,brush.bury),point:{x:point.x,y:point.y}};
  }
  return brush.cache;
}

/** 点击测点仅定位。确认或在地表落笔时重新校验当下的库存与距离，跨面板操作不会透支沙土。 */
export function brushCommand(game,ui,action,id,notify,point){
  const brush=ui.brush;
  if(action==='soil-size'){brush.size=clamp(brush.size+Number(id),1,10);return;}
  if(action==='soil-style'){brush.style=Number(id);return;}
  if(action==='soil-veins'){brush.bury=id==='bury';return;}
  if(action==='soil-target'){
    if(game.scenario==='coast'&&game.space.current==='home'&&['cut','fill'].includes(id)){
      brush.anchor={...coastSurvey(game.seed)[id]};brush.size=3;ui.hover=null;
    }
    return;
  }
  if(action==='soil-apply'){
    const center=point||brush.anchor;
    const result=applyGround(game,center,brush.size,brush.style,brush.bury);
    brush.anchor={x:center.x,y:center.y};
    notify(result.changes?'已改造 '+result.changes+' 格　地基 −'+result.cost+'　沙土 '+signed(result.soil):'所选地块已符合当前设置');
  }
}

export function coastObjective(game){
  const {cut,fill}=coastSurvey(game.seed),ground=game.planet;
  const built=!!ground.tiles[key(fill.x,fill.y)];
  const title=built?'海岸工地已投用':settled(ground,fill.x,fill.y)?'在新陆地上建造仓储':settled(ground,cut.x,cut.y)?'用取得的沙土填海':'先在高地取土';
  return '<small>海岸整地与填海</small><strong>'+title+'</strong><p>沙土 '+format(game.mecha.soil)+'　地基 '+format(count(game.bag,'foundation'))+'</p>'+
    (built?button('inspect-machine',key(fill.x,fill.y),'检查填海区设施 →'):button('soil-open','','打开地形改造 →'));
}

export function reformPanel(game,ui){
  const b=ui.brush,{point,plan}=brushQuote(game,ui);
  const swatches=pavingNames.map((name,i)=>'<button type="button" class="soil-swatch" data-action="soil-style" data-id="'+i+'" style="--swatch:'+(pavingColors[i]||'#736b55')+'" aria-pressed="'+(b.style===i)+'" aria-label="'+name+'" title="'+name+'"></button>').join('');
  const sample=game.scenario==='coast'&&game.space.current==='home';
  let html='<div class="soil-balance"><div><small>沙土储备</small><b>'+format(game.mecha.soil)+'</b></div><div><small>地基库存</small><b>'+format(count(game.bag,'foundation'))+'</b></div></div>';
  html+=section('作业范围','网格')+'<div class="soil-size">'+button('soil-size','-1','−')+'<strong>'+b.size+' × '+b.size+'</strong>'+button('soil-size','1','＋')+'</div>';
  html+=section('地表外观',pavingNames[b.style])+'<div class="soil-palette">'+swatches+'</div>';
  html+=section('资源点')+'<div class="pills">'+button('soil-veins','show','露出矿脉','pill '+(!b.bury?'active':''))+button('soil-veins','bury','掩埋矿脉','pill '+(b.bury?'active':''))+'</div>';
  if(sample)html+=section('海岸测点')+'<div class="actions">'+button('soil-target','cut','定位取土区')+button('soil-target','fill','定位填海区')+'</div>';
  html+=section('施工预算',point.x+' / '+point.y)+line('地基消耗',format(plan.cost))+line(plan.soil>0?'整平取得沙土':plan.soil<0?'填方所需沙土':'沙土变化',format(Math.abs(plan.soil)))+line('施工后沙土',format(Math.min(soilLimit,game.mecha.soil+plan.soil)));
  if(plan.veins)html+=line(b.bury?'将掩埋资源点':'将露出资源点',plan.veins);
  html+=plan.error?'<div class="soil-error">'+plan.error+'</div>':plan.changes?button('soil-apply','','铺设所选区域','primary soil-apply'):note('当前区域已符合笔刷设置。');
  if(sample&&settled(game.planet,coastSurvey(game.seed).fill.x,coastSurvey(game.seed).fill.y)&&!game.planet.tiles[key(coastSurvey(game.seed).fill.x,coastSurvey(game.seed).fill.y)])html+=button('coast-store','','在填海测点建造仓储','soil-apply');
  return html;
}
