export const escapeText = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function button(action,id,label,cls='') {
  return '<button class="'+cls+'" data-action="'+action+'" data-id="'+escapeText(id)+'">'+label+'</button>';
}
export const section=(title,detail='')=>'<div class="section-title">'+title+'<span>'+detail+'</span></div>';
export const note=text=>'<div class="note">'+text+'</div>';
export const line=(label,value)=>'<div class="recipe-line"><span>'+label+'</span><b class="numbers">'+value+'</b></div>';
export const powerText=kw=>kw>=1000000?(kw/1000000).toFixed(2)+' GW':kw>=1000?(kw/1000).toFixed(2)+' MW':Math.round(kw)+' kW';
export const timeText=seconds=>[Math.floor(seconds/3600),Math.floor(seconds/60)%60,Math.floor(seconds)%60].map(x=>String(x).padStart(2,'0')).join(':');
