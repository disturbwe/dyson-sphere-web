const cache=new WeakMap();
const matchLevel=/^(.*)-(\d+)$/;

/** 从已完工的普通课题与连续等级生成能力表。连续等级使用独立快照，两种完成方式都会刷新缓存。 */
export function capabilitiesOf(game) {
  const list=game.techs;
  const cached=cache.get(list);
  const ranks=game.science?.ranks;
  if(cached?.length===list.length&&cached.ranks===ranks)return cached.value;
  const levels={};
  for(const id of list){
    const match=matchLevel.exec(id);
    if(match)levels[match[1]]=Math.max(levels[match[1]]||0,Number(match[2]));
  }
  for(const [base,rank] of Object.entries(ranks||{})){
    const family=base.slice(0,base.lastIndexOf('-'));
    levels[family]=Math.max(levels[family]||0,rank);
  }
  const level=id=>levels[id]||0;
  const table=(key,values)=>values[Math.min(values.length-1,level(key))];
  const drive=level('drive-engine'), mining=level('veins-utilization');
  const engine=level('logistics-carrier-engine'),hold=level('logistics-carrier-capacity');
  const damage=family=>table(family,[1,1.1,1.2,1.4,1.7,2])+.2*Math.max(0,level(family)-5);
  const value={
    levels,
    stressLatitude:Math.min(90,15*level('dyson-sphere-stress-system')),
    rayEfficiencyLevel:level('ray-transmission-efficiency'),
    kineticDamage:damage('df-kinetic-weapon-damage'),energyDamage:damage('df-energy-weapon-damage'),
    explosiveDamage:damage('df-explosive-weapon-damage'),
    durability:1+.04*level('df-enhanced-structure'),
    shieldEfficiency:table('df-planetary-shield',[1,1.10,1.25,1.45,1.70,2]),
    botRange:table('distribution-range',[40,60,80,110,140,180]),
    botLoad:table('logistics-carrier-capacity',[8,9,10,12,14,16,18,20]),
    botMS:table('logistics-carrier-engine',[6,7.2,8.4,10.2,13.2,15.6,18])+3*Math.max(0,engine-6),
    droneMS:table('logistics-carrier-engine',[8,9.6,11.2,13.6,16,19.2,22.4])+4*Math.max(0,engine-6),
    vesselMS:Math.max(600,300*engine),warpVessels:engine>=4,
    droneLoad:table('logistics-carrier-capacity',[25,30,35,40,50,60,70,80,100])+20*Math.min(5,Math.max(0,hold-8)),
    vesselLoad:table('logistics-carrier-capacity',[200,200,200,300,400,500,600,800,1000])+200*Math.min(5,Math.max(0,hold-8)),
    // 集成物流升级同时提高物流塔、高级矿机与采油机的出带垛高。集装分拣器按奇数档增加放货垛高。
    portHeight:1+Math.min(3,level('logistics-station-integrated-logistics')),
    sorterHeight:table('pile-sorter',[1,2,2,3,3,4,4]),
    sorterLoad:table('pile-sorter',[2,2,3,3,4,4,4]),
    sorterParallel:level('pile-sorter')>=6,
    storageBonus:1000*Math.min(5,Math.max(0,hold-8)),
    // 批量建造五级解除设施数量限制。建设机速度沿用 6 m/s 起点，数量由通讯控制增加。
    blueprintLimit:table('mass-construction',[0,150,300,900,3600,Infinity]),
    builders:table('communication-control',[3,4,6,6,9,12,12,15])+3*Math.max(0,level('communication-control')-7),
    builderMS:table('drone-engine',[6,8,10,12,15,18])+3*Math.max(0,level('drone-engine')-5),
    storageLayers:2+level('vertical-construction'),
    labLayers:3+2*level('vertical-construction'),
    drive,coreMJ:table('mecha-core',[120,200,400,800,1600,3200,5600])+2400*Math.max(0,level('mecha-core')-6),
    fuelMW:table('energy-circuit',[.8,1,1.2,1.4,1.6,2.4,3.4])+Math.max(0,level('energy-circuit')-6),
    walkingMS:table('mechanical-frame',[6,7,8,9,10,11,12,14,16]),
    sailMS:drive<2?0:drive===2?1000:2000,warpMS:drive<4?0:3*Math.min(100,drive)*40000,
    orePerItem:Math.pow(.94,mining),miningRate:1+.10*mining,
    labHashes:60*(1+level('research-speed')),
    sailLife:table('solar-sail-life',[5400,5700,6000,6600,7200,8100,9000])
  };
  cache.set(list,{length:list.length,ranks,value});
  return value;
}
