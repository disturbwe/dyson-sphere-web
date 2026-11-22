// 预算限制物理像素总量，高分辨率显示器也受同一限制。界面文本维持浏览器原始分辨率。
export const profiles={economy:{name:'节能',fps:30,pixels:900000,dpr:1.05},balanced:{name:'均衡',fps:60,pixels:1750000,dpr:1.45},detail:{name:'精细',fps:60,pixels:3000000,dpr:1.7}};
export function initialProfile(){try{const saved=localStorage.getItem('dyson-render-profile');return Object.hasOwn(profiles,saved)?saved:'balanced';}catch{return 'balanced';}}
export function scaleFor(width,height,dpr,profile,quality=1){const budget=profiles[profile];return Math.min(dpr,budget.dpr,Math.sqrt(budget.pixels/Math.max(1,width*height)))*quality;}
/** 短期掉帧不反复重分配帧缓冲。连续两个慢速窗口才降采样，恢复则需八个稳定窗口。 */
export class FrameBudget {
  constructor(profile=initialProfile()){this.profile=profile;this.quality=1;this.reset();}
  reset(){this.good=0;this.slow=0;this.period=0;this.frames=0;this.fps=0;this.peak=0;this.worst=0;}
  select(profile){if(!Object.hasOwn(profiles,profile))return;this.profile=profile;this.quality=1;this.reset();try{localStorage.setItem('dyson-render-profile',profile);}catch{/* 临时浏览器允许调整本次画质。 */}}
  record(dt,limit){
    this.period+=dt;this.frames++;this.worst=Math.max(this.worst,dt);
    if(this.period<1||!dt)return false;
    this.fps=this.frames/this.period;this.peak=this.worst*1000;this.period=0;this.frames=0;this.worst=0;
    this.slow=this.fps<limit*.70?this.slow+1:0;this.good=this.fps>limit*.92?this.good+1:0;
    const before=this.quality;
    if(this.slow>=2){this.quality=Math.max(.56,this.quality-.11);this.slow=0;}
    else if(this.good>=8){this.quality=Math.min(1,this.quality+.06);this.good=0;}
    return before!==this.quality;
  }
}
