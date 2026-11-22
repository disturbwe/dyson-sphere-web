import * as THREE from 'three';
import {extraDefenses,missile,signal,jammer,cannon,plasma,shortPlasma} from './defense-equipment.js';

const frame='#35404e',panel='#b9c7cd',dark='#202833',steel='#697e8b';
/** 以原作六张物品图的轮廓和色区为依据搭建本地网格。模型只在设施首次出现时构造，交给现有分块批绘器复用。 */
export function populateDefenseModel(group,type,{part,box,cyl}){
  if(!extraDefenses.includes(type))return false;
  const ring=(parent,color,y,diameter,height)=>cyl(parent,color,0,y,0,diameter,height);
  function radial(n,build){
    for(let i=0;i<n;i++){
      const pivot=new THREE.Group();pivot.rotation.y=i*2*Math.PI/n;group.add(pivot);build(pivot);
    }
  }
  function base(w){
    ring(group,frame,.13,w,.24);ring(group,panel,.29,w*.83,.11);
    radial(4,leg=>{
      box(leg,dark,0,.10,w*.42,.23,.17,.36);
      box(leg,steel,0,.37,w*.33,.17,.57,.17).rotation.x=-.47;
    });
  }
  if(type===signal){
    base(1.42);ring(group,frame,1.37,.30,2.12);ring(group,panel,2.29,.18,1.12);
    radial(4,arm=>{
      box(arm,steel,0,.54,.28,.19,.78,.18).rotation.x=-.38;
      box(arm,'#2d69a9',0,1.12,.37,.32,.72,.52).rotation.x=-.55;
      box(arm,'#78ccff',0,1.29,.46,.23,.38,.055,true).rotation.x=-.55;
      box(arm,frame,0,1.89,.24,.10,.52,.10).rotation.x=.72;
    });
    for(const [y,d] of [[.8,.66],[1.5,.73],[1.84,.48],[2.3,.36]])ring(group,steel,y,d,.10);
    ring(group,'#dc6957',2.63,.14,.36);ring(group,panel,3.02,.07,.56);
    part(group,'orb','#75cfff',0,3.31,0,.11,.11,.11,true);return true;
  }
  if(type===jammer){
    base(1.52);ring(group,dark,.54,.96,.46);ring(group,steel,.84,.76,.15);
    radial(5,wing=>{
      box(wing,panel,0,.59,.53,.21,.72,.20).rotation.x=.29;
      part(wing,'orb','#3d70c1',0,.84,.49,.38,.81,.21).rotation.x=.48;
      box(wing,'#77aaff',0,.89,.61,.32,.28,.05,true).rotation.x=.48;
    });
    ring(group,steel,1.28,.23,.70);ring(group,panel,1.38,.48,.15);
    part(group,'orb','#ec6b62',0,1.58,0,.29,.27,.29,true);return true;
  }
  if(type===shortPlasma){
    base(1.14);ring(group,'#67509c',.41,.77,.23);ring(group,dark,1.14,.24,1.45);
    radial(3,fin=>{
      part(fin,'orb',panel,0,1.15,.29,.21,1.60,.27);
      box(fin,'#8e86f0',0,1.15,.39,.06,1.13,.04,true);
    });
    part(group,'orb','#8e80f0',0,1.97,0,.45,.42,.45);
    part(group,'orb','#b9c3ff',0,2.17,0,.24,.22,.24,true);return true;
  }
  base(type===plasma?1.85:1.46);
  ring(group,steel,.58,.82,.46);ring(group,dark,.82,.66,.19);
  const pivot=new THREE.Group();pivot.position.y=1.01;group.add(pivot);
  // 机头固定在仰角支架上，斜置的橙黄弹舱、红色扁炮体和紫色双轨在远景也能区分。
  const head=new THREE.Group();head.rotation.x=type===plasma?-.42:-.25;pivot.add(head);
  if(type===missile){
    box(head,frame,0,.10,.04,1.02,.61,1.18);
    box(head,'#e3bd5d',0,.47,.02,1.06,.16,1.14);
    box(head,panel,0,.55,.00,.31,.065,.91);
    for(const side of [-1,1]){
      box(head,steel,side*.54,-.04,-.08,.19,.50,.58);
      box(head,'#edd27c',side*.44,.14,.62,.14,.48,.15);
    }
    for(const [x,y] of [[-.24,.23],[.24,.23],[0,-.08]]){
      const rim=cyl(head,'#a56a3e',x,y,.69,.33,.16);rim.rotation.x=Math.PI/2;
      cyl(head,dark,x,y,.78,.24,.04).rotation.x=Math.PI/2;
      part(head,'orb','#ffad62',x,y,.81,.14,.14,.065,true);
    }return true;
  }
  if(type===cannon){
    box(head,dark,0,.11,0,1.00,.70,1.27);
    for(const side of [-1,1]){
      box(head,'#b95342',side*.42,.42,-.06,.27,.20,1.30);
      box(head,panel,side*.48,.15,.10,.16,.31,.92);
      box(head,'#e0795f',side*.42,.37,.60,.29,.16,.15);
    }
    box(head,steel,0,.16,.70,.64,.40,.48);
    box(head,dark,0,.16,.97,.45,.25,.07);box(head,'#e98a62',0,.15,1.011,.30,.048,.023,true);return true;
  }
  ring(group,'#9d8ebd',.42,1.64,.09);
  box(head,frame,0,.01,-.13,.62,.44,.96);
  for(const side of [-1,1]){
    box(head,panel,side*.29,.13,.39,.23,.24,1.99);
    box(head,'#745d9f',side*.29,.29,.47,.17,.08,1.69);
    box(head,'#a992ff',side*.19,.13,.76,.045,.07,1.17,true);
    part(head,'orb',steel,side*.46,.02,-.41,.42,.58,.85);
  }return true;
}
