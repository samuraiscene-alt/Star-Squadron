const fs=require('fs'),vm=require('vm'),assert=require('assert'),{createCanvas}=require('@napi-rs/canvas');
const canvas=createCanvas(360,780);canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:780});
const sandbox={Math,Set,Map,window:{devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>createCanvas(1,1),addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};

let source=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.g={shieldClosed,damageEnemy,beginGame,startStage,launchGroupAttack,update,craftImage,drawCraft,render,get:()=>({enemies,ship,playerShots}),setStage:s=>{stage=s;startStage()},laser:()=>{weapon=4;keys.add(' ');fireCooldown=0},setTime:n=>elapsed=n};})();`);
vm.runInNewContext(source,sandbox);const g=sandbox.g;
const first={armored:6,interceptor:11,shield:16,heavy:21};
for(const [kind,stage] of Object.entries(first)){
 g.beginGame();g.setStage(stage-1);assert(!g.get().enemies.some(e=>e.kind===kind),'absent before '+kind);
 g.setStage(stage);assert(g.get().enemies.some(e=>e.kind===kind),'introduced '+kind);
}
g.setStage(6);let e=g.get().enemies.find(e=>e.kind==='armored');assert.equal(e.hp,2);g.damageEnemy(e);assert(e.alive&&e.hp===1);g.damageEnemy(e);assert(!e.alive);
g.setStage(16);e=g.get().enemies.find(e=>e.kind==='shield');e.phase=0;g.setTime(.1);assert(g.shieldClosed(e));g.damageEnemy(e,1,e.x,e.y+10);assert.equal(e.hp,e.maxHp,'front shield blocks');g.damageEnemy(e,1,e.x,e.y-10);assert.equal(e.hp,e.maxHp-1,'rear hit works');g.setTime(2);assert(!g.shieldClosed(e));g.damageEnemy(e,1,e.x,e.y+10);assert.equal(e.hp,e.maxHp-2,'open shield takes damage');
g.setStage(21);e=g.get().enemies.find(e=>e.kind==='heavy');assert.equal(e.hp,4);for(let i=0;i<3;i++)g.damageEnemy(e);assert(e.alive&&e.hp===1);g.damageEnemy(e);assert(!e.alive);g.setStage(81);assert(g.get().enemies.find(e=>e.kind==='heavy').hp>4);
g.setStage(11);g.get().ship.invulnerable=999;for(let i=0;i<180;i++)g.update(1/60);for(const e of g.get().enemies){e.dive=null;e.beam=null;}let fast;for(let i=0;i<10&&!fast;i++){for(const e of g.get().enemies){e.dive=null;e.beam=null;}g.launchGroupAttack();fast=g.get().enemies.find(e=>e.kind==='interceptor'&&e.dive);}assert(fast,'fast wing joins attack cycle');assert(fast.dive.duration<7.5);
g.beginGame();g.get().ship.invulnerable=999;g.laser();g.update(.001);assert.equal(g.get().playerShots.filter(s=>s.type==='laser').length,1);g.update(.29);assert.equal(g.get().playerShots.filter(s=>s.type==='laser').length,0);g.update(.011);assert.equal(g.get().playerShots.filter(s=>s.type==='laser').length,1,'laser fires at .30 seconds');
const c=canvas.getContext('2d');c.fillStyle='#07101a';c.fillRect(0,0,360,780);['assault','armored','interceptor','shield','heavy','elite'].forEach((kind,i)=>{g.drawCraft(kind,180,90+i*115);c.fillStyle='#e4f5ff';c.font='16px sans-serif';c.fillText(kind,25,95+i*115);});fs.writeFileSync('/tmp/v22-enemy-lineup.png',canvas.toBuffer('image/png'));
console.log('PASS: staged enemy introductions, armor and heavy durability, timed frontal shield/rear vulnerability, faster interceptor flights, exact .30 laser cadence and enemy artwork');
