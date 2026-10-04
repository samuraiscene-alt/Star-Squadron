const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:0})},{get:(o,k)=>k in o?o[k]:()=>{}});
const canvas={getContext:()=>ctx,addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:360,height:780})};
const sandbox={Math,Set,Map,window:{devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>canvas,addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
let source=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.g={beginGame,captureFighter,damageEnemy,update,updateCaptor,enemyFire,continueGame,continueSeconds,drawShip,get:()=>({enemies,ship,lives,state,dualFighter,captureAnimation,items,playerShots,enemyShots,respawnDelay}),last:()=>{lives=1;ship.invulnerable=0},quiet:()=>attackCooldown=999};})();`);
let now=100000;sandbox.Date={now:()=>now};vm.runInNewContext(source,sandbox);const g=sandbox.g;

// A new beam must still activate when only one life remains.
g.beginGame();g.last();let state=g.get();const captor=state.enemies.find(e=>e.role==='captor');
for(const e of state.enemies){e.entry=null;e.dive=null;e.beam=null;}captor.beamCooldown=0;
assert(g.updateCaptor(captor,.01));assert.equal(captor.beam.phase,'approach');
captor.x=state.ship.x;captor.y=state.ship.y-180;captor.beam={phase:'active',age:0};
g.updateCaptor(captor,.01);assert.equal(g.get().lives,0);assert.equal(g.get().state,'continue');assert.equal(g.continueSeconds(),9);
assert(g.get().captureAnimation&&captor.carrying);g.captureFighter(captor);assert.equal(g.get().lives,0,'deduct only once');
const positions=g.get().enemies.map(e=>[e.x,e.y]);g.update(2);assert.equal(g.get().state,'continue');assert.equal(g.get().lives,0);assert.deepEqual(g.get().enemies.map(e=>[e.x,e.y]),positions,'no combat or automatic respawn');
now+=10000;g.update(.01);assert.equal(g.get().state,'gameover');assert.equal(g.get().lives,0);
g.beginGame();g.last();g.captureFighter(g.get().enemies.find(e=>e.role==='captor'));g.continueGame();assert.equal(g.get().state,'playing');assert.equal(g.get().lives,3,'only explicit continue grants new lives');
// Follow an actual bottom exit, top re-entry, and formation docking.
g.beginGame();g.quiet();state=g.get();state.ship.invulnerable=999;const e=state.enemies.find(e=>e.role!=='captor');state.enemies.splice(0,state.enemies.length,e);e.entry=null;
const line=(a,b)=>[a,a,b,b];e.dive={age:0,duration:4,route:[line([70,100],[70,850]),line([70,-70],[70,100])],offsetX:0,offsetY:0,wrapReturn:true,fireTimes:[],nextShot:0};
e.y=state.ship.y-50;g.enemyFire(e);assert(g.get().enemyShots.length>0,'may fire before passing');g.get().enemyShots.length=0;
let passed=false,reentered=false;
for(let i=0;i<240;i++){g.update(1/60);if(e.dive?.passedPlayer)passed=true;if(passed&&e.y<100)reentered=true;const count=g.get().enemyShots.length;if(e.dive&&passed){g.enemyFire(e);assert.equal(g.get().enemyShots.length,count,'no fire below player or on top re-entry');}}
assert(passed&&reentered);g.update(.02);assert.equal(e.dive,null);const count=g.get().enemyShots.length;g.enemyFire(e);assert(g.get().enemyShots.length>count,'fire allowed after completed return');
e.dive={wrapReturn:false,rearAttack:true};e.y=state.ship.y+40;g.enemyFire(e);assert(g.get().enemyShots.length>count+1,'rear attacking leader preserved');
console.log('PASS: last-life beam activation, 1→0 capture, no automatic respawn, countdown/timeout/explicit continue; no shots after passing through top return, docking reset and rear attack preserved');
