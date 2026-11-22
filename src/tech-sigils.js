const imageCache=new Map();
function family(id) {
  if (id==='mission-completed') return 'completion';
  if (id==='dsp-program'||id.includes('sphere')) return 'sphere';
  if (id==='electromagnetism'||id.includes('power')||id.includes('energy-circuit')) return 'power';
  if (id.includes('matrix')||id.includes('crystal')) return 'matrix';
  if (/logistics|sorter|cargo/.test(id)) return 'conveyor';
  if (/metal|smelt|alloy|iron|steel/.test(id)) return 'furnace';
  if (/assembling|printing|construction|reconstruction/.test(id)) return 'press';
  if (/semiconductor|processor|chip|information|simulation|control/.test(id)) return 'chip';
  if (/solar|photon|radiat|ray-receiv/.test(id)) return 'sun';
  if (/drive|thruster|engine|flight/.test(id)) return 'engine';
  if (/exploration|observation|antenna/.test(id)) return 'signal';
  if (/mecha|frame|inventory|core/.test(id)) return 'core';
  if (/magnet|particle|quantum|plasma|fusion/.test(id)) return 'atom';
  if (/df-/.test(id)) return 'shield';
  return 'flask';
}
/** 原创单色科研符号按工程门类复用。一次栅格化后缩放共用，拖动图谱时不重新创建绘图上下文。 */
export function scienceIcon(id) {
  const key=family(id);
  if(imageCache.has(key))return imageCache.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=108;
  const g=canvas.getContext('2d');g.scale(3,3);g.translate(18,18);
  g.strokeStyle=g.fillStyle='#e1ebe5';g.lineWidth=1.45;g.lineJoin='round';g.lineCap='round';
  const path=(points,fill=false)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));if(fill){g.closePath();g.fill();}else g.stroke();};
  const oval=(x,y,rx,ry=rx,angle=0,solid=false)=>{g.beginPath();g.ellipse(x,y,rx,ry,angle,0,Math.PI*2);if(solid)g.fill();else g.stroke();};
  const mark=(x,y)=>oval(x,y,1.7,1.7,0,true);
  if(key==='completion'){
    // 戴森球的经纬栅格与外侧收集面的缺口共同构成交付徽记，缩小时仍能辨认星体轮廓。
    oval(0,0,11);oval(0,0,5.6,11,-.25);oval(0,0,11,4.8,.22);oval(0,0,14,2.9,-.57);
    for(const angle of [.4,2.25,4.4]){const x=Math.cos(angle)*11,y=Math.sin(angle)*11;g.fillRect(x-1.9,y-1.5,3.8,3);}
  }
  if(key==='sphere'){oval(0,1,9);oval(0,1,14,4.6,-.48);oval(0,1,4,9,.2);mark(12,-6);path([[-10,11],[10,11]]);}
  if(key==='power'){path([[3,-12],[-7,1],[-1,1],[-4,12],[8,-3],[1,-3]],true);for(const sign of [-1,1]){path([[-10,sign*9],[-5,sign*12],[1,sign*13],[7,sign*12]]);path([[-7,sign*6],[-4,sign*8],[-1,sign*8.5]]);}}
  if(key==='matrix'){const v=[[0,-12],[10,-6],[10,7],[0,12],[-10,6],[-10,-6]];path([...v,v[0]]);path([v[1],[0,0],v[5]]);path([[0,0],v[3]]);for(const [x,y] of [...v,[0,0]])mark(x,y);}
  if(key==='conveyor'){g.rotate(.32);g.beginPath();g.roundRect(-12,-5,24,10,4.9);g.stroke();for(const x of [-7,0,7])oval(x,0,2);path([[-8,9],[8,9],[8,7],[13,9],[8,12],[8,10]]);}
  if(key==='furnace'){path([[-14,-6],[14,-6],[9,-1],[3,0],[2,6],[7,9],[7,11],[-7,11],[-7,9],[-2,6],[-3,0],[-8,-1]],true);for(const x of [-5,1,7])path([[x,-9],[x+1,-12],[x,-14]]);}
  if(key==='press'){g.strokeRect(-12,-10,24,4);g.fillRect(-10,-5,3,14);g.fillRect(7,-5,3,14);g.fillRect(-12,9,24,3);path([[-4,-6],[-4,0],[-2,3],[2,3],[4,0],[4,-6]],true);g.strokeRect(-5,5,10,3);}
  if(key==='chip'){g.strokeRect(-8,-8,16,16);g.strokeRect(-4,-4,8,8);for(const x of [-5,0,5]){path([[x,-9],[x,-13]]);path([[x,9],[x,13]]);path([[-9,x],[-13,x]]);path([[9,x],[13,x]]);}}
  if(key==='sun'){oval(0,0,6,6,0,true);for(let i=0;i<12;i++){g.rotate(Math.PI/6);path([[0,9],[0,13]]);}}
  if(key==='atom'){for(const a of [0,Math.PI/3,-Math.PI/3])oval(0,0,13,4.9,a);mark(0,0);mark(11,-4);}
  if(key==='engine'){path([[-7,-10],[7,-10],[8,0],[5,6],[-5,6],[-8,0],[-7,-10]]);g.fillRect(-5,-7,10,3);for(const x of [-4,0,4])path([[x,8],[x,12+(x===0?2:0)]]);}
  if(key==='signal'){path([[-8,12],[8,12],[1,3],[-1,3],[-8,12]]);path([[-10,-6],[8,3],[-2,3],[-7,0],[-10,-6]]);for(const r of [6,10]){g.beginPath();g.arc(-1,0,r,-1.35,-.32);g.stroke();}mark(-1,0);}
  if(key==='core'){path([[0,-12],[10,-6],[10,6],[0,12],[-10,6],[-10,-6],[0,-12]]);oval(0,0,6);mark(0,0);}
  if(key==='shield'){path([[0,-12],[11,-8],[9,3],[6,8],[0,13],[-6,8],[-9,3],[-11,-8],[0,-12]]);path([[-4,4],[0,-6],[4,4],[0,1],[-4,4]]);}
  if(key==='flask'){path([[-4,-11],[4,-11]]);path([[-2,-10],[-2,-3],[-10,11],[10,11],[2,-3],[2,-10]]);path([[-6,5],[6,5],[9,10],[-9,10]],true);mark(5,-13);}
  const img='<img class="science-icon" alt="" draggable="false" src="'+canvas.toDataURL()+'">';imageCache.set(key,img);return img;
}
