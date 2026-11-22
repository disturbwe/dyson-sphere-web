# 戴森球计划 · 网页复刻

> **整体复刻完成度约 40%（开发者估算）**
> 估算涵盖原作的玩法、画面和操作体验。工厂生产、跨星物流和戴森球施工已可分段游玩，从标准着陆到通关的整局流程仍待验证。

[查看实机截图](#实机截图) · [查看玩法与进度](./docs/玩法对照.md)

以《戴森球计划》为参照的非官方 3D 网页游戏。下载仓库 ZIP 并解压，或用 Git 克隆仓库，即可在桌面浏览器中打开离线游戏。

![网页实机：恒星与在建的戴森球壳层](./docs/stellar-yard.png)

双击 [离线游戏](./index.html) 后选择「开始着陆」。使用支持 WebGL 2 的桌面浏览器。三维模型、着色器、界面与玩法模拟均在本地运行。项目以公开游戏资料和实机画面为参照，保留独立的教学档与标准进度。

第一次着陆可按 **V** 寻找铁矿和铜矿，点击采集，再按 **E** 制作磁线圈，按 **T** 研究电磁学。用风力供电，给采矿机接出传送带，再用分拣器把原矿送入冶炼炉。**B** 打开建造菜单，**F** 打开背包，**P** 查看生产统计，**Esc** 返回。

标题页的「教学工厂」可体验自动冶炼、分流与集装、喷涂、机甲配送、蓝图建设、石油精炼、星际货运、跨星球输电、巨星采集、海岸整地、黑雾地面防守、黑雾样本研究、行星护盾与中继降落、跨星地质勘查、矿物连续研究和宇宙矩阵交付。每个教学场景使用独立存档。恒星工程沙盒中按 **Y** 查看和编辑戴森球，按 **U** 打开星图选择其他天体。**M** 切换行星视图，**J** 打开地形笔刷。

进度会自动保存在当前浏览器。系统菜单可保存、导出、导入和选择画质。节能档限制为 30 FPS 和 90 万物理像素。生产统计、资源余额和壳层施工由固定步长模拟结算。离开标签页后暂停绘制与模拟。

玩法收集、可验证的产线、参考图和待完成部分见 [玩法对照](./docs/玩法对照.md)。

## 实机截图

以下画面均截自网页版的实际运行。点击预览可查看原图和界面读数。

### 地表工厂

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/advanced-mining.png"><img src="./docs/previews/advanced-mining.jpg" alt="大型采矿机实机截图"></a><br>
      <strong>大型采矿机</strong><br>采矿机覆盖铁矿脉，需求塔派运输机来取矿。
    </td>
    <td width="50%" valign="top">
      <a href="./docs/refit.png"><img src="./docs/previews/refit.jpg" alt="产线原位换装实机截图"></a><br>
      <strong>产线原位换装</strong><br>换成集装分拣器和蓝带后，测点读到每分钟 7,200 件铁块。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/blueprint.png"><img src="./docs/previews/blueprint.jpg" alt="蓝图施工实机截图"></a><br>
      <strong>蓝图施工</strong><br>框选冶炼线、旋转蓝图，再让建设机逐件送来设备。
    </td>
    <td width="50%" valign="top">
      <a href="./docs/production.png"><img src="./docs/previews/production.jpg" alt="生产统计实机截图"></a><br>
      <strong>生产统计</strong><br>按时间范围对照铁矿消耗和铁块产量。
    </td>
  </tr>
</table>

### 跨行星工业

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/refinery.png"><img src="./docs/previews/refinery.jpg" alt="精炼与分馏实机截图"></a><br>
      <strong>精炼与分馏</strong><br>原油精炼产生氢，分馏环让未转化的氢继续循环。
    </td>
    <td width="50%" valign="top">
      <a href="./docs/logistics.png"><img src="./docs/previews/logistics.jpg" alt="跨星球物流实机截图"></a><br>
      <strong>跨星球物流</strong><br>运输船运回钛石，再由本地运输机分拨。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/orbital-collectors.png"><img src="./docs/previews/orbital-collectors.jpg" alt="巨星轨道采集实机截图"></a><br>
      <strong>巨星轨道采集</strong><br>在巨星赤道布置采集器，等待运输船来取货。
    </td>
    <td width="50%" valign="top">
      <a href="./docs/planetary-shield.png"><img src="./docs/previews/planetary-shield.jpg" alt="行星护盾实机截图"></a><br>
      <strong>行星护盾</strong><br>从轨道看发生器的覆盖范围和已抵挡的轨道伤害。
    </td>
  </tr>
</table>

### 航行与戴森工程

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/cluster.png"><img src="./docs/previews/cluster.jpg" alt="星团航线实机截图"></a><br>
      <strong>星团航线</strong><br>在星图上选择目标恒星，查看跨星距离。
    </td>
    <td width="50%" valign="top">
      <a href="./docs/sail-flight.png"><img src="./docs/previews/sail-flight.jpg" alt="机甲航行实机截图"></a><br>
      <strong>机甲航行</strong><br>跟随伊卡洛斯飞往目标行星。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="./docs/layer-orbit.png"><img src="./docs/previews/layer-orbit.jpg" alt="壳层设计实机截图"></a><br>
      <strong>壳层设计</strong><br>在编辑器中查看 9 km 和 14 km 两层轨道。
    </td>
    <td width="50%" valign="top">
      <a href="./docs/surface-sky.png"><img src="./docs/previews/surface-sky.jpg" alt="地表观星实机截图"></a><br>
      <strong>地表观星</strong><br>从行星表面仰望恒星，能透过尚未合拢的球壳看到日面。
    </td>
  </tr>
</table>

## 许可与来源

本项目的原创代码使用 [MIT 许可证](./LICENSE)。离线入口包含 [Three.js](https://github.com/mrdoob/three.js) 和源自 [FactorioLab](https://github.com/factoriolab/factoriolab/tree/50d8e977256344ab0405e32910c26a5fe09c404a/public/data/dsp) 的数值目录与译名，各自保留[引擎许可](./licenses/Three.txt)与[数据许可](./licenses/FactorioLab.txt)。仓库中的实机截图摄自本网页。《戴森球计划》的名称、商标与原作素材权利属于各自权利人。[原作主页](https://store.steampowered.com/app/1366540/Dyson_Sphere_Program/)

## 开发与验证

安装 Node.js 22.12 或更新版本后，在项目根目录运行下面的命令。安装依赖后可离线构建。

```sh
npm ci
npm test
npm run build
```

打包会重新生成 [离线入口](./index.html)，包含 Three.js、数值数据、样式与脚本。
