import {Quaternion,Vector3} from 'three';

const degree=Math.PI/180;
const aroundX=new Vector3(1,0,0), aroundY=new Vector3(0,1,0);
const incline=new Quaternion(), spin=new Quaternion();

/** 用本恒星系第一颗行星的米制半径和周期作基准，以开普勒比例计算壳层的一周秒数。卫星周期不适用。 */
export function layerPeriod(layer,primary) {
  return primary.period*Math.pow(layer.radius/primary.radius,1.5);
}

/** 将壳层本地经纬度转到恒星空间，写入调用者的四元数。使用模拟时间可在读档、暂停和倍速后保持相位一致。 */
export function layerRotation(result,layer,elapsed,primary) {
  const period=layerPeriod(layer,primary);
  const phase=(elapsed-(layer.epoch??0))%period/period*2*Math.PI;
  // 先在赤道内旋转，再沿升交线倾斜。旧档未标注方向时沿原赤道运行。
  result.setFromAxisAngle(aroundY,-(layer.longitude??0)*degree);
  result.multiply(incline.setFromAxisAngle(aroundX,-(layer.tilt??0)*degree));
  return result.multiply(spin.setFromAxisAngle(aroundY,-phase));
}
