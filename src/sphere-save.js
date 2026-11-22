import {starRadiusRange} from './sphere.js';

const integer = n => Number.isSafeInteger(n) && n >= 0;
const between = (n, low, high) => Number.isFinite(n) && n >= low && n <= high;
const validRadius = n => Number.isInteger(n) && between(n, ...starRadiusRange);
function check(value) { if (!value) throw new Error('戴森球存档含有无效的轨道或施工记录'); }
function checkOrbit(orbit) {
  check(validRadius(orbit.radius) && between(orbit.tilt, 0, 180) && between(orbit.longitude, 0, 360));
}

/** 校验导入的轨道、设计引用和实物余额。错误直接拒绝整个存档，避免恢复后重复发射或给未建结构发电。 */
export function validateSphere(sphere) {
  check(sphere && between(sphere.luminosity, .001, 1000) && integer(sphere.serial) && integer(sphere.revision));
  check(Array.isArray(sphere.orbits) && between(sphere.orbits.length, 1, 20));
  check(Array.isArray(sphere.layers) && sphere.layers.length <= 10 && Array.isArray(sphere.cohorts) && Array.isArray(sphere.flights));
  for (const key of ['launchedSails','launchedRockets','expired','absorbed']) check(integer(sphere[key]));
  check(Number.isFinite(sphere.receivedKW) && sphere.receivedKW >= 0);

  const used = new Set();
  function claim(id) {
    check(integer(id) && id > 0 && id < sphere.serial && !used.has(id));
    used.add(id);
  }
  for (const orbit of sphere.orbits) { claim(orbit.id); checkOrbit(orbit); }
  const orbitIds = new Set(sphere.orbits.map(orbit => orbit.id));
  for (const cohort of sphere.cohorts) {
    checkOrbit(cohort);
    check(orbitIds.has(cohort.orbit) && integer(cohort.count) && cohort.count > 0 && integer(cohort.expires));
  }

  const orders = new Map();
  const radii = [];
  for (const layer of sphere.layers) {
    claim(layer.id);
    check(validRadius(layer.radius) && radii.every(radius => Math.abs(radius-layer.radius) >= 1000));
    // 旧档缺省赤道朝向。校验有值的字段可在进入着色器前拦截无效矩阵。
    check((layer.tilt===undefined||between(layer.tilt,0,180)) && (layer.longitude===undefined||between(layer.longitude,0,360)));
    check(layer.epoch===undefined||(Number.isFinite(layer.epoch)&&layer.epoch>=0));
    radii.push(layer.radius);
    check(Array.isArray(layer.nodes) && Array.isArray(layer.edges) && Array.isArray(layer.shells));
    const nodes = new Set();
    const edges = new Map();
    for (const part of [...layer.nodes, ...layer.edges]) {
      claim(part.id);
      check(integer(part.required) && part.required > 0 && integer(part.built) && integer(part.ordered) && part.built + part.ordered <= part.required);
      orders.set(part.id, { layer:layer.id, ordered:part.ordered, flights:0 });
    }
    for (const node of layer.nodes) {
      check(node.required === 30 && between(node.lon, -180, 180) && between(node.lat, -90, 90) && between(node.absorbTime, 0, 6));
      nodes.add(node.id);
    }
    for (const edge of layer.edges) {
      check(nodes.has(edge.a) && nodes.has(edge.b) && edge.a !== edge.b);
      edges.set(edge.id, edge);
    }
    for (const shell of layer.shells) {
      claim(shell.id);
      check(integer(shell.cells) && integer(shell.required) && shell.required > 0 && shell.cells <= shell.required);
      check(Array.isArray(shell.nodes) && Array.isArray(shell.borders) && shell.nodes.length >= 3 && shell.nodes.length === shell.borders.length && new Set(shell.nodes).size === shell.nodes.length);
      shell.nodes.forEach((id,i) => {
        const next=shell.nodes[(i+1)%shell.nodes.length], edge=edges.get(shell.borders[i]);
        check(nodes.has(id) && edge && (edge.a===id && edge.b===next || edge.b===id && edge.a===next));
      });
    }
  }
  let lastArrival = 0;
  for (const flight of sphere.flights) {
    const order = orders.get(flight.part);
    check(integer(flight.part) && integer(flight.layer) && Number.isFinite(flight.arrival) && flight.arrival >= lastArrival);
    lastArrival = flight.arrival;
    // 玩家可以在飞行途中拆掉目标。在途实物照常抵达并报废，不能给其它构件补单。
    if (order) { check(order.layer === flight.layer); order.flights++; }
  }
  for (const order of orders.values()) check(order.flights === order.ordered);
}
