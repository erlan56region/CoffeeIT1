const fs = require('fs'), vm = require('vm');
const raf = [], listeners = {}, canvasListeners = {};
let errors = 0;
class CanvasRenderingContext2D {
  constructor(){this.canvas={};}
}
const gradient = {addColorStop(){}};
for (const name of ['save','restore','translate','rotate','scale','setTransform','fillRect','strokeRect','beginPath','closePath','moveTo','lineTo','arcTo','arc','ellipse','fill','stroke','drawImage','clip','quadraticCurveTo','bezierCurveTo','strokeText','fillText','roundRect']) CanvasRenderingContext2D.prototype[name]=function(){};
CanvasRenderingContext2D.prototype.createLinearGradient=function(){return gradient};
CanvasRenderingContext2D.prototype.measureText=function(t){return {width:String(t).length*11}};
const cvs = new CanvasRenderingContext2D();
cvs.width=1280;cvs.height=720;
cvs.getContext=()=>cvs;
cvs.addEventListener=(n,f)=>(canvasListeners[n]??=[]).push(f);
cvs.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:720});
class Image {
  set src(v){this._src=v; const file=v.startsWith('assets/')?'game/'+v:''; if(file&&fs.existsSync(file)){const b=fs.readFileSync(file);if(b.toString('ascii',1,4)==='PNG'){this.width=b.readUInt32BE(16);this.height=b.readUInt32BE(20);}else{this.width=1568;this.height=665;}}else{this.width=232;this.height=300;}queueMicrotask(()=>this.onload&&this.onload());}
  get src(){return this._src}
}
const document={
  getElementById:()=>cvs,
  querySelectorAll:()=>[],
  createElement:()=>{const c=new CanvasRenderingContext2D();c.getContext=()=>c;return c;},
  fonts:null
};
const sandbox={console:{log:console.log,warn:console.warn,error:(...a)=>{errors++;console.error(...a)}},document,Image,CanvasRenderingContext2D,navigator:{maxTouchPoints:0},performance:{now:()=>0},
  requestAnimationFrame:f=>raf.push(f),setTimeout:()=>0,Math,Promise,Set,Number,Array,Object,String,JSON,
  addEventListener:(n,f)=>(listeners[n]??=[]).push(f)};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('game/campaign.js','utf8'),sandbox);
const testSource=fs.readFileSync('game/game.js','utf8').replace(/\n\}\)\(\);\s*$/, '\nwindow.__test={loadStage,get:()=>({stageIndex,state,level,player,race,unlockedWeapons}),completeStage};\n})();');
vm.runInContext(testSource,sandbox);
const frame=()=>{const f=raf.shift();if(!f)throw Error('Missing animation frame');f(frame.now);};
const key=(code,type='keydown')=>listeners[type].forEach(f=>f({code,preventDefault(){}}));
const pointer=(type,x,y,pointerType='mouse')=>(canvasListeners[type]||[]).forEach(f=>f({clientX:x,clientY:y,pointerType,button:0,preventDefault(){}}));
(async()=>{
 await new Promise(queueMicrotask);await new Promise(queueMicrotask);
 frame.now=0;frame();
 key('Enter');frame.now=17;frame();key('Enter','keyup');
 key('ArrowRight');
 for(let i=0;i<100;i++){frame.now+=16.67;frame();}
 key('Space');key('KeyX');
 for(let i=0;i<30;i++){frame.now+=16.67;frame();}
 key('Space','keyup');key('ArrowDown');
 for(let i=0;i<20;i++){frame.now+=16.67;frame();}
 key('ArrowDown','keyup');key('KeyX','keyup');key('ArrowRight','keyup');
 pointer('pointermove',100,100);pointer('pointerdown',100,100);
 for(let i=0;i<30;i++){frame.now+=16.67;frame();}
 listeners.pointerup.forEach(f=>f({}));
 for(let i=0;i<30;i++){frame.now+=16.67;frame();}
 for(let stage=0;stage<10;stage++){sandbox.__test.loadStage(stage);for(let i=0;i<35;i++){frame.now+=16.67;frame();}const info=sandbox.__test.get();if(info.stageIndex!==stage)throw Error('Stage failed '+stage);if(info.level.crows.some(c=>c.typeId===undefined))throw Error('Untyped enemy '+stage);}
for(let i=0;i<1400;i++){frame.now+=16.67;frame();}
if(errors)throw Error(`Game logged ${errors} runtime errors`);
 console.log('Campaign smoke test OK: 10 stages, race, directional fire, SNES assets and rendered frames');
})().catch(e=>{console.error(e);process.exitCode=1});
