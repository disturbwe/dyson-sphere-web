import {build} from 'esbuild';
import {galacticLight} from './galactic-light.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// HTML 内联依赖、模板和数据，双击文件即可离线启动，不依赖本地服务、模块跨域或 CDN。
const result=await build({absWorkingDir:root,entryPoints:['src/main.js'],bundle:true,format:'iife',minify:true,legalComments:'inline',write:false,target:['es2020']});
const [shell,css,stellarCss,stationCss,techCss,galaxyCss,statsCss,threeLicense,dataLicense]=await Promise.all(['src/shell.html','src/style.css','src/stellar.css','src/stations.css','src/tech.css','src/galaxy.css','src/production.css','node_modules/three/LICENSE','licenses/FactorioLab.txt'].map(p=>readFile(root+p,'utf8')));
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
await writeFile(root+'index.html',shell.replace('/*__STYLE__*/',()=>css).replace('/*__STELLAR_STYLE__*/',()=>stellarCss).replace('/*__STATION_STYLE__*/',()=>stationCss).replace('/*__TECH_STYLE__*/',()=>techCss).replace('/*__GALAXY_STYLE__*/',()=>galaxyCss).replace('/*__STATS_STYLE__*/',()=>statsCss).replace('__GALAXY_SKY__',()=>galacticLight()).replace('/*__GAME__*/',()=>js).replace('</body>',()=> '<!-- Three.js\n'+threeLicense+'\nFactorioLab DSP data\n'+dataLicense+' -->\n</body>'));
console.log('已生成离线入口 index.html');
