const fs=require('fs'),vm=require('vm'),assert=require('assert');
const native=process.argv.includes('--render')?require('@napi-rs/canvas'):null;
const grad={addColorStop(){}};
const ctx=new Proxy({createRadialGradient:()=>grad,createLinearGradient:()=>grad,measureText:()=>({width:100})},{get:(o,k)=>k in o?o[k]:()=>{}});
const canvas=native?native.createCanvas(360,780):{getContext:()=>ctx};canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:780});
const sandbox={console,Math,Set,Map,window:{innerWidth:360,innerHeight:780,devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>native?native.createCanvas(1,1):{getContext:()=>ctx},addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
let code=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8');code=code.replace(/\}\)\(\);\s*$/,`globalThis.g={capturedFighterPosition,captureFighter,updateCaptor,shootPlayer,fighterCenters,playerDistance,beginGame,startStage,bossRank,flightModes,update,render,damageEnemy,damageBoss,loseLife,pauseGame,resumeGame,launchGroupAttack,cinematicExplosion,updateEffects,get:()=>({stage,state,weapon,lives,enemies,boss,items,bursts,ship,enemyShots,playerShots,dualFighter,captivePending,captureAnimation}),setStage:n=>{stage=n;startStage()},setLives:n=>lives=n};})();`);sandbox.entryShots=new Set(); code=code.replace('function enemyFire(enemy) {', 'function enemyFire(enemy) { if(enemy.entry) globalThis.entryShots.add(enemy.id);'); vm.runInNewContext(code,sandbox);const g=sandbox.g;
const bossMap={10:'battalion',20:'regiment',30:'battalion',40:'regiment',50:'division',60:'regiment',70:'battalion',80:'regiment',90:'battalion',100:'minister'};
g.beginGame();
for(let n=1;n<=100;n++){
 let s=g.get();assert.equal(s.stage,n);assert.equal(s.boss?.kind,bossMap[n]);s.ship.invulnerable=999;
 for(let i=0;i<180;i++)g.update(1/60);
 for(const e of s.enemies)g.damageEnemy(e,999);
 if(s.boss){g.damageBoss(999);assert(g.get().bursts.some(b=>b.kind===bossMap[n]));}
 s=g.get();const weaponItem=s.items.find(x=>x.type==='weapon');assert.equal(weaponItem?.level,({10:2,20:3,30:4,40:5})[n]);
 g.update(.01);assert.equal(g.get().stage,n,'must wait on pickup/explosion');
 for(const item of [...g.get().items]){let current=g.get();current.ship.x=item.x;item.y=current.ship.y;g.update(.001);}
 assert.equal(g.get().weapon,n<10?1:n<20?2:n<30?3:n<40?4:5);
 if(native){g.render(0);canvas.toBuffer('image/png');}
 for(let i=0;i<300&&g.get().stage===n&&g.get().state==='playing';i++)g.update(1/60);
 if(n===100){assert.equal(g.get().state,'victory');assert.equal(g.get().stage,100);}else assert.equal(g.get().stage,n+1);
}
assert(g.get().lives>3);g.beginGame();let s=g.get();s.ship.x=75;s.ship.invulnerable=0;g.loseLife();assert.equal(g.get().bursts[0].x,75);assert.equal(g.get().lives,2);g.pauseGame();let age=g.get().bursts[0].age;g.update(.5);assert.equal(g.get().bursts[0].age,age);g.resumeGame();g.update(.5);assert(g.get().bursts[0].age>age);g.get().ship.invulnerable=0;g.setLives(1);g.loseLife();assert.equal(g.get().state,'continue');g.update(1);assert.equal(g.get().bursts.length,0);
for(const n of [1,21,41,61,81,99]){g.beginGame();g.setStage(n);g.get().ship.invulnerable=999;for(let i=0;i<1200;i++)g.update(1/60);for(const e of g.get().enemies)assert(Number.isFinite(e.x)&&Number.isFinite(e.y));for(const b of g.get().enemyShots)assert(Number.isFinite(b.x)&&Number.isFinite(b.y));}

// An off-center fighter must rise in the beam; the captor returns only after docking.
for (const beamX of [80, 280]) {
 g.beginGame();g.get().ship.invulnerable=999;for(let i=0;i<180;i++)g.update(1/60);
 const e=g.get().enemies.find(e=>e.role==='captor');e.x=beamX;e.y=440;e.beam={phase:'active',age:0};
 g.get().ship.x=beamX-20;g.get().ship.invulnerable=0;g.updateCaptor(e,.001);
 assert.equal(e.beam.phase,'lifting');let previousY=g.get().ship.y;
 for(let i=0;i<60;i++) {
  g.update(1/60);assert.equal(e.x,beamX,'captor must not leave during pull');assert.equal(e.y,440);
  const a=g.get().captureAnimation;assert(a);const pos=g.capturedFighterPosition(a);
  assert(pos.x>=beamX-20&&pos.x<=beamX);assert(pos.y<=previousY&&pos.y>=472);previousY=pos.y;
  if(i===32&&native){g.render(0);fs.writeFileSync('/tmp/squadron-pull-'+beamX+'.png',canvas.toBuffer('image/png'));}
 }
 assert(Math.abs(g.capturedFighterPosition(g.get().captureAnimation).x-beamX)<.001);
 for(let i=0;i<8;i++)g.update(1/60);assert.equal(g.get().captureAnimation,null);assert.equal(e.beam.phase,'return');
 g.update(.2);assert(e.x!==beamX,'captor may return after docking');
 if(native){g.render(0);fs.writeFileSync('/tmp/squadron-docked-'+beamX+'.png',canvas.toBuffer('image/png'));}
}
console.log('PASS: off-center beam pull on both sides, stationary captor during lift, continuous docking before return');
// Every entrant fires during the entry, and several special types appear early.
g.beginGame();g.get().ship.invulnerable=999;sandbox.entryShots.clear();for(let i=0;i<180;i++)g.update(1/60);
assert.equal(sandbox.entryShots.size,1,'one selected entry shooter in stage one');assert(!g.get().enemies.some(e=>e.kind==='interceptor'));
// Actual beam phases: warning can be dodged; active beam captures a vulnerable single fighter.
let captor=g.get().enemies.find(e=>e.role==='captor');captor.beam={phase:'warning',age:0,x:180,y:440};captor.x=180;captor.y=440;g.get().ship.x=180;g.get().ship.invulnerable=0;
g.updateCaptor(captor,.4);assert.equal(g.get().lives,3);g.pauseGame();let beamAge=captor.beam.age;g.update(.5);assert.equal(captor.beam.age,beamAge);g.resumeGame();g.updateCaptor(captor,.41);assert.equal(captor.beam.phase,'active');
g.get().ship.x=280;g.updateCaptor(captor,.1);assert.equal(g.get().lives,3,'dodged beam');g.get().ship.x=180;g.updateCaptor(captor,.1);assert.equal(g.get().lives,2);assert(g.get().captivePending&&captor.carrying);assert(g.get().captureAnimation);
// Killing the carrier releases a fighter; catching it enables two firing centers.
g.damageEnemy(captor,999);let rescue=g.get().items.find(i=>i.type==='rescue');assert(rescue);g.get().ship.invulnerable=999;for(let i=0;i<90;i++)g.update(1/60);rescue.y=g.get().ship.y;g.get().ship.x=rescue.x;g.update(.001);assert(g.get().dualFighter);assert.equal(g.get().lives,2,'rescue does not restore or grant a life');assert.equal(g.get().captivePending,false);assert.equal(g.fighterCenters().length,2);
let count=g.get().playerShots.length;g.shootPlayer();assert.equal(g.get().playerShots.length-count,2);let life=g.get().lives;g.get().ship.invulnerable=0;let left=g.get().ship.x-16;g.loseLife(left);assert.equal(g.get().lives,life);assert(!g.get().dualFighter);assert.equal(g.get().bursts.at(-1).x,left);g.loseLife();assert.equal(g.get().lives,life,'immediate second hit ignored');g.get().ship.invulnerable=0;g.loseLife();assert.equal(g.get().lives,life-1);
// Remaining carrier escapes; normal stages retain the captive, boss stages defer it.
g.beginGame();g.setStage(9);captor=g.get().enemies.find(e=>e.role==='captor');g.get().ship.invulnerable=0;g.captureFighter(captor);for(const e of [...g.get().enemies])if(e!==captor)g.damageEnemy(e,999);for(let i=0;i<180&&g.get().stage===9;i++){g.get().ship.invulnerable=999;g.update(1/60);}assert.equal(g.get().stage,10);assert(g.get().captivePending);assert.equal(g.get().boss.kind,'battalion');g.setStage(11);captor=g.get().enemies.find(e=>e.role==='captor');assert(captor.carrying);
// Missing the rescued fighter keeps a second chance for the following normal stage.
g.damageEnemy(captor,999);rescue=g.get().items.find(i=>i.type==='rescue');rescue.y=900;g.update(.01);assert(!g.get().captivePending);g.setStage(12);assert(!g.get().enemies.find(e=>e.role==='captor').carrying);
g.beginGame();assert(!g.get().dualFighter&&!g.get().captivePending);captor=g.get().enemies.find(e=>e.role==='captor');g.setLives(1);g.captureFighter(captor);assert.equal(g.get().lives,1);assert(!captor.carrying);
if(native){
 g.beginGame();for(let i=0;i<180;i++){g.get().ship.invulnerable=999;g.update(1/60);}captor=g.get().enemies.find(e=>e.role==='captor');captor.x=180;captor.y=440;captor.beam={phase:'active',age:.4};g.render(0);fs.writeFileSync('/tmp/squadron-beam-v12.png',canvas.toBuffer('image/png'));
 g.get().ship.invulnerable=0;g.captureFighter(captor);g.damageEnemy(captor,999);for(let i=0;i<80;i++)g.update(1/60);rescue=g.get().items.find(i=>i.type==='rescue');rescue.y=g.get().ship.y;g.get().ship.x=rescue.x;g.update(.001);g.get().ship.invulnerable=0;g.render(0);fs.writeFileSync('/tmp/squadron-dual-v12.png',canvas.toBuffer('image/png'));
}
console.log('PASS: entry fire from one selected craft; warning/dodge/capture/rescue; dual fire and two hits; pause; escape across boss stage; missed rescue recovery; last-life protection/restart');
if(native){g.beginGame();g.setStage(100);g.render(0);fs.writeFileSync('/tmp/squadron-boss-v11.png',canvas.toBuffer('image/png'));g.damageBoss(999);g.update(.3);g.render(0);fs.writeFileSync('/tmp/squadron-explosion-v11.png',canvas.toBuffer('image/png'));}
console.log('PASS: 100-stage progression, boss priority, four weapon pickups, bonus lives, victory, explosions, pause/gameover, advanced flight/missiles'+(native?', native Canvas renders':''));
