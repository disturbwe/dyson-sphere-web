import {Group,Vector3} from 'three';

/** 机头沿 +X 对准三条前带。横梁和矿场罩架跨在真实露头上，留空的采掘面能看见矿物和移动的激发器。 */
export function miningGantry(root,{box,cyl}){
  const frame='#c9d1c4', shadow='#34434a', enamel='#859ba6', gold='#da9650', light='#79e7f0';
  const up=new Vector3(0,1,0);
  function strut(g,color,a,b,width,depth=width,emissive=false){
    const v=new Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const arm=box(g,color,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,v.length(),depth,emissive);
    arm.quaternion.setFromUnitVectors(up,v.normalize());
  }
  // 回形轨道与端部配重烘焙成静态批次，仅扫描头需要逐帧改变位姿。
  for(const side of [-1,1]){
    const z=side*2.03;
    box(root,shadow,-3.47,.23,z,6.75,.25,.38);
    box(root,enamel,-3.47,.47,z,6.52,.22,.27);
    box(root,gold,-3.47,.63,z,6.60,.10,.12);
    for(const x of [-.43,-2.34,-4.23,-6.45]){
      box(root,shadow,x,.19,z,.58,.32,.66);
      strut(root,frame,[x,.39,z],[x-.45,1.42,z-side*.14],.18,.22);
      box(root,gold,x-.45,1.42,z-side*.14,.39,.16,.33);
    }
    box(root,frame,-3.77,1.43,z-side*.14,6.45,.16,.25);
    box(root,light,-3.63,1.46,z-side*.28,6.12,.045,.036,true);
    for(const x of [-.10,-1.78,-3.55]){
      box(root,shadow,x,.32,side*1.38,.71,.46,.61);
      box(root,enamel,x,.58,side*1.37,.80,.12,.63);
      box(root,'#182f38',x,.30,side*1.70,.51,.21,.035);
    }
  }
  for(const x of [-.84,-6.79]){
    for(const side of [-1,1]){
      strut(root,enamel,[x,.56,side*2.03],[x,2.1,side*1.35],.24,.27);
      strut(root,frame,[x,2.10,side*1.35],[x,2.45,side*.46],.22,.28);
    }
    box(root,shadow,x,2.46,0,.31,.21,.98);
  }
  box(root,shadow,.14,.31,0,1.32,.45,3.58);
  for(const z of [-1.47,0,1.47]){
    box(root,enamel,.48,.57,z,.86,.40,.73);box(root,'#253b44',.926,.41,z,.043,.24,.55);
    box(root,gold,.935,.58,z,.05,.075,.62);
  }
  cyl(root,shadow,-.06,1.06,0,1.11,.90);cyl(root,frame,-.06,1.57,0,1.27,.23);
  cyl(root,'#558f9b',-.06,1.94,0,.83,.57);cyl(root,gold,-.06,2.26,0,1.16,.16);
  for(const h of [2.46,2.80,3.16]){cyl(root,frame,-.06,h,0,.65,.31);cyl(root,shadow,-.06,h+.17,0,.70,.07);}
  cyl(root,light,-.06,3.39,0,.43,.13,true);cyl(root,gold,-.06,3.51,0,.59,.10);
  const carriage=new Group();carriage.position.set(-3.52,1.55,0);root.add(carriage);root.userData.core=carriage;
  box(carriage,shadow,0,.33,0,.42,.26,3.87);box(carriage,frame,0,.52,0,.36,.14,3.88);
  for(const z of [-1.74,1.74])box(carriage,gold,0,-.02,z,.63,.42,.47);
  cyl(carriage,enamel,0,.015,0,.51,.51);cyl(carriage,light,0,-.31,0,.40,.09,true);
  return root;
}
