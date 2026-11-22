// 库存仍只枚举实物数量。喷点在所属实体旁单独持久化，旧档和普通物资无需分配额外记录。
const pointBooks = new WeakMap();
export const count = (bag,id) => bag[id] || 0;
export const stockPoints = (bag,id) => pointBooks.get(bag)?.[id] || 0;

/** 同类堆叠共享总喷点。拆走一部分取整，余数归留存的实物，搬空时最后一件带走全部尾数。 */
export function sharePoints(points,size,quantity) {
  if (!points || !size || !quantity) return 0;
  if (quantity>=size) return points;
  return Math.floor(points/size)*quantity + Math.floor((points%size)*quantity/size);
}
export function add(bag,id,n) {
  const before=count(bag,id), after=before+n;
  let spent=0;
  if(n<0){
    const points=pointBooks.get(bag);
    if(points?.[id]){
      spent=sharePoints(points[id],before,-n);
      if(points[id]===spent)delete points[id];else points[id]-=spent;
    }
  }
  if(after<=1e-8)delete bag[id];else bag[id]=after;
  return spent;
}
/** 给已入库的货登记随货喷点。台账只在首件带标货到达时分配，JSON 可直接保存。 */
export function creditPoints(owner,field,id,points){
  if(!points)return;
  const book=owner[field+'Points']??={};
  pointBooks.set(owner[field],book);book[id]=(book[id]||0)+points;
}
export function receiveStock(owner,field,id,qty,points=0){
  add(owner[field],id,qty);creditPoints(owner,field,id,points);
}
export function moveStock(source,owner,field,id,qty){
  const points=add(source,id,-qty);
  receiveStock(owner,field,id,qty,points);
}
export function moveAll(source,owner,field){
  for(const [id,qty] of Object.entries(source))moveStock(source,owner,field,id,qty);
}
/** 存档边界重建弱索引。每一喷点都须依附已有物料，单件最高四点，坏档整体拒绝。 */
export function restorePoints(owner,field){
  const book=owner[field+'Points'];
  if(book===undefined)return;
  if(!book||typeof book!=='object'||Array.isArray(book)||Object.entries(book).some(([id,n])=>!Object.hasOwn(owner[field],id)||!Number.isSafeInteger(n)||n<=0||n>4*owner[field][id]))throw new Error('库存增产点数无效');
  pointBooks.set(owner[field],book);
}
export const total=bag=>Object.values(bag).reduce((a,b)=>a+b,0);
export const enough=(bag,cost)=>Object.entries(cost).every(([id,n])=>count(bag,id)>=n);
export const merge=(bag,cost,sign=1)=>Object.entries(cost).forEach(([id,n])=>add(bag,id,n*sign));
