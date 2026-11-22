import {count} from './stock.js';

export const gauss='df-gauss-turret',missile='df-missile-turret',cannon='df-implosion-cannon';
export const plasma='df-plasma-turret',shortPlasma='df-plasma-turret-sr',jammer='df-jammer-tower',signal='df-signal-tower';
export const extraDefenses=[missile,cannon,plasma,shortPlasma,jammer,signal];
export const signalReach=64/6;
// 原作米数在战场按每格 6 m 折算。表中数值只驱动黑雾单位的游戏生命值和状态。
const missiles=['df-missile-set','df-supersonic-missile-set','df-gravity-missile-set'];
const shells=['df-shell-set','df-high-explosive-shell-set','df-crystal-shell-set'];
const capsules=['df-plasma-capsule','df-antimatter-capsule'];
const interference=['df-jamming-capsule','df-suppressing-capsule'];
export const ammoStats={};
function group(ids,rounds,damage,radius){
  ids.forEach((id,i)=>{ammoStats[id]={rounds,damage:damage[i],radius:radius[i]/6,tier:i};});
}
group(missiles,24,[21,54,120],[7.5,9,10]);
group(shells,12,[45,100,220],[11,13,15]);
group(capsules,10,[300,1500],[8,20]);
group(interference,180,[0,0],[0,0]);
const boxes=['df-magnum-ammo-box','df-titanium-ammo-box','df-superalloy-ammo-box'];
group(boxes,30,[7,16,36],[0,0,0]);
export const equipment={
  [gauss]:{ammo:boxes,rate:6,near:0,far:6.6},
  [missile]:{ammo:missiles,rate:2.5,near:0,far:60/6,orbital:true},
  [cannon]:{ammo:shells,rate:1,near:12/6,far:58/6},
  [plasma]:{ammo:capsules,rate:1,near:0,far:0,orbital:true},
  [shortPlasma]:{ammo:capsules,rate:.6,near:8/6,far:55/6},
  [jammer]:{ammo:interference,rate:.2,near:0,far:40/6}
};
export const acceptsAmmo=(type,id)=>equipment[type]?.ammo.includes(id)===true;
export const ammoFor=tile=>equipment[tile.type]?.ammo.find(id=>count(tile.input,id)>0);
export const stocked=tile=>!equipment[tile.type]||tile.defense.rounds>0||!!ammoFor(tile);

