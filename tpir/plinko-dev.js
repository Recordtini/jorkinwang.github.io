// Development preview. Screen-048 assets and widget coordinates; not yet a
// retail presentation or part of the show selector. See docs/PLINKO.md.
import { kit } from './kit.js';
import { UI } from './ui.js';
import { retail } from './retail.js';
import { configurePlinko, PLINKO_PHOTOS as photos, PLINKO_STACK as stack } from './plinko-present.js';

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
const disc = await K.img('disc');
ui.hide('ad37ace8','1ccdd6e2','29080f82',...stack);
for (const id of ['627b909a','63bf44c8','9efeb6ff','6224f135']) ui.show(id);
let started=false, active=false, awaitingIntro=false, dragged=null, reveal=null, coverStart=Infinity, accumulator=0, last=performance.now();
const hit=(x,y,n)=>x>=n.abs[0]&&x<n.abs[0]+n.w&&y>=n.abs[1]&&y<n.abs[1]+n.h;
const point=e=>{const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height};};
function itemCue(i) { coverStart=Infinity; au.say(au.addProduct(items[i])); au.say('Speech_Plinko_Pricing-ItemIntro_A'); }
au.onSpeechStart = name => { if(name.startsWith('Product_')) coverStart=performance.now(); };
au.onIdle = () => { if(awaitingIntro) { awaitingIntro=false; itemCue(0); } };
function begin() { if(started)return; started=true; awaitingIntro=true; au.say('Speech_Plinko_Game-Intro_A'); au.say('Speech_Plinko_Pricing-Rules_A'); active=true; }
function configure(s) { configurePlinko(ui,s,reveal?.correct ?? null,dragged?.id ?? null,(performance.now()-coverStart)/1500); }
cv.onpointerdown=e=>{
  au.unlock(); if(!started){begin();return;} const p=point(e),s=state();
  if(s[0]===0 && active && !reveal && performance.now()-coverStart>=1500 && K.idle()) {
    configure(s); ui.draw(g,p.x,p.y); const choice=digits.findIndex(n=>hit(p.x,p.y,n));
    if(choice>=0) { const ok=ex.tp_pl_choose(choice); reveal={state:s,correct:ok===1,until:performance.now()+700};
      au.say(ok?'Speech_Plinko_Pricing-Correct_A':'Speech_Plinko_Pricing-Incorrect_A'); }
  } else if(s[0]===1 && !reveal && K.idle() && disc) {
    configure(s); ui.draw(g,p.x,p.y); const n=stack.map(N).find(n=>ui.isVisible(n)&&hit(p.x,p.y,n));
    if(n) { dragged={id:n.inst,x:p.x-n.abs[0],y:p.y-n.abs[1],px:n.abs[0],py:n.abs[1]}; cv.setPointerCapture(e.pointerId); }
  }
};
cv.onpointermove=e=>{if(dragged){const p=point(e);dragged.px=p.x-dragged.x;dragged.py=p.y-dragged.y;}};
cv.onpointerup=()=>{if(!dragged)return; ex.tp_pl_release(Math.round(dragged.px),Math.round(dragged.py)); dragged=null;};
cv.onpointercancel=()=>{dragged=null;};
function frame(now) {
  requestAnimationFrame(frame); const dt=Math.min(100,now-last); last=now;
  let s=state();
  if(reveal && now>=reveal.until && K.idle()) { reveal=null; if(s[0]===0) itemCue(s[1]); else { au.say('Speech_Plinko_Pricing-Summary_A'); au.say('Speech_Plinko_Board-Rules_A'); } }
  if(s[0]===2) { accumulator+=dt; while(accumulator>=20) { const status=ex.tp_pl_step(Math.floor(Math.random()*101),Math.random()<.5?0:1); accumulator-=20;
      if(status===1) au.sfx('Sfx_Plinko_ChipCollision_01'); }
    const status=ex.tp_pl_present(); s=state();
    if(status===5) au.say(`Speech_Plinko_Board-Chip${s[11]}_A`);
  }
  else accumulator=0;
  configure(reveal?.state ?? s); g.clearRect(0,0,800,600); ui.draw(g);
  const drawDisc=(x,y,size)=>{ const m=reg.meta?.get(3154), sx=size/(m?.w||80), sy=size/(m?.h||80);
    g.drawImage(disc,x+(m?.x||0)*sx,y+(m?.y||0)*sy,disc.width*sx,disc.height*sy); };
  if(disc && s[0]===2) drawDisc(s[7],s[8],s[12]);
  if(disc && dragged) drawDisc(dragged.px,dragged.py,80);
  K.drawCaption(); window.__plinko={phase:s[0],item:s[1],chips:s[2],cash:s[3],shown:s[5],dragging:!!dragged};
}
requestAnimationFrame(frame); window.__ready=true;
