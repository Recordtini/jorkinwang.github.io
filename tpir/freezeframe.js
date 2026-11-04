// Freeze Frame on the original screen 037 art; rules from tpir::freezeframe (Rust/WASM). EVIDENCE: the game's own text (see engine/src/freezeframe.rs). Click anywhere (or Space) to freeze the price.
import { kit } from './kit.js';
const K = await kit(37); const { ex, g } = K;
const all = (await (await fetch('products/all.json')).json()).filter((p) => p.price >= 300 && p.price <= 50000); const prod = all[(Math.random() * all.length) | 0];
const pimg = await K.product('products', prod); const board = await K.img('Board'), frameIm = await K.img('Frame'), panel = await K.img('Panel');
ex.tp_fz_new((Math.random() * 2 ** 31) | 1, Math.round(prod.price)); let last = performance.now(), armed = false;
addEventListener('keydown', (e) => { if (e.code === 'Space') ex.tp_fz_freeze(); });
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(now - last, 100); last = now; if (armed) ex.tp_fz_tick(dt); K.pump(ex.tp_fz_events); const [done, won, cur, real] = K.f32(ex.tp_fz_state, 5);
  if (armed) for (const c of K.clicks.splice(0)) ex.tp_fz_freeze(); else K.clicks.length = 0;
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (board) g.drawImage(board, 0, 0, 800, 600);
  K.contain(pimg, 150, 90, 500, 260); if (panel) g.drawImage(panel, 200, 380, 400, 110); else { g.fillStyle = '#0006'; g.fillRect(200, 380, 400, 110); }
  K.center(K.money(cur), 455, done ? (won ? '#7f7' : '#f77') : '#fff', true); K.center(done ? (won ? 'FROZEN ON THE RIGHT PRICE — YOU WIN!' : `NOT QUITE — THE PRICE IS ${K.money(real)}`) : 'Click (or press Space) when you think the price is right!', 520, done ? (won ? '#7f7' : '#f77') : '#fff');
  K.drawCaption(); window.__fz = { done: !!done, won, cur, real, idle: K.idle() };
}
requestAnimationFrame(frame); window.__ready = true; const t = setInterval(() => { if (K.idle()) { clearInterval(t); armed = true; } }, 200);
