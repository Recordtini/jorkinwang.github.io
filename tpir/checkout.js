// Check Out on the original screen 031 art; rules from tpir::checkout (Rust/WASM). EVIDENCE: the game's own text (see engine/src/checkout.rs).
import { kit } from './kit.js?v=3';
const K = await kit(31); const { ex, g } = K;
const gro = await (await fetch('grocery/index.json')).json(); const items = [...gro].sort(() => Math.random() - 0.5).slice(0, 4); const imgs = await Promise.all(items.map((p) => K.product('grocery', p)));
const top = await K.img('BoardTop'), bottom = await K.img('BoardBottom'), bag = await K.img('Bag');
ex.tp_co_new(...items.map((p) => Math.round(p.price * 100)));
function frame() {
  requestAnimationFrame(frame); K.pump(ex.tp_co_events); const s = K.f32(ex.tp_co_state, 11); const [done, won, item] = s; const real = s.slice(3, 7), guess = s.slice(7, 11);
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (bottom) g.drawImage(bottom, 0, 300, 800, 300); if (top) g.drawImage(top, 0, 0, 800, 300);
  K.center('Guess all four prices: total within $2 wins the prize', 70, '#fff');
  for (let i = 0; i < 4; i++) { const x = 40 + i * 190; K.contain(imgs[i], x, 100, 170, 170); if (i < item || done) K.text(K.cents(guess[i]), x + 40, 300, '#ffd84a', true); if (done) K.text('real ' + K.cents(real[i]), x + 30, 335, '#fff'); else if (i === item) K.text('<< guess this one', x + 5, 335, '#9fe39f'); }
  if (done) { const tg = guess.reduce((a, b) => a + b, 0), tr = real.reduce((a, b) => a + b, 0); K.center(`YOUR TOTAL ${K.cents(tg)}   ACTUAL ${K.cents(tr)}   DIFFERENCE ${K.cents(Math.abs(tg - tr))}`, 400, '#fff'); K.center(won ? 'WITHIN $2 — YOU WIN!' : 'OVER $2 — YOU LOSE', 450, won ? '#7f7' : '#f77', true); }
  K.drawCaption(); window.__co = { done: !!done, won, item, real: Array.from(real), idle: K.idle() };
}
requestAnimationFrame(frame); window.__ready = true;
const wait = () => new Promise((r) => { const t = setInterval(() => { if (K.idle()) { clearInterval(t); r(); } }, 200); });
await wait(); for (let i = 0; i < 4; i++) { const v = await K.ask(`Item ${i + 1} price: $`, 0.01); ex.tp_co_enter(Math.round(v * 100)); }
