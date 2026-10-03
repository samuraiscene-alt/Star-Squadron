const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8').replace(/\}\)\(\);\s*$/, `globalThis.g={startOpening,finishEnding,returnHome,update,loseLife,resize,pointerPosition,pointerDown,beginGame,pauseGame,resumeGame,toggleSound,render,initAudio,get:()=>({H,scale,ship,joy,fireButton,audioContext,soundEnabled,state,lives,stage,weapon,enemies,enemyShots,items,bursts,dualFighter,captivePending,captureAnimation}),expire:()=>{lives=1;ship.invulnerable=0;loseLife();continueDeadline=Date.now()-1;update(.016)}};})();`);
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
const nodes={};
for(const id of ['cinema','cinema-poster','cinema-video','start-button','skip-button','home-button','cinema-title'])nodes[id]={hidden:false,dataset:{},handlers:{},addEventListener(n,f){this.handlers[n]=f},pause(){},play(){return Promise.resolve()},load(){},removeAttribute(n){if(n==='src')this.src=''},getAttribute(n){return this[n]},focus(){}};
sandbox.document.getElementById=id=>id==='game'?canvas:nodes[id];
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cinema.js'),'utf8'),sandbox);
vm.runInNewContext(code,sandbox); const g=sandbox.g;


const cinema=sandbox.window.SquadronCinema;
assert.equal(g.get().state,'title');assert.equal(cinema.getMode(),'home');nodes['start-button'].handlers.click();assert.equal(g.get().state,'intro');g.update(1);assert.equal(g.get().state,'intro');nodes['cinema-video'].handlers.ended();assert.equal(g.get().state,'playing');assert.equal(g.get().stage,1);assert.equal(g.get().lives,3);
for(const action of ['skip','ended']){
 g.expire();assert.equal(g.get().state,'ending');assert.equal(cinema.getMode(),'ending');const count=g.get().enemies.length;g.update(2);assert.equal(g.get().enemies.length,count);
 if(action==='skip')nodes['skip-button'].handlers.click();else nodes['cinema-video'].handlers.ended();
 let s=g.get();assert.equal(s.state,'gameover');assert.equal(s.lives,0);assert.equal(s.enemies.length,0);assert.equal(s.enemyShots.length,0);assert.equal(s.items.length,0);assert.equal(s.bursts.length,0);assert(!s.dualFighter&&!s.captivePending&&!s.captureAnimation);assert(!nodes['home-button'].hidden);assert(nodes['cinema-poster'].hidden);
 g.pointerDown({clientX:100,clientY:400,pointerId:3,preventDefault(){}});assert.equal(g.get().state,'gameover');
 nodes['home-button'].handlers.click();assert.equal(g.get().state,'title');assert(!nodes['cinema-poster'].hidden);nodes['start-button'].handlers.click();nodes['skip-button'].handlers.click();assert.equal(g.get().state,'playing');assert.equal(g.get().stage,1);assert.equal(g.get().lives,3);
}
console.log('PASS: integrated home/intro/playing/countdown/ending/gameover transitions; skip and natural end; removed craft and enemies; no tap-through restart; home then fresh launch');
