const fs=require('fs'),vm=require('vm'),assert=require('assert'),{createCanvas}=require('@napi-rs/canvas');
const canvas=createCanvas(360,780);canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:780});
const sandbox={Math,Set,Map,window:{devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>createCanvas(1,1),addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
let source=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.g={flightPosition,capturedCraftImage,craftImage,beginGame,startStage,launchGroupAttack,captureFighter,capturedFighterPosition,damageEnemy,update,render,get:()=>({enemies,bursts,particles,ship,captureAnimation,items,dualFighter}),setStage:s=>{stage=s;startStage()}};})();`);
vm.runInNewContext(source,sandbox);const g=sandbox.g;
for(const stage of [1,29,31,61,91,99]){
 g.beginGame();g.setStage(stage);g.get().ship.invulnerable=999;for(let i=0;i<180;i++)g.update(1/60);
 for(const e of g.get().enemies){e.dive=null;e.beam=null;}
 g.launchGroupAttack();let flying=g.get().enemies.filter(e=>e.dive);assert(new Set(flying.map(e=>e.dive.route)).size>=2,'several simultaneous routes');
 if(stage===1){
  const wrapped=flying.find(e=>e.dive.wrapReturn);assert(wrapped,'bottom exit wing');
  const f=wrapped.dive;const split=4/f.route.length;
  assert(g.flightPosition(f,split-.00001).y>780,'exit completely below screen');
  assert(g.flightPosition(f,split+.00001).y<0,'reappear above screen');
  const end=g.flightPosition(f,1);assert(Math.abs(end.x-wrapped.baseX)<.01&&Math.abs(end.y-wrapped.baseY)<.01,'return to formation');
  assert(flying.some(e=>!e.dive.wrapReturn),'looping return retained');
 }
 for(let i=0;i<1400;i++){
  g.update(1/60);const flying=g.get().enemies.filter(e=>e.alive&&e.dive);assert(flying.length<=(stage<26?12:stage<51?15:18));assert(flying.filter(e=>e.dive.fireTimes.length).length<=Math.min(5,2+Math.floor((stage-1)/30)));
  for(const e of flying)assert(Number.isFinite(e.x)&&Number.isFinite(e.y));
 }
}
for(let level=1;level<=5;level++){
 const normal=g.craftImage('player',level);const gray=g.capturedCraftImage(level);assert.equal(g.capturedCraftImage(level),gray,'reuse grayscale artwork');
 const orig=normal.getContext('2d').getImageData(0,0,normal.width,normal.height).data;const pixels=gray.getContext('2d').getImageData(0,0,gray.width,gray.height).data;let count=0,color=0;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]>20){assert(Math.abs(pixels[i]-pixels[i+1])<=1);assert(Math.abs(pixels[i+1]-pixels[i+2])<=1);count++;}if(orig[i+3]>100&&Math.abs(orig[i]-orig[i+2])>10)color++;}
 assert(count>100&&color>100);
}
g.beginGame();g.get().ship.invulnerable=999;for(let i=0;i<180;i++)g.update(1/60);let captor=g.get().enemies.find(e=>e.role==='captor');captor.x=180;captor.y=440;captor.beam={phase:'active',age:0};g.get().ship.x=165;g.get().ship.invulnerable=0;g.captureFighter(captor);
for(let i=0;i<33;i++)g.update(1/60);g.render(0);fs.writeFileSync('/tmp/v19-spinning.png',canvas.toBuffer('image/png'));
for(let i=0;i<40;i++)g.update(1/60);g.render(0);fs.writeFileSync('/tmp/v19-gray.png',canvas.toBuffer('image/png'));
g.damageEnemy(captor,999);let rescue=g.get().items.find(e=>e.type==='rescue');assert(rescue);g.update(.35);rescue.y=g.get().ship.y;g.get().ship.x=rescue.x;g.update(.01);assert(g.get().dualFighter);g.render(0);fs.writeFileSync('/tmp/v19-rescued.png',canvas.toBuffer('image/png'));
g.beginGame();g.get().ship.invulnerable=999;for(let i=0;i<180;i++)g.update(1/60);for(const enemy of g.get().enemies.slice(0,3))g.damageEnemy(enemy,999);assert.equal(g.get().bursts.length,3);assert(g.get().particles.length>=90);g.update(.15);g.render(0);fs.writeFileSync('/tmp/v19-bursts.png',canvas.toBuffer('image/png'));g.update(1);assert.equal(g.get().bursts.length,0);
console.log('PASS: simultaneous varied routes, bounded flyers/shooters in six stages, true grayscale for all five weapons, rotating pull/gray docking/color rescue renders, layered bounded explosions');
