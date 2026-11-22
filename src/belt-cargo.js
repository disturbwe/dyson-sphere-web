import {sharePoints,receiveStock} from './stock.js';

/** 一段带占用一个货位，垛中 1–4 件必须同类。旧档没有 stack 时，已占用货位沿用单件。 */
export const cargoSize = belt => belt.cargo ? belt.stack || 1 : 0;

/** 分拣器、直连端口和集装机都用同一规则分走部分货垛的喷点。 */
export const cargoPoints=(belt,quantity=cargoSize(belt))=>sharePoints(belt.inc||0,cargoSize(belt),quantity);
export function unloadBelt(belt,owner,field,limit,passing=true){
  const qty=Math.min(limit,cargoSize(belt));
  if(qty){const item=belt.cargo,points=cargoPoints(belt,qty);takeCargo(belt,qty,passing);receiveStock(owner,field,item,qty,points);}
  return qty;
}

/** 向空货位放入整垛。传送时间由货位决定，堆高只影响件数。 */
export function putCargo(belt, item, quantity = 1, points = 0) {
  if(points||belt.inc!==undefined)belt.inc=points;
  belt.cargo = item;
  belt.travel = 0;
  if (quantity > 1 || belt.stack !== undefined) belt.stack = quantity;
}

/** 从本格取出实物件数，尾垛保留原有行程。生产与传输经过测点时计数，手动拆除或取出不计流量。 */
export function takeCargo(belt, quantity = cargoSize(belt), passing = true) {
  const size = cargoSize(belt), moved = Math.min(size, quantity);
  if (!moved) return 0;
  if(belt.inc)belt.inc-=cargoPoints(belt,moved);
  const meter = belt.monitor;
  if (passing && meter && belt.power > 0 && (!meter.filter || meter.filter === belt.cargo)) {
    meter.pending += moved;
    // 部分取出的尾垛仍然占同一货位，最后一件离开时才算一垛通过。
    if (moved === size) meter.pendingPiles++;
  }
  if (moved === size) {
    belt.cargo = null; belt.travel = 0;
    if (belt.stack !== undefined) belt.stack = 0;
  } else belt.stack = size - moved;
  return moved;
}
