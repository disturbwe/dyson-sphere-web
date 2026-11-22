import * as THREE from 'three';
import {populateDefenseModel} from './defense-models.js';
import {analysisBase,gauss,laser} from './fog-rules.js';

const armor='#292f3f',edge='#586070',ceramic='#a7b6bb',amber='#d68a48',light='#45dad4';
const facet=new THREE.ConeGeometry(.5,1,4);

/** 按原作地表剪影组合部件。外壳与发光嵌条交给工厂批处理器合并，同一模型可供设施、残骸和战场实例复用。 */
export function populateFogModel(group,type,{part,box,cyl,material}){
  function spire(parent,x,y,z,r,h,slope=0){
    const shell=new THREE.Mesh(facet,material(armor,false));shell.position.set(x,y+h/2,z);shell.scale.set(r,h,r*.82);shell.rotation.z=slope;parent.add(shell);
    const seam=box(parent,light,x-r*.13,y+h*.45,z+r*.16,.035*r,h*.36,.045*r,true);seam.rotation.z=slope-.13;
  }
  function spokes(n,build){for(let i=0;i<n;i++){const arm=new THREE.Group();arm.rotation.y=i*Math.PI*2/n;group.add(arm);build(arm,i);}}
  if(populateDefenseModel(group,type,{part,box,cyl}))return true;
  if(type==='df-planetary-shield-generator'){
    // 六角护足托住两层错位的银色绝缘片，中心蓝色场柱从交错鳍片的缝隙露出。
    cyl(group,armor,0,.13,0,1.31,.24);cyl(group,ceramic,0,.34,0,1.04,.24);
    cyl(group,'#26394d',0,1.51,0,.48,2.28);
    for(const y of [.61,1.15,1.68,2.2]){
      cyl(group,edge,0,y,0,.71,.13);cyl(group,'#59ccff',0,y+.1,0,.46,.09,true);
    }
    spokes(5,(arm,i)=>{
      box(arm,armor,.54,.20,0,.38,.29,.31);box(arm,ceramic,.43,.48,0,.22,.55,.21).rotation.z=-.36;
      for(const y of [.91,1.77]){
        const blade=part(arm,'cone','#b1c1ce',.31,y+.05,-.022,.38,1.05,.25);blade.rotation.z=-.32;
        box(arm,'#677d90',.24,y+.16,.067,.11,.67,.11).rotation.z=-.25;
      }
      const tine=part(arm,'cone',i%2?'#becbd5':'#8faabf',.22,2.69,0,.14,.80,.13);tine.rotation.z=-.20;
    });
    part(group,'orb','#91efff',0,2.90,0,.20,.32,.20,true);return true;
  }
  if(type==='fog-lancer'){
    // 枪骑的双刃从引擎向前错开，内侧青色光路勾出狭长的中央空隙。
    part(group,'orb',armor,0,.02,-.49,.54,.42,1.28);
    for(const sign of [-1,1]){
      const rail=new THREE.Group();rail.rotation.y=-sign*.095;group.add(rail);
      box(rail,edge,sign*.31,.03,.44,.21,.21,1.87);
      const tip=part(rail,'cone',armor,sign*.31,.03,1.62,.25,1.08,.24);tip.rotation.x=Math.PI/2;
      box(rail,light,sign*.207,.059,.74,.032,.052,1.65,true);
      part(rail,'orb',edge,sign*.48,.02,-.80,.42,.29,1.05);box(rail,light,sign*.48,.02,-1.31,.16,.10,.04,true);
    }return true;
  }
  if(type===gauss||type===laser){
    cyl(group,armor,0,.17,0,1.18,.34);cyl(group,ceramic,0,.44,0,.90,.22);cyl(group,edge,0,.74,0,.64,.43);
    spokes(4,arm=>{const leg=box(arm,ceramic,.47,.37,0,.19,.58,.22);leg.rotation.z=-.51;box(arm,armor,.61,.10,0,.37,.14,.39);});
    const head=new THREE.Group();head.position.y=1.03;group.add(head);group.userData.core=head;
    if(type===gauss){
      box(head,armor,0,.10,.04,.67,.39,.89);
      for(const side of [-1,1]){
        box(head,amber,side*.28,.28,-.11,.29,.41,.68).rotation.x=-.13;
        box(head,ceramic,side*.26,.11,.56,.20,.18,.77);box(head,edge,side*.26,.13,.95,.17,.16,.11);
        box(head,'#f7cd72',side*.26,.13,1.015,.09,.045,.02,true);
      }
      box(head,edge,0,.42,-.17,.18,.15,.44);
    }else{
      cyl(head,edge,0,.19,0,.86,.39);part(head,'orb','#906d94',0,.39,0,.70,.57,.68);
      for(const x of [-.37,.37]){
        box(head,ceramic,x,.28,.13,.20,.45,.66).rotation.z=x*.5;
        box(head,'#9567ba',x,.55,.22,.18,.13,.43);box(head,'#e0abff',x,.55,.46,.12,.07,.04,true);
      }
      box(head,armor,0,.31,.43,.43,.26,.55);box(head,'#d5a7ff',0,.31,.73,.28,.16,.065,true);
    }
    return true;
  }
  if(type===analysisBase){
    cyl(group,armor,0,.26,0,1.51,.41);cyl(group,ceramic,0,.53,0,1.20,.21);
    spokes(4,arm=>{
      box(arm,edge,.66,.45,0,.48,.67,.41);box(arm,ceramic,.75,.82,0,.30,.20,.48);
      box(arm,amber,.92,.51,0,.07,.10,.23);box(arm,light,.82,.75,0,.10,.08,.27,true);
    });
    cyl(group,edge,0,.86,0,.82,.47);cyl(group,ceramic,0,1.12,0,.94,.10);
    const relay=new THREE.Group();relay.position.set(0,1.23,0);group.add(relay);group.userData.core=relay;
    cyl(relay,armor,0,.09,0,.43,.20);const dish=part(relay,'disc',ceramic,0,.34,0,.96,.12,.68);dish.rotation.x=.52;
    cyl(relay,edge,0,.59,.10,.065,.49);part(relay,'orb',light,0,.79,.10,.13,.13,.13,true);return true;
  }
  if(type==='fog-core'){
    cyl(group,armor,0,.17,0,3.1,.41);cyl(group,edge,0,.40,0,2.6,.22);
    spire(group,0,.43,0,2.50,3.78);cyl(group,light,0,.64,0,1.98,.057,true);
    spokes(6,(arm,i)=>{
      box(arm,armor,2.01,.18,0,2.30,.27,.49);box(arm,edge,2.50,.34,0,1.1,.10,.36);
      box(arm,light,2.03,.33,.13,1.43,.030,.040,true);box(arm,light,2.03,.33,-.13,1.43,.030,.040,true);
      part(arm,'orb',armor,3.24,.46,0,1.49,.83,1.03);spire(arm,3.28,.60,0,.90,i%2?1.38:1.88,-.22);
      spire(arm,1.18,.26,0,.77,1.62,-.38);
    });return true;
  }
  if(type==='fog-relay'){
    part(group,'orb',armor,0,.06,0,1.53,1.06,1.56);cyl(group,edge,0,.30,0,1.48,.20);
    spokes(4,arm=>{part(arm,'orb',edge,.71,.12,0,.93,.49,.50);spire(arm,.82,.15,0,.48,.97,-.38);box(arm,light,.70,-.11,0,.42,.05,.10,true);});
    part(group,'cone',light,0,-.66,0,.46,.63,.46,true).rotation.z=Math.PI;return true;
  }
  if(type==='fog-raider'||type==='fog-ranger'){
    const ranged=type==='fog-ranger';
    part(group,'orb',edge,0,.36,0,ranged?.72:.54,.38,ranged?1.08:.77);
    part(group,'orb',armor,0,.47,-.04,.48,.40,.71);box(group,light,0,.46,.33,.24,.075,.10,true);
    for(const side of [-1,1]){
      for(const z of [-.21,.21]){
        const limb=box(group,edge,side*.34,.22,z,.13,.39,.22);limb.rotation.z=-side*.59;
        box(group,armor,side*.44,.08,z+.06,.19,.13,.31);
      }
      if(ranged){box(group,armor,side*.42,.41,.09,.21,.21,.92);box(group,light,side*.42,.42,.56,.12,.07,.04,true);}
      else spire(group,side*.21,.48,-.12,.27,.40,side*.28);
    }return true;
  }
  if(type==='fog-pit'){
    cyl(group,'#332f32',0,.04,0,2.16,.17);
    spokes(8,arm=>{box(arm,edge,.95,.18,0,.36,.28,.56).rotation.z=-.21;box(arm,'#de7143',.70,.10,0,.15,.03,.19,true);});return true;
  }
  if(type==='fog-ruin'){
    box(group,armor,0,.08,0,1.3,.16,1.2);
    for(const [x,z,h,a] of [[-.4,.25,.55,.52],[.37,-.13,.80,-.55],[-.21,-.34,.41,-.19]]){const shard=box(group,edge,x,h*.46,z,.24,h,.23);shard.rotation.z=a;}
    box(group,'#e19452',.19,.18,.09,.23,.05,.16,true);return true;
  }
  if(type==='fog-debris'){
    part(group,'orb',edge,0,.12,0,.49,.26,.35);box(group,light,0,.27,0,.12,.07,.15,true);return true;
  }
  return false;
}
