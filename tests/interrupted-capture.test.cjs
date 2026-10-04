const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:0})},{get:(o,k)=>k in o?o[k]:()=>{}});
const canvas={getContext:()=>ctx,addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:360,height:780})};
const sandbox={Math,Set,Map,window:{devicePixelRatio:1,addEventListener(){},setTimeout(){}},document:{getElementById:()=>canvas,createElement:()=>canvas,addEventListener(){}},navigator:{},location:{protocol:'file:'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
let source=fs.readFileSync(require('path').join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.g={beginGame,captureFighter,damageEnemy,update,get:()=>({enemies,ship,lives,dualFighter,captureAnimation,items,playerShots,respawnDelay})};})();`);
vm.runInNewContext(source,sandbox);const g=sandbox.g;
for(const age of [0,.3,1.08,1.2]){
 g.beginGame();let e=g.get().enemies.find(e=>e.role==='captor');e.entry=null;e.x=80;e.y=400;e.hp=1;e.beam={phase:'lifting',age:0};g.get().ship.x=80;g.captureFighter(e);assert.equal(g.get().lives,2);
 if(age)g.update(age);assert.equal(!!g.get().captureAnimation,age<1.1);
 g.get().playerShots.push({x:e.x,y:e.y+.3,vy:-300,type:'bullet'});g.update(.001);assert(!e.alive,'pre-fired missile kills captor');
 if(age<1.1){assert.equal(g.get().lives,3);assert.equal(g.get().ship.x,80);assert.equal(g.get().respawnDelay,0);assert(!g.get().items.some(i=>i.type==='rescue'));assert(!g.get().captureAnimation);g.damageEnemy(e,999);assert.equal(g.get().lives,3,'refund exactly once');}
 else{assert.equal(g.get().lives,2);assert(g.get().items.some(i=>i.type==='rescue'));}
 for(let i=0;i<240;i++){g.get().ship.invulnerable=999;g.update(1/60);}
 assert.equal(g.get().dualFighter,age>=1.1,'dual craft only after completed capture');
}
console.log('PASS: actual pre-fired bullet interrupts capture at three phases, restores single craft and life exactly once; completed capture still returns as dual');
