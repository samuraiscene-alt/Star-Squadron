const fs=require('fs'),vm=require('vm'),assert=require('assert');
const native=process.argv.includes('--render')?require('@napi-rs/canvas'):null;
const grad={addColorStop(){}};
const ctx=new Proxy({createRadialGradient:()=>grad,createLinearGradient:()=>grad,measureText:()=>({width:100})},{get:(o,k)=>k in o?o[k]:()=>{}});
const canvas=native?native.createCanvas(360,780):{getContext:()=>ctx};canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:780});
const sandbox={console,Math,Set,Map,window:{innerWidth:360,innerHeight:780,devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>native?native.createCanvas(1,1):{getContext:()=>ctx},addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};

let code=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.g={enemyFire,bossFire,updateEnemyShot,beginGame,get:()=>({enemyShots,ship,boss}),reset:n=>{stage=n;enemyShots=[]},setBoss:b=>boss=b};})();`);
vm.runInNewContext(code,sandbox);const g=sandbox.g;g.beginGame();
for(const stage of [1,10,11,20,30,31,65,100]){
 g.reset(stage);g.enemyFire({kind:'armored',col:1,x:180,y:100});let shots=g.get().enemyShots;
 assert.equal(shots.length,stage<11||stage>=31?1:2);
 if(stage>=11&&stage<31){assert(shots.every(s=>s.type==='spread'));const angles=shots.map(s=>Math.atan2(s.vy,s.vx));assert(Math.abs(angles[1]-angles[0]-.16)<1e-9);assert.equal(shots[1].x-shots[0].x,8);}
 if(stage>=31){assert.equal(shots[0].type,'homing');assert(shots[0].speed<=135);}
}
g.reset(31);g.enemyFire({kind:'armored',col:1,x:180,y:100});let shot=g.get().enemyShots[0];g.get().ship.x=300;let oldAngle=Math.atan2(shot.vy,shot.vx);g.updateEnemyShot(shot,.1);assert(Math.atan2(shot.vy,shot.vx)<oldAngle,'turn toward right');assert(Math.abs(Math.atan2(shot.vy,shot.vx)-oldAngle)<=.045001);
g.get().ship.x=60;oldAngle=Math.atan2(shot.vy,shot.vx);g.updateEnemyShot(shot,.1);assert(Math.atan2(shot.vy,shot.vx)>oldAngle,'follow left movement');
for(let i=0;i<700;i++){g.get().ship.x=i%100<50?50:310;g.updateEnemyShot(shot,.02);assert(shot.vy>0,'never turns upward');}assert(shot.guidanceEnded);const vx=shot.vx,vy=shot.vy;g.get().ship.y=shot.y+200;g.get().ship.x=0;g.updateEnemyShot(shot,.5);assert.equal(shot.vx,vx);assert.equal(shot.vy,vy);
g.reset(31);g.get().ship.y=640;g.enemyFire({kind:'armored',col:1,x:180,y:100});shot=g.get().enemyShots[0];shot.y=650;g.updateEnemyShot(shot,.01);assert(shot.guidanceEnded);g.get().ship.y=750;g.updateEnemyShot(shot,.01);assert(shot.guidanceEnded,'tracking cannot resume');
for(const stage of [10,20,40,100]){g.reset(stage);g.setBoss({x:180,y:100,tier:4,volley:2,color:'#fff'});g.bossFire();assert.equal(g.get().enemyShots.filter(s=>s.type==='spread').length,stage>=20?2:0);assert.equal(g.get().enemyShots.filter(s=>s.type==='homing').length,stage>=40?1:0);}
console.log('PASS: stage-gated narrow twin spread, slower guided missiles, left/right steering, bounded turns, downward-only flight, permanent tracking cutoff, boss weapon stages');
