import {addLayer, addNode, addEdge, addShell, setOrbit, releaseSails} from './sphere.js';

/** 给新建恒星沙盒交接一座环带工地。施工量全部入账，故玩家可逐件拆除、续建和回收；已有存档保持自己的图纸。 */
export function seedOrbitalYard(game) {
  const sphere = game.dyson;
  const layer = addLayer(sphere, 9000);
  const point = (sector, lat) => addNode(sphere, layer, sector * 30, lat, 90).id;
  const rails = new Map();
  function beam(a, b) {
    const key = [Math.min(a,b), Math.max(a,b)].join('/');
    if (!rails.has(key)) rails.set(key, addEdge(sphere, layer, a, b));
    return rails.get(key);
  }
  function facet(corners, coverage) {
    corners.forEach((a, i) => beam(a, corners[(i+1) % corners.length]));
    const panel = addShell(sphere, layer, corners);
    panel.cells = Math.floor(panel.required * coverage);
    sphere.absorbed += panel.cells;
  }
  const belt = [-9, 9].map(lat => Array.from({length:12}, (_,i) => point(i, lat)));
  const [south, north] = belt;
  const fill = [.74, 1, .26, .94, 1, .43, 1, .11, 1, .80, .36, .94];
  for (let i = 0; i < 12; i++) {
    const j = (i+1) % 12;
    facet([south[i], south[j], north[j], north[i]], fill[i]);
  }
  // 六条子午肋留出敞开的维修窗。极冠和赤道带共用节点，拉近仍能沿着同一根梁追到壳片。
  for (const sign of [-1, 1]) {
    const root = sign > 0 ? north : south;
    const shoulder = Array.from({length:6}, (_,i) => point(i*2, sign*45));
    const crown = Array.from({length:6}, (_,i) => point(i*2+1, sign*66));
    for (let i = 0; i < 6; i++) {
      const j = (i+1)%6;
      beam(root[i*2], shoulder[i]);
      beam(shoulder[i], crown[i]); beam(crown[i], shoulder[j]); beam(crown[i], crown[j]);
      if (i%2 === (sign>0?0:1)) facet([shoulder[i], crown[i], crown[(i+5)%6]], .53 + .08*i);
      if ((i+6)%3 === (sign>0?1:0)) facet([root[i*2], root[i*2+1], shoulder[i]], .68);
    }
  }
  for (const part of [...layer.nodes, ...layer.edges]) {
    part.built = part.required;
    sphere.launchedRockets += part.built;
  }
  layer.edges[0].built -= 2;
  sphere.launchedRockets -= 2;
  const inner = setOrbit(sphere, sphere.orbits[0].id, 11100, 12, 33);
  const polar = setOrbit(sphere, null, 12300, 58, 128);
  releaseSails(game, inner, 1350); releaseSails(game, polar, 730);
  sphere.launchedSails = sphere.absorbed + 2080;
}
