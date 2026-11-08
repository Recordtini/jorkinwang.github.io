// Check Game on the original screen 030 art; rules from tpir::checkgame (Rust/WASM). EVIDENCE: the game's own text (see engine/src/checkgame.rs).
import { kit } from './kit.js?v=3';
const K = await kit(30); const { ex, g } = K;
const all = (await (await fetch('products/all.json')).json()).filter((p) => p.price >= 1000 && p.price <= 6500); const prod = all[(Math.random() * all.length) | 0];
const pimg = await K.product('products', prod); const board = await K.img('Check_Game(1220x1200)'), check = await K.img('Check_Game_Check');
ex.tp_cg_new(Math.round(prod.price)); let asked = false, shown = 0;
function frame() {
  requestAnimationFrame(frame); K.pump(ex.tp_cg_events); const [done, won, price, chk, cash] = K.f32(ex.tp_cg_state, 5);
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (board) g.drawImage(board, 0, 0, 800, 600);
  K.contain(pimg, 60, 130, 300, 260);
  K.text('Write a check so that  prize + check  is between $7,000 and $8,000', 60, 110, '#fff');
  if (done) { shown = shown || performance.now(); K.text('PRIZE ' + K.money(price), 400, 200, '#fff', true); K.text('CHECK ' + K.money(chk), 400, 250, '#fff', true); K.text('TOTAL ' + K.money(price + chk), 400, 300, won ? '#7f7' : '#f77', true); K.center(won ? 'YOU WIN THE PRIZE AND THE CHECK!' : 'OUTSIDE THE RANGE — YOU LOSE', 400, won ? '#7f7' : '#f77', true); }
  K.drawCaption(); window.__cg = { done: !!done, won, price, chk, cash, idle: K.idle() };
}
requestAnimationFrame(frame); window.__ready = true;
const wait = () => new Promise((r) => { const t = setInterval(() => { if (K.idle()) { clearInterval(t); r(); } }, 200); });
await wait(); const x = await K.ask('Write the check: $', 1); ex.tp_cg_submit(Math.round(x));
