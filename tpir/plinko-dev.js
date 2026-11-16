// Development preview. Screen-048 assets and widget coordinates; not yet a
// retail presentation or part of the show selector. See docs/PLINKO.md.
import { kit } from './kit.js';
import { UI } from './ui.js';
import { retail } from './retail.js';
import { configurePlinko, configurePlinkoChip, plinkoStackHit, centerPlinkoChip, resolvePlinkoScreenDrop, PLINKO_PHOTOS as photos, PLINKO_STACK as stack } from './plinko-present.js';
import { cameraPose } from './ui-camera.js';

const K = await kit(48), { ex, cv, g, reg, au } = K;
const ui = await new UI(reg,48).preload();
const items = (await retail()).take('Plinko',1);
const images = await Promise.all(items.map(p => K.product('products',p)));
const codes = items.map(p => {
  const price = Math.round(p.price), tens = Math.floor(price / 10), ones = price % 10;
  if (Math.random() < .5) { let d; do d = Math.floor(Math.random()*10); while (d === ones); return d; }
  // The native generator uses a normal draw centered on the correct tens digit.
  let d; do { const u = 1-Math.random(), v = Math.random(); d = Math.trunc(tens+Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)); }
  while (d < 1 || d > 9 || d === tens);
  return 10+d;
});
if (!ex.tp_pl_new(...items.map(p => Math.round(p.price)),...codes)) throw new Error('Invalid Plinko pricing data');
const state = () => K.f32(ex.tp_pl_state,13);
const N = id => ui.all.get(id);
const digits = [N('ba2b4dcf'),N('75a3b087')];
for (let i=0;i<4;i++) { const id=900000+i; reg.imgs.set(id,images[i]); N(photos[i]).res=id; }
for (let d=0;d<10;d++) for (const s of reg.style(3225+d) || []) if (s.img) reg.imgs.set(s.img,await reg.img(s.img));
ui.hide('ad37ace8','1ccdd6e2','29080f82',...stack);
for (const id of ['627b909a','63bf44c8','9efeb6ff','6224f135']) ui.show(id);
let started=false, active=false, awaitingIntro=false, dragged=null, reveal=null, coverStart=Infinity, accumulator=0, last=performance.now();
let camera = ui.S.views[0], cameraMove=null, pendingItem=null;
const currentCamera=now=>cameraMove ? cameraPose({...cameraMove,elapsed:Math.trunc(now-cameraMove.began)}) : camera;
const point=e=>{const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height};};
function itemCue(i) {
  const now=performance.now(); coverStart=Infinity; pendingItem=i;
  cameraMove={start:currentCamera(now),target:ui.S.views[i+1],duration:i===0?1500:1000,mode:1,began:now};
}
au.onSpeechStart = name => { if(name.startsWith('Product_')) coverStart=performance.now(); };
au.onIdle = () => { if(awaitingIntro) { awaitingIntro=false; itemCue(0); } };
function begin() { if(started)return; started=true; awaitingIntro=true; au.say('Speech_Plinko_Game-Intro_A'); au.say('Speech_Plinko_Pricing-Rules_A'); active=true; }
function configure(s) { const now=performance.now(); configurePlinko(ui,s,reveal?.correct ?? null,dragged?.id ?? null,(now-coverStart)/1500,currentCamera(now),items[Math.min(3,s[1])].price); configurePlinkoChip(ui,s,dragged); }
function moveDragged(p) {
  if(!dragged)return;
  // PC mouse-move body 0x5a1e89 resizes from the previous widget rectangle
  // before centering at the new pointer position.
  dragged.size=ex.tp_pl_drag_size();
  [dragged.px,dragged.py]=centerPlinkoChip(p,dragged.size);
  ex.tp_pl_drag_rect(dragged.px,dragged.py,dragged.size);
}
cv.onpointerdown=e=>{
  au.unlock(); if(!started){begin();return;} const p=point(e),s=state();
  if(s[0]===0 && active && !reveal && performance.now()-coverStart>=1500 && K.idle()) {
    configure(s); ui.draw(g,p.x,p.y); const choice=digits.findIndex(n=>ui.contains(n,p.x,p.y));
    if(choice>=0) { const ok=ex.tp_pl_choose(choice); reveal={state:s,correct:ok===1,until:performance.now()+700};
      au.say(ok?'Speech_Plinko_Pricing-Correct_A':'Speech_Plinko_Pricing-Incorrect_A'); }
  } else if(s[0]===1 && !reveal && K.idle() && reg.imgs.get(3186)) {
    configure(s); ui.draw(g,p.x,p.y); const n=plinkoStackHit(ui,s[2],p.x,p.y);
    if(n) {
      const size=ex.tp_pl_drag_size(); if(size<=0)return;
      dragged={id:n.inst,size,px:0,py:0};moveDragged(p);cv.setPointerCapture(e.pointerId);
    }
  }
};
cv.onpointermove=e=>moveDragged(point(e));
cv.onpointerup=e=>{
  if(!dragged)return;
  const drop=resolvePlinkoScreenDrop(ui,ex,dragged.px,dragged.py,dragged.size);
  if(drop)ex.tp_pl_release_at(...drop.local,dragged.size);dragged=null;
};
cv.onpointercancel=()=>{dragged=null;};
function frame(now) {
  requestAnimationFrame(frame); const dt=Math.min(100,now-last); last=now;
  let s=state();
  if(reveal && now>=reveal.until && K.idle()) { reveal=null; if(s[0]===0) itemCue(s[1]); else { camera=ui.S.views[0]; cameraMove=null; au.say('Speech_Plinko_Pricing-Summary_A'); au.say('Speech_Plinko_Board-Rules_A'); } }
  if(cameraMove && now-cameraMove.began>=cameraMove.duration) {
    camera=cameraMove.target; cameraMove=null;
    if(pendingItem!==null) { const i=pendingItem; pendingItem=null; au.say(au.addProduct(items[i])); au.say('Speech_Plinko_Pricing-ItemIntro_A'); }
  }
  if(s[0]===2) { accumulator+=dt; while(accumulator>=20) { const status=ex.tp_pl_step(Math.floor(Math.random()*101),Math.random()<.5?0:1); accumulator-=20;
      if(status===1) au.sfx('Sfx_Plinko_ChipCollision_01'); }
    const status=ex.tp_pl_present(); s=state();
    if(status===5) au.say(`Speech_Plinko_Board-Chip${s[11]}_A`);
  }
  else accumulator=0;
  configure(reveal?.state ?? s); g.clearRect(0,0,800,600); ui.draw(g);
  K.drawCaption(); window.__plinko={phase:s[0],item:s[1],chips:s[2],cash:s[3],smallPrizes:s[4],shown:s[5],dragging:!!dragged,idle:K.idle() && !reveal && !cameraMove && pendingItem===null};
}
requestAnimationFrame(frame); window.__ready=true;
