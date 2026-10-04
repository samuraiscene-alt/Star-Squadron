const fs=require('fs'),vm=require('vm'),assert=require('assert'),{createCanvas}=require('@napi-rs/canvas');
const canvas=createCanvas(360,780);canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:780});
const sandbox={Math,Set,Map,window:{devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>createCanvas(1,1),addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
let source=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.g={beginGame,update,render,captureFighter,damageEnemy,pauseGame,resumeGame,get:()=>({ship,enemies,items,lives,dualFighter,respawnDelay})};})();`);
vm.runInNewContext(source,sandbox);const g=sandbox.g;
for(const [startX,startY] of [[20,100],[340,100],[180,880]]){
 g.beginGame();let s=g.get();let captor=s.enemies.find(e=>e.role==='captor');s.ship.invulnerable=0;g.captureFighter(captor);assert.equal(g.get().lives,2);g.damageEnemy(captor,999);let returning=g.get().items.find(i=>i.type==='rescue');assert(returning);returning.x=startX;returning.y=startY;
 for(let frame=0;frame<360&&!g.get().dualFighter;frame++){s=g.get();s.ship.invulnerable=999;s.ship.x=frame<80?340:frame<160?20:180;g.update(1/60);assert(Number.isFinite(returning.x)&&Number.isFinite(returning.y));}
 assert(g.get().dualFighter,'moving player receives auto-return');assert.equal(g.get().lives,2,'no life gained on docking');assert(!g.get().items.some(i=>i.type==='rescue'));
}
g.beginGame();let c=g.get().enemies.find(e=>e.role==='captor');g.captureFighter(c);g.damageEnemy(c,999);let r=g.get().items.find(i=>i.type==='rescue');const pos=[r.x,r.y];g.pauseGame();g.update(1);assert.deepEqual([r.x,r.y],pos);g.resumeGame();g.get().ship.invulnerable=999;g.update(.4);g.render(0);fs.writeFileSync('/tmp/v25-rescue-return.png',canvas.toBuffer('image/png'));
console.log('PASS: spinning return follows moving player from both edges and below screen, docking waits for respawn, no bonus life, pause freezes return');
