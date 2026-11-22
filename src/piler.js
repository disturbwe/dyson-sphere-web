import {sharePoints} from './stock.js';
import {items} from './catalog.js';
import {beltPorts} from './liquid-ports.js';
import {cargoPoints,cargoSize,putCargo,takeCargo} from './belt-cargo.js';

export const pilerType='automatic-piler';
export const newPiler=()=>({item:null,size:0,window:0,cooldown:0,loaded:0,delivered:0,piles:0,maxHeight:0});

/** 两个端口位于同一轴上。矮口进料时集装，高口进料时拆垛，由实际接带方向决定。 */
export function pilerPorts(planet,tile){
  const ports=beltPorts(planet,tile), high=ports[tile.dir],low=ports[(tile.dir+2)%4];
  if(high?.inward&&low&&!low.inward)return {tile,inlet:high.belt,outlet:low.belt,reverse:true};
  return {tile,inlet:low?.inward?low.belt:null,outlet:high&&!high.inward?high.belt:null,reverse:false};
}

function emit(p,outlet,quantity){
  const points=sharePoints(p.inc||0,p.size,quantity);
  if(points)p.inc-=points;
  putCargo(outlet,p.item,quantity,points);
  p.delivered+=quantity;p.piles++;p.maxHeight=Math.max(p.maxHeight,quantity);
  p.cooldown+=1/items[outlet.type].belt.speed;
  p.size-=quantity;
  if(!p.size)p.item=null;
}

/** 接受固定步长与已缓存端口。机内最多保留一垛实物，出口阻塞后余料停在入口格。断电时整垛直通。 */
export function runPiler({tile,inlet,outlet,reverse},dt){
  const p=tile.piler;
  if(!inlet||!outlet){tile.status='请沿高低口连接传送带';return;}
  p.cooldown=Math.max(-dt,p.cooldown-dt);
  const canSend=()=>!outlet.cargo&&p.cooldown<=1e-8;
  const ready=()=>inlet.cargo&&inlet.travel>=1;
  if(p.item){
    if(tile.power>0&&!reverse&&p.window>0&&ready()){
      if(inlet.cargo===p.item){
        const n=Math.min(cargoSize(inlet),4-p.size),points=cargoPoints(inlet,n);
        if(points)p.inc=(p.inc||0)+points;
        const moved=takeCargo(inlet,n);p.size+=moved;p.loaded+=moved;
      }
      // 相邻的异类货物打断配对。超过四层的尾数留在带头，作为下次配对的第一垛。
      p.window=0;
    }
    p.window=Math.max(0,p.window-dt);
    if((!p.window||!tile.power||reverse)&&canSend()){
      const quantity=p.splitPending&&tile.power>0&&reverse?Math.ceil(p.size/2):p.size;
      p.splitPending=false;emit(p,outlet,quantity);
    }
  }
  if(!p.item&&ready()){
    p.item=inlet.cargo;if(inlet.inc||p.inc)p.inc=inlet.inc||0;p.size=takeCargo(inlet);p.loaded+=p.size;
    if(tile.power>0&&reverse&&p.size>1){
      // 必须先保留后一半，哪怕下一步被断电或堵带，已经进入的实物也有且仅有一个归属。
      if(canSend())emit(p,outlet,Math.ceil(p.size/2));
      else {p.splitPending=true;}
      p.window=0;
    }else if(tile.power>0&&!reverse&&p.size<4){
      // 格点传输先移动上一节，再推进本节行程。配对窗口包含交接所占的一步，稀疏半带会原样发走。
      p.window=1/items[inlet.type].belt.speed+dt*1.5;
    }else{
      p.window=0;if(canSend())emit(p,outlet,p.size);
    }
  }
  tile.status=!tile.power?'断电直通':p.item&&!canSend()?'等待出口':reverse?'拆垛中':'集装中';
  if(!p.item&&!ready())p.cooldown=Math.max(0,p.cooldown);
}

/** 存档中的机内货物必须与累计收发差额一致。这样拆除、续档、停电都不会复制或吞掉尾垛。 */
export function validatePiler(p,validItem){
  const whole=n=>Number.isSafeInteger(n)&&n>=0;
  if(!p||(p.inc!==undefined&&(!whole(p.inc)||p.inc>4*p.size))||![p.loaded,p.delivered,p.piles,p.maxHeight,p.size].every(whole)||p.loaded-p.delivered!==p.size||p.size>4||p.maxHeight>4||p.piles>p.delivered||
    (p.size?!validItem(p.item):p.item!==null)||!Number.isFinite(p.window)||p.window<0||p.window>1||!Number.isFinite(p.cooldown)||Math.abs(p.cooldown)>1||
    (p.splitPending!==undefined&&typeof p.splitPending!=='boolean')||(p.splitPending&&p.size<2))throw new Error('集装机的货垛或收发账目无效');
}
