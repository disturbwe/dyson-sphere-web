import {belts,sorters,poles,generators,smelters,assemblers,stores,oreColors,tint,name} from './catalog.js';
const cache=new Map();
/** 工具栏图标按物品种类生成并缓存；钢材、矿脉、矩阵和建筑保持同一套等轴视角。 */
export function icon(id){
  if(cache.has(id))return cache.get(id);
  const c=document.createElement('canvas');c.width=c.height=80;const g=c.getContext('2d');g.scale(2,2);
  const poly=(pts,color)=>{g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=color;g.fill();};
  const line=(x,y,x2,y2,col,w=1.5)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke();};
  const cube=(x,y,w,h,col)=>{poly([[x-w,y],[x,y-w*.45],[x+w,y],[x,y+w*.45]],col);poly([[x-w,y],[x,y+w*.45],[x,y+w*.45+h],[x-w,y+h]],'#4b6878');poly([[x,y+w*.45],[x+w,y],[x+w,y+h],[x,y+w*.45+h]],'#344552');};
  const ring=(x,y,r,col,lw)=>{g.strokeStyle=col;g.lineWidth=lw;g.beginPath();g.ellipse(x,y,r,r*.48,-.22,0,Math.PI*2);g.stroke();};
  const col=tint(id);
  if(oreColors[id]){for(const [x,y,w] of [[12,23,8],[24,25,9],[21,15,7]]){poly([[x-w,y],[x-3,y-w],[x+4,y-w-2],[x+w,y+1],[x+1,y+5]],col);poly([[x-w,y],[x-3,y-w],[x,y+2],[x+1,y+5]],'#607685');poly([[x+4,y-w-2],[x+w,y+1],[x+1,y+5],[x,y+2]],'#425f6e');}}
  else if(['df-missile-turret','df-implosion-cannon','df-plasma-turret'].includes(id)){
    cube(20,28,11,4,'#aabcc7');line(19,27,21,16,'#546474',6);
    if(id==='df-missile-turret'){
      cube(20,12,11,7,'#dbc15f');line(13,12,23,8,'#c8d2d0',2);
      for(const [x,y] of [[12,16],[16,18],[12,20]]){ring(x,y,1.8,'#f4a464',2);}
    }else if(id==='df-implosion-cannon'){
      cube(21,14,12,7,'#ca6956');line(12,19,7,21,'#444e5a',5);line(16,13,26,9,'#e4ac9b',2);
    }else{ring(20,26,11,'#a590bc',2);for(const x of [14,20]){line(x+8,16,x-7,10,'#bbc9d7',3);line(x+6,15,x-6,10,'#997ded',1);}}
  }
  else if(['df-signal-tower','df-jammer-tower','df-plasma-turret-sr'].includes(id)){
    cube(20,29,8,4,'#b2c3cb');
    if(id==='df-signal-tower'){
      line(19,29,20,4,'#bdc8cd',2);line(20,9,20,4,'#d57969',1.4);
      for(const s of [-1,1])poly([[20,18],[20+s*9,14],[20+s*7,22],[20+s*2,24]],'#5c9bd3');
    }else if(id==='df-jammer-tower'){
      ring(20,25,11,'#607caa',3);for(const x of [10,17,25,30])line(x,25,x+(x<20?-2:2),16,'#6298e1',3);
      line(20,26,20,11,'#aabac9',3);ring(20,12,2.3,'#e67b73',3);
    }else{
      for(const s of [-1,0,1])line(20+s*5,29,20+s*3,10,'#adb4dc',2.5);
      ring(20,8,3.8,'#9d8ef2',3);ring(20,7,1.7,'#c8d4ff',2);
    }
  }
  else if(id==='df-gauss-turret'||id==='df-laser-turret'){
    const laser=id==='df-laser-turret';cube(20,29,10,4,'#a7b6c0');line(20,28,20,16,'#536476',6);
    cube(21,13,9,6,laser?'#a087af':'#d88b4f');
    for(const [x,y] of [[15,19],[23,21]]){line(x,y,x+9,y-5,laser?'#89848e':'#a9bdc1',3);line(x+8,y-5,x+10,y-6,laser?'#c7a1ef':'#e7bd79',2);}
  }
  else if(id==='df-battlefield-analysis-base'){
    cube(20,24,14,6,'#b5c5c7');ring(20,20,10,'#586479',4);line(20,20,20,9,'#a6b8bf',3);ring(20,10,8,'#b5c8ca',3);
    for(const [x,y] of [[7,24],[28,26],[20,30]])line(x,y,x+3,y-1,'#83e6d4',2);
  }
  else if(id==='df-planetary-shield-generator'){
    cube(20,32,8,3,'#91a4ae');line(20,32,20,6,'#263e53',5);
    for(const y of [14,21,28]){ring(20,y,4.4,'#70ccef',1.2);for(const s of [-1,1])poly([[20+s*2,y+3],[20+s*6,y-5],[20+s*4,y+3]],'#bfccd4');}
    for(const s of [-1,1])line(20+s*2,12,20+s*4,4,'#d6e5ed',1.8);line(20,11,20,4,'#71dfff',2);
  }
  else if(id==='holo-beacon'){
    cube(20,32,5,3,'#abbcaf');line(20,30,20,23,'#eef2da',4);line(17,24,14,18,'#84968a',2.5);line(23,24,26,17,'#a2ab94',2.3);
    line(20,22,20,12,'#b5f67e',1.6);ring(20,11,12,'#b5f67e',2);ring(20,11,7,'#88c970',1.4);
  }
  else if(id==='logistics-distributor'){
    cube(20,24,12,4,'#b4674b');cube(20,20,14,4,'#c9d5d8');
    ring(20,19,6,'#516778',3);line(11,18,11,9,'#a7bdc3',2);line(24,27,20,34,'#d07754',2.4);
    for(const x of [13,25])line(x,20,x+4,18,'#7bd6d9',2);
  }
  else if(id==='logistics-bot'){
    for(const [x,y] of [[9,24],[29,23],[19,11]]){line(20,21,x,y,'#a9bcc6',3.4);ring(x,y,6,'#597181',2.8);ring(x,y,4,'#cbd5d7',1.4);}
    cube(20,21,5,3,'#8aa3b0');
  }
  else if(id==='spray-coater'){
    cube(20,24,14,7,'#9ca9b1');line(8,30,19,14,'#e4e8dc',3);cube(25,12,8,8,'#d6dbcc');
    line(17,19,17,10,'#66cad4',7);ring(17,9,4,'#d7dac5',2);line(24,17,30,14,'#386372',2.6);
  }
  else if(id.startsWith('proliferator-')){
    const color=['#e8a64e','#69c593','#58c1de'][Number(id.slice(-1))-1]||'#85a4aa';
    line(20,27,20,13,color,14);ring(20,12,7,'#b8c6c6',2.2);ring(20,28,7,'#566974',2.4);line(15,17,15,23,'#d9e8df',1.3);
  }
  else if(id==='automatic-piler'){
    cube(21,25,13,7,'#b0b9c1');poly([[6,27],[19,11],[30,14],[17,31]],'#29496b');
    for(const y of [17,22,27]){const x=25-y*.45;line(x-3,y+1,x+1,y-2,'#66baff',2);line(x+1,y-2,x+5,y,'#66baff',2);}
    line(7,27,20,10,'#dce2dd',2.4);line(18,31,30,14,'#c3cdd0',2.4);cube(25,10,7,3,'#384956');
  }
  else if(id==='traffic-monitor'){
    for(const x of [10,27])line(x,18,x,32,'#9fabb9',3.8);cube(20,13,12,9,'#b6cec9');
    for(const x of [18,22,26])line(x,12,x-5,14,'#74e19b',1.7);
    for(const y of [19,22])for(const x of [24,27,30])line(x,y-(x-24)*.4,x+.4,y-(x-24)*.4,'#82eaa4',1.7);
  }
  else if(id==='splitter'){
    cube(20,17,15,12,'#c8cfc9');cube(20,15,10,2,'#9aabae');
    for(const [x,y] of [[10,26],[25,28]]){poly([[x-3,y-3],[x+3,y-2],[x+3,y+4],[x-3,y+3]],'#1e2c33');line(x-3,y-4,x+3,y-3,'#e2bb75',1.3);}
  }
  else if(id==='orbital-collector'){line(20,31,20,12,'#9caebd',7);ring(20,32,5,'#7dc9ff',2);for(const y of [19,24])ring(20,y,5,'#536e8c',2);ring(20,12,15,'#54728e',6);ring(20,10,15,'#cad7d8',2);cube(20,10,5,3,'#d9dbcf');for(const x of [9,16,26,32])line(x,10,x+2,12,'#95c7d4',1);}
  else if(id==='energy-exchanger'){cube(20,31,9,3,'#d1dbdc');line(20,29,20,10,'#94cfec',3);for(const [x,y] of [[6,12],[33,10],[27,17]]){line(19,29,x,y,'#d4dce0',2.6);line(20,12,x,y,'#67d9ef',1);}ring(20,13,14,'#69b7d9',1.1);}
  else if(id==='accumulator'||id==='accumulator-full'){cube(20,30,11,3,'#a4b4bf');for(const x of [13,20,27])line(x,28,x,11,'#a2b7c2',3);for(const y of [15,19,23])ring(20,y,6,id==='accumulator-full'?'#73dfde':'#5e738c',1.8);cube(20,9,10,3,'#c6d2d3');}
  else if(id==='geothermal-power-station'){cube(20,30,13,3,'#7a8999');line(20,28,20,10,'#555966',9);for(const y of [13,17,21])ring(20,y,6,'#f79c42',2);cube(20,9,7,2,'#c3cfcb');for(const x of [7,33])line(x,31,20,22,'#b1c2ca',2.7);}
  else if(id==='wind-turbine'||poles.includes(id)){
    cube(20,32,8,3,'#c0d5d6');line(20,31,20,8,'#b7cecf',2.4);
    if(id==='wind-turbine'){
      // 与地表模型同为竖轴叶片，窄屏工具栏也能靠轮廓识别。
      for(let i=0;i<3;i++){const dx=(i-1)*5;poly([[20+dx,3],[24+dx,11],[21+dx,20],[18+dx,26],[19+dx,18],[21+dx,10]],i===1?'#e6e7d9':'#9fb9c2');}
    }else for(let k=0;k<3;k++)ring(20,14+k*4,5-k*.3,'#8be4e7',2);
  }
  else if(id.endsWith('logistics-station')){const wide=id.startsWith('interstellar')?16:12;cube(20,32,7,3,'#b1c7cc');line(17,30,18,13,'#b6c5ce',2.5);line(23,31,22,12,'#466383',3);ring(20,25,4,'#5a7890',2);ring(20,13,wide,'#52739a',5);ring(20,10,wide,'#a9c0c8',3);cube(20,10,4,2,'#dce4e3');}
  else if(id==='logistics-drone'||id==='logistics-vessel'){poly([[4,26],[13,22],[25,10],[36,11],[27,21],[16,29]],'#bfd4da');cube(20,20,6,4,'#697c8e');for(const x of [10,20]){line(x,27,x-3,31,'#6bc6ef',3);line(x+7,16,x+11,13,'#e0b05b',2);}}
  else if(belts.includes(id)){poly([[3,23],[25,9],[37,16],[15,31]],'#f1be7c');poly([[3,26],[25,12],[37,19],[15,34]],'#546c79');for(let j=0;j<4;j++)line(8+j*5,23-j*3,14+j*5,27-j*3,'#b3c7bf',2);}
  else if(sorters.includes(id)){cube(12,27,7,4,'#9eb9c3');line(12,25,19,12,'#ffb667',5);line(19,12,31,17,'#d7dfd5',4);ring(20,12,3,'#536774',2);}
  else if(id==='magnetic-coil'||id==='magnet'){for(let i=0;i<4;i++)ring(20,22-i*2,11,id==='magnet'?'#8b9caf':'#de986a',3.2);}
  else if(id.includes('gear')){g.fillStyle='#b7c7d0';for(let i=0;i<10;i++){g.save();g.translate(20,21);g.rotate(i*Math.PI/5);g.fillRect(8,-2.5,5,5);g.restore();}ring(20,21,8,'#b7c7d0',7);}
  else if(id==='df-dark-fog-matrix'){
    // 黑雾矩阵是晶面相接的四面体，和常规立方矩阵靠外轮廓就能区分。
    poly([[20,3],[4,24],[20,35]],'#17676d');poly([[20,3],[36,23],[20,35]],'#7ee0d7');
    for(const k of [.33,.62,.84]){line(20,5+k*25,20-k*14,9+k*16,'#45b6b2',.8);line(20,5+k*25,20+k*13,11+k*14,'#b2fff1',.9);}
    line(20,4,20,35,'#abfff0',1.3);
  }else if(id==='df-dark-fog-lens'||id==='graviton-lens'){
    const fog=id==='df-dark-fog-lens';g.save();g.translate(20,20);g.rotate(-.72);
    const glass=g.createLinearGradient(-9,-12,11,11);
    glass.addColorStop(0,fog?'#201e59':'#173552');glass.addColorStop(.43,fog?'#a58de5':'#87d8db');glass.addColorStop(.57,fog?'#504780':'#408098');glass.addColorStop(1,'#172638');
    g.beginPath();g.ellipse(0,0,10,17,0,0,Math.PI*2);g.fillStyle=glass;g.fill();g.strokeStyle=fog?'#996dbe':'#7badbd';g.lineWidth=1.6;g.stroke();
    g.beginPath();g.ellipse(0,0,6.5,15,0,3.4,5.8);g.strokeStyle='#c4d5ea';g.lineWidth=.8;g.stroke();g.restore();
  }else if(id==='df-silicon-based-neuron'){
    cube(20,29,13,3,'#364752');
    for(const [x,y,a,b] of [[13,24,12,9],[21,26,24,10],[23,17,32,8],[13,18,6,13]]){
      line(x,y,a,b,'#81e2d6',1.6);ring(a,b,3,'#41b9b5',1.8);
    }
  }
  else if(id.includes('matrix')&&!id.includes('lab')){cube(20,16,12,12,col);line(8,16,20,22,col,1);line(20,22,20,34,col,1);}
  else if(id.includes('circuit')||id==='processor'){cube(20,20,15,3,'#5bb198');for(let j=0;j<3;j++){line(11+j*4,20+j*1.7,19+j*4,15+j*1.7,'#e8ce7e',1);cube(18+j*3,19+j*1.3,2,1,'#364d58');}}
  else if(generators.includes(id)||smelters.includes(id)||id.includes('mining')||assemblers.includes(id)||stores.includes(id)||id.endsWith('lab')){cube(20,25,16,4,'#c2c8ba');cube(20,18,12,8,smelters.includes(id)?'#df9a64':col);if(id.includes('mining')){for(let i=0;i<3;i++)line(8+i*4,24+i,4+i*4,31+i,'#eda85f',3);}else if(id.endsWith('lab'))cube(20,10,7,5,'#68dcff');else{cube(22,14,6,4,'#d8dbcb');line(11,22,19,26,'#e7b66c',2);}}
  else{cube(20,22,13,6,col);cube(21,16,10,4,col);}
  const result='<img class="item-icon" alt="" draggable="false" src="'+c.toDataURL()+'">';cache.set(id,result);return result;
}
