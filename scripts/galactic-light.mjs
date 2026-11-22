import {deflateSync} from 'node:zlib';

/** 离线烘焙银河的薄盘、尘带与星野。浏览器平移和缩放只采样这一张图，图中的装饰星点与可选择的存档星区分开。 */
export function galacticLight(width=1440,height=840) {
  let seed = 0x562639bd;
  function random() {
    seed = (Math.imul(1664525,seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const lattice=Float32Array.from({length:65536},random);
  function noise(x,y) {
    const ix=Math.floor(x), iy=Math.floor(y);
    let dx=x-ix,dy=y-iy;
    dx=dx*dx*(3-2*dx); dy=dy*dy*(3-2*dy);
    const at=(a,b)=>lattice[((a&255)<<8)|(b&255)];
    const top=at(ix,iy)*(1-dx)+at(ix+1,iy)*dx;
    return top*(1-dy)+(at(ix,iy+1)*(1-dx)+at(ix+1,iy+1)*dx)*dy;
  }
  const stride=width*3+1, pixels=Buffer.alloc(height*stride);
  const density=new Float32Array(width*height);
  const pack=x=>Math.max(0,Math.min(255,Math.round(x)));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=(x/width-.55)*2.65, v=(.45-y/height)*1.55;
    const a=.963*u+.270*v, b=(-.270*u+.963*v)/.45;
    const r=Math.hypot(a,b),t=Math.atan2(b,a);
    const cloud=noise(4.8*a+53,4.8*b+88)*.55+noise(12*a+11,12*b+49)*.29+noise(38*a,38*b)*.16;
    const turbulent=(cloud-.48)*2.4+(noise(22*a,22*b)-.5)*.30;
    const angle=2*t-4.7*Math.log(.19+r)+turbulent;
    const spiral=Math.cos(angle), secondary=Math.cos(2*angle+.62);
    const arm=Math.pow(.5+.5*spiral,3.6)+.24*Math.pow(.5+.5*secondary,8);
    const disc=Math.exp(-r*1.7), bulge=Math.exp(-r*r*43), nucleus=Math.exp(-r*29);
    const smoky=Math.pow(cloud,2.1)*1.9, dust=.27+.73*Math.pow(.5+.5*Math.cos(angle-.78),.62);
    const stars=disc*(.22+arm*1.35)*smoky*dust;
    const golden=.26+.74*Math.exp(-r*1.65), blue=1-golden;
    density[y*width+x]=stars+.7*bulge;
    const i=y*stride+x*3+1;
    pixels[i]=pack(4+stars*(147*golden+57*blue)+bulge*124+nucleus*103);
    pixels[i+1]=pack(7+stars*(111*golden+62*blue)+bulge*87+nucleus*96);
    pixels[i+2]=pack(14+stars*(65*golden+144*blue)+bulge*53+nucleus*75);
  }
  // 尘带里的星团密度来自同一张亮度场。高亮星才在邻域溢光，保留暗部和细颗粒。
  for(let n=0;n<width*height*.21;n++) {
    const x=Math.floor(random()*width),y=Math.floor(random()*height),d=density[y*width+x];
    if(random()>.04+d*.94)continue;
    const strength=(.15+Math.pow(random(),3.8))*Math.min(196,46+d*162),warm=random()<.47;
    const light=(px,py,s)=>{
      if(px<0||py<0||px>=width||py>=height)return;
      const i=py*stride+px*3+1;
      pixels[i]=pack(pixels[i]+s*(warm?1:.72));pixels[i+1]=pack(pixels[i+1]+s*.89);pixels[i+2]=pack(pixels[i+2]+s*(warm?.72:1));
    };
    light(x,y,strength);
    if(strength>68){for(const dir of [[-1,0],[1,0],[0,1],[0,-1]])light(x+dir[0],y+dir[1],strength*.20);}
  }
  // 单行滤波器字节为零。PNG 与 CRC 在构建期编码，无需为一张可复算的星野引入浏览器编码依赖。
  const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0;});
  const chunk=(type,body)=>{
    const data=Buffer.concat([Buffer.from(type),body]), result=Buffer.alloc(data.length+8);
    let crc=0xffffffff;for(const byte of data)crc=(crc>>>8)^table[(crc^byte)&255];
    result.writeUInt32BE(body.length);data.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels,{level:9})),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
