const fs=require('fs'),vm=require('vm'),assert=require('assert'),{createCanvas}=require('@napi-rs/canvas');
const canvas=createCanvas(360,780);canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:780});
const math=Object.create(Math);
const sandbox={Math:math,Set,Map,window:{devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>createCanvas(1,1),addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
let source=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.g={beginGame,startStage,update,render,spawnEscorts,bossFire,damageEnemy,damageBoss,fireSpecial,specialBurst,updateSpecials,drawCraft,pointerDown,pauseGame,resumeGame,get:()=>({boss,enemies,enemyShots,items,specialAmmo,specialShots,specialFields,specialButtons,joy,fireButton,ship,state}),stage:n=>{stage=n;startStage()},ammo:a=>specialAmmo=a};})();`);
vm.runInNewContext(source,sandbox);const g=sandbox.g;
g.beginGame();g.stage(10);g.spawnEscorts();assert.equal(g.get().enemies.length,0);
for(const n of [20,40,50,80,100]){
 g.beginGame();g.stage(n);g.get().ship.invulnerable=999;g.spawnEscorts();g.spawnEscorts();assert.equal(g.get().enemies.filter(e=>e.alive).length,2);
 const e=g.get().enemies[0];g.damageEnemy(e,999);g.spawnEscorts();assert.equal(g.get().enemies.filter(e=>e.alive).length,2);
 for(let i=0;i<300;i++){g.update(.02);assert(g.get().enemies.filter(e=>e.alive).length<=2);}
 assert(g.get().enemyShots.length>0);g.damageBoss(999);assert(!g.get().enemies.some(e=>e.alive));
}
g.beginGame();g.stage(10);let early=g.get().boss;g.bossFire();assert.equal(early.pending[0].count,1);g.stage(70);g.bossFire();assert(g.get().boss.pending[0].count>1);assert(g.get().boss.maxHp>early.maxHp);
g.beginGame();g.get().ship.invulnerable=999;for(let i=0;i<180;i++)g.update(1/60);let e=g.get().enemies[3];e.dive=null;e.entry=null;e.beam=null;e.x=180;e.y=220;
g.specialBurst({x:180,y:220,type:'emp'});g.update(.01);assert(e.stun>1.9);const pos={x:e.x,y:e.y};g.update(.5);assert.equal(e.x,pos.x);assert.equal(e.y,pos.y);g.update(2);assert.equal(e.stun,0);
g.specialBurst({x:60,y:350,type:'flash'});g.updateSpecials(.1);e.x=60;e.y=350;g.updateSpecials(.1);assert.equal(e.blind,2,'later entry into flash cloud');
g.stage(20);g.specialBurst({x:g.get().boss.x,y:g.get().boss.y,type:'flash'});g.update(.01);assert.equal(g.get().boss.blind,.5);g.update(.6);assert.equal(g.get().boss.blind,0,'boss flash effect not continually renewed');
g.specialBurst({x:g.get().boss.x,y:g.get().boss.y,type:'emp'});g.update(.01);const bx=g.get().boss.x;g.update(.2);assert.equal(g.get().boss.x,bx);g.update(.4);assert.notEqual(g.get().boss.x,bx);
g.beginGame();g.ammo(['emp','flash']);let s=g.get();assert(s.specialButtons.every(b=>b.y>s.joy.y&&b.y>s.fireButton.y&&b.y+23<780));const emp=s.specialButtons.find(b=>b.type==='emp');
g.pointerDown({clientX:emp.x,clientY:emp.y,pointerId:5,preventDefault(){}});assert.equal(g.get().specialAmmo.length,1);assert.equal(g.get().specialShots[0].type,'emp');g.fireSpecial();assert.equal(g.get().specialAmmo.length,1,'no repeated double spending');g.update(.6);g.fireSpecial();assert.equal(g.get().specialAmmo.length,0);g.update(1.5);assert(g.get().specialFields.length>0,'projectile explodes');
g.ammo(['emp']);g.pauseGame();g.fireSpecial();assert.equal(g.get().specialAmmo.length,1);g.beginGame();assert.equal(g.get().specialAmmo.length,0);
math.random=()=>0;g.beginGame();e=g.get().enemies.find(e=>e.hp===1);g.damageEnemy(e,1);assert(g.get().items.some(i=>i.type==='emp'));for(const i of g.get().items){i.y=g.get().ship.y;i.x=g.get().ship.x;}g.update(.001);assert.equal(g.get().specialAmmo.length,1);g.ammo(['emp','flash']);g.get().items.push({x:g.get().ship.x,y:g.get().ship.y,vy:0,type:'emp'});g.update(.001);assert.equal(g.get().specialAmmo.length,2);g.stage(20);g.spawnEscorts();g.damageEnemy(g.get().enemies[0],100);assert(!g.get().items.some(i=>i.type==='emp'||i.type==='flash'),'escort drops excluded');
math.random=Math.random;g.beginGame();g.stage(50);g.get().ship.invulnerable=999;g.spawnEscorts();g.ammo(['emp','flash']);g.render(0);fs.writeFileSync('/tmp/v23-boss-battle.png',canvas.toBuffer('image/png'));
const c=canvas.getContext('2d');c.fillStyle='#07101a';c.fillRect(0,0,360,780);for(let tier=1;tier<=4;tier++){g.drawCraft('boss',180,tier*150,Math.PI,tier);c.fillStyle='#e0f7ff';c.font='14px sans-serif';c.fillText(['','Battalion','Regiment','Division','Final'][tier],12,tier*150);}fs.writeFileSync('/tmp/v23-boss-lineup.png',canvas.toBuffer('image/png'));
console.log('PASS: escort cap/replacements/cleanup, same-rank boss growth, EMP freeze/recovery, flash late entry and boss cap, special touch/cooldown/pause/reset, drop/pickup/cap and no escort drops, native artwork');
