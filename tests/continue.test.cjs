const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8').replace(/\}\)\(\);\s*$/, `globalThis.g={update,continueGame,continueSeconds,loseLife,resize,pointerPosition,pointerDown,beginGame,pauseGame,resumeGame,toggleSound,render,initAudio,get:()=>({H,scale,ship,joy,fireButton,audioContext,soundEnabled,state,stage,weapon,score,lives,enemies,enemyShots,playerShots,continueDeadline}),set:()=>{stage=30;weapon=4;score=1234;lives=1;ship.invulnerable=0}};})();`);
const contexts = [], text = [], events = {};
const param = () => ({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
const node = () => ({gain:param(),frequency:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(n){return n},disconnect(){},start(){},stop(){}});
class AudioContext {
 constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination=node();contexts.push(this)}
 resume(){this.state='running';return Promise.resolve()}
 close(){this.state='closed';return Promise.resolve()}
 createGain(){return node()} createDynamicsCompressor(){return node()} createOscillator(){return node()} createBiquadFilter(){return {...node(),Q:param()}} createBufferSource(){return node()}
 createBuffer(ch,length){return {getChannelData:()=>new Float32Array(length)}}
}
const media = {paused:true,plays:0,pauses:0,setAttribute(){},play(){this.paused=false;this.plays++;return Promise.resolve()},pause(){this.paused=true;this.pauses++}};
const grad={addColorStop(){}};
const ctx = new Proxy({createRadialGradient:()=>grad,createLinearGradient:()=>grad,fillText:t=>text.push(t)}, {get:(o,k)=>o[k]||(()=>{})});
let rect={left:0,top:59,width:393,height:759};
const canvas={getContext:()=>ctx,getBoundingClientRect:()=>rect,addEventListener(){}};
const sandbox={Math,Set,Map,Float32Array,window:{innerWidth:393,innerHeight:852,devicePixelRatio:3,AudioContext,addEventListener:(n,fn)=>events[n]=fn,visualViewport:{addEventListener(){}},setTimeout(){}},navigator:{audioSession:{}},document:{hidden:false,getElementById:()=>canvas,createElement:tag=>tag==='audio'?media:{getContext:()=>ctx,width:1,height:1},addEventListener:(n,fn)=>events[n]=fn},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){},location:{protocol:'file:'}};
let now=100000;sandbox.Date={now:()=>now};vm.runInNewContext(code,sandbox); const g=sandbox.g;

const tap=(x,y)=>g.pointerDown({clientX:x*(393/360),clientY:59+y*(393/360),pointerId:7,preventDefault(){}});
g.beginGame();g.set();const initial=g.get();g.loseLife();assert.equal(g.get().state,'continue');assert.equal(g.get().lives,0);assert.equal(g.continueSeconds(),9);
const positions=initial.enemies.map(e=>[e.x,e.y]);g.update(.5);assert.deepEqual(g.get().enemies.map(e=>[e.x,e.y]),positions);
for(let n=9;n>=0;n--){now=100000+(9-n)*1000;assert.equal(g.continueSeconds(),n);g.update(.016);assert.equal(g.get().state,'continue');}
text.length=0;g.render(0);for(const label of ['0','이어서하기','처음부터하기'])assert(text.includes(label));
now=110000;g.update(.016);assert.equal(g.get().state,'gameover');text.length=0;g.render(0);assert(text.includes('GAME OVER'));assert(!text.includes('이어서하기'));
g.beginGame();g.set();g.loseLife();tap(15,15);assert.equal(g.get().state,'continue');tap(180,g.get().H*.36+102);let result=g.get();assert.equal(result.state,'playing');assert.equal(result.stage,30);assert.equal(result.weapon,4);assert.equal(result.score,1234);assert.equal(result.lives,3);assert(result.ship.invulnerable>0);assert.equal(result.enemyShots.length,0);assert.equal(result.joy.pointer,null);assert.equal(result.fireButton.pointer,null);
g.set();g.loseLife();tap(180,g.get().H*.36+162);result=g.get();assert.equal(result.stage,1);assert.equal(result.weapon,1);assert.equal(result.score,0);assert.equal(result.lives,3);
g.set();g.loseLife();now+=10000;tap(180,g.get().H*.36+102);assert.equal(g.get().state,'gameover','expired tap must not continue');
g.beginGame();g.set();g.loseLife();now+=11000;sandbox.document.hidden=true;events.visibilitychange();sandbox.document.hidden=false;g.update(.016);assert.equal(g.get().state,'gameover','background cannot extend countdown');
console.log('PASS: countdown 9 through 0, frozen combat, exact timeout, only choice buttons act, continue preserves stage/weapon/score, fresh 3 lives with invulnerability, restart resets, stale taps and background timeout');
