const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8').replace(/\}\)\(\);\s*$/, `globalThis.g={resize,pointerPosition,pointerDown,beginGame,pauseGame,resumeGame,toggleSound,render,initAudio,get:()=>({H,scale,ship,joy,fireButton,audioContext,soundEnabled,state})};})();`);
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
vm.runInNewContext(code,sandbox); const g=sandbox.g;
(async()=>{
 assert.equal(canvas.width,786);assert.equal(canvas.height,1518);assert.equal(g.get().H,759/(393/360));
 let pos=g.pointerPosition({clientX:65*(393/360),clientY:59+g.get().joy.y*(393/360)});assert(Math.abs(pos.x-65)<.001);assert(Math.abs(pos.y-g.get().joy.y)<.001);
 g.beginGame();await Promise.resolve();assert.equal(contexts.length,1);assert.equal(contexts[0].state,'running');assert.equal(sandbox.navigator.audioSession.type,'playback');assert(media.plays>0);
 g.pointerDown({clientX:65*(393/360),clientY:59+g.get().joy.y*(393/360),pointerId:1,preventDefault(){}});assert.equal(g.get().joy.pointer,1);
 g.pauseGame();assert(media.paused);text.length=0;g.render(0);assert(text.includes('PAUSED'));assert(!text.some(t=>/게임이|안내창|계속/.test(t)));
 g.resumeGame();await Promise.resolve();assert.equal(contexts.length,2);assert.equal(contexts[0].state,'closed');assert.equal(contexts[1].state,'running');assert(!media.paused);
 g.toggleSound();assert(!g.get().soundEnabled);assert(media.paused);g.toggleSound();await Promise.resolve();assert(g.get().soundEnabled);assert.equal(contexts.length,3);
 sandbox.document.hidden=true;events.visibilitychange();assert.equal(g.get().state,'paused');assert(media.paused);sandbox.document.hidden=false;g.resumeGame();assert.equal(contexts.length,4);
 contexts.at(-1).state='interrupted';g.initAudio();assert.equal(contexts.length,5);assert.equal(contexts.at(-2).state,'closed');
 rect={left:0,top:0,width:360,height:780};g.resize();assert.equal(g.get().H,780);assert.equal(canvas.height,1560);
 console.log('PASS: safe-area canvas dimensions, offset touch controls, minimal pause text, gesture audio unlock, fresh audio after pause/background/interruption, mute');
})().catch(e=>{console.error(e);process.exitCode=1});
