const fs=require('fs'),vm=require('vm'),assert=require('assert');
const native=process.argv.includes('--render')?require('@napi-rs/canvas'):null;
const grad={addColorStop(){}};
const ctx=new Proxy({createRadialGradient:()=>grad,createLinearGradient:()=>grad,measureText:()=>({width:100})},{get:(o,k)=>k in o?o[k]:()=>{}});
const canvas=native?native.createCanvas(360,780):{getContext:()=>ctx};canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:780});
const sandbox={console,Math,Set,Map,window:{innerWidth:360,innerHeight:780,devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>native?native.createCanvas(1,1):{getContext:()=>ctx},addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
let code=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8');code=code.replace(/\}\)\(\);\s*$/,`globalThis.g={beginGame,shootPlayer,updatePlasmaGuidance,update,get:()=>({ship,enemies,playerShots,fireCooldown}),setWeapon:n=>weapon=n,dual:()=>dualFighter=true,fire:()=>{keys.add(' ');fireCooldown=0}};})();`);sandbox.entryShots=new Set(); code=code.replace('function enemyFire(enemy) {', 'function enemyFire(enemy) { if(enemy.entry) globalThis.entryShots.add(enemy.id);'); vm.runInNewContext(code,sandbox);const g=sandbox.g;

g.beginGame();g.setWeapon(6);let state=g.get();state.enemies.length=0;
const y=state.ship.y-16;
const target={x:state.ship.x+60,y:y-180,alive:true};
state.enemies.push({x:state.ship.x,y:y+20,alive:true},{x:state.ship.x+150,y:y-80,alive:true},target,{x:state.ship.x,y:y-260,alive:true});
g.shootPlayer();let shot=g.get().playerShots.at(-1);assert.equal(shot.target,target,'nearest eligible forward target');assert.equal(shot.vy,-300);
g.updatePlasmaGuidance(shot,.1);assert(shot.vx>0);assert(Math.atan2(shot.vx,-shot.vy)<=.04500001,'bounded steering');assert(Math.abs(Math.hypot(shot.vx,shot.vy)-300)<1e-8);
target.x=1000;for(let i=0;i<20;i++)g.updatePlasmaGuidance(shot,.1);assert(shot.vy<0);assert(shot.guidanceEnded);assert(Math.abs(Math.atan2(shot.vx,-shot.vy))<=.35000001);assert(Math.abs(target.x-shot.x)>500,'fast lateral target can evade');
g.shootPlayer();shot=g.get().playerShots.at(-1);const original=shot.target;original.alive=false;g.updatePlasmaGuidance(shot,.01);assert(shot.guidanceEnded);assert.equal(shot.target,null);original.alive=true;g.updatePlasmaGuidance(shot,.1);assert.equal(shot.target,null,'never reacquire or retarget');
target.x=state.ship.x+20;g.shootPlayer();shot=g.get().playerShots.at(-1);shot.y=shot.target.y-1;g.updatePlasmaGuidance(shot,.01);assert(shot.guidanceEnded&&shot.vy<0,'never turn back after passing');
g.setWeapon(5);g.shootPlayer();shot=g.get().playerShots.at(-1);assert(!shot.guided&&shot.target===null);g.updatePlasmaGuidance(shot,.2);assert.equal(shot.vx,0);
g.setWeapon(6);g.dual();const count=g.get().playerShots.length;g.shootPlayer();assert.equal(g.get().playerShots.length-count,2,'dual fighter launches two plasma shots');
for(const level of [5,6]){g.beginGame();g.setWeapon(level);g.get().ship.invulnerable=999;g.fire();g.update(.001);assert.equal(g.get().fireCooldown,.45);let n=g.get().playerShots.length;g.update(.44);assert.equal(g.get().playerShots.length,n);g.update(.011);assert.equal(g.get().playerShots.length,n+1,'0.45 second cadence');}
console.log('PASS: forward-only single target, limited steering/time, evasive enemies, no retarget/U-turn, straight level5, 300 speed, dual plasma and .45 cadence');
