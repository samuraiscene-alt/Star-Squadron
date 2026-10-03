const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const events={},nodes={};
 for(const id of ['cinema','cinema-poster','cinema-video','start-button','skip-button','home-button','cinema-title']) nodes[id]={hidden:false,dataset:{},attrs:{},handlers:{},addEventListener(n,f){this.handlers[n]=f},focus(){},removeAttribute(n){delete this.attrs[n];if(n==='src')this.src=''},getAttribute(n){return n==='src'?this.src:this.attrs[n]}};
 const v=nodes['cinema-video'];Object.assign(v,{pause(){this.paused=true},load(){},play(){this.paused=false;return this.fail?Promise.reject(Error('blocked')):Promise.resolve()}});
 const window={addEventListener(n,f){events[n]=f}},document={hidden:false,getElementById:id=>nodes[id],addEventListener(n,f){events[n]=f}};
 vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../cinema.js'),'utf8'),{window,document});
 let count={start:0,ended:0,home:0,opening:0};const cinema=window.SquadronCinema;
 cinema.init({start(){count.start++},ended(){count.ended++},home(){count.home++;cinema.showHome()},opening(){count.opening++;cinema.playOpening()},soundEnabled:()=>true});
 return {cinema,count,nodes,v,document,events};
}
test('home starts opening; ended or skip starts game exactly once',()=>{
 for(const action of ['skip','ended']){let {cinema,count,nodes,v}=setup();assert.equal(cinema.getMode(),'home');assert(!nodes['start-button'].hidden);nodes['start-button'].handlers.click();assert.equal(cinema.getMode(),'intro');assert(v.src.includes('launch'));assert(!nodes['skip-button'].hidden);if(action==='skip')cinema.skip();else v.handlers.ended();assert.equal(count.start,1);assert(nodes.cinema.hidden);cinema.skip();v.handlers.ended();assert.equal(count.start,1);}
});
test('ending skip and natural finish both show no craft and home button',()=>{
 for(const action of ['skip','ended']){let {cinema,count,nodes,v}=setup();cinema.playEnding();assert.equal(cinema.getMode(),'ending');if(action==='skip')cinema.skip();else v.handlers.ended();assert.equal(count.ended,1);assert(nodes['cinema-poster'].hidden);assert(nodes['cinema-video'].hidden);assert.equal(nodes['cinema-title'].textContent,'GAME OVER');assert(!nodes['home-button'].hidden);assert(nodes['start-button'].hidden);nodes['home-button'].handlers.click();assert.equal(count.home,1);assert.equal(cinema.getMode(),'home');assert(!nodes['cinema-poster'].hidden);}
});
test('failed audio autoplay falls back to muted; total failure finishes; background pauses',async()=>{
 let s=setup();s.v.fail=true;s.cinema.playEnding();await new Promise(resolve=>setImmediate(resolve));assert(s.v.muted);assert.equal(s.count.ended,1);
 s=setup();s.cinema.playOpening();s.document.hidden=true;s.events.visibilitychange();assert(s.v.paused);s.document.hidden=false;s.events.visibilitychange();assert(!s.v.paused);s.cinema.skip();await Promise.resolve();assert.equal(s.count.start,1);
});
