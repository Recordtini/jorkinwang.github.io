// Double Prices on the original screen 035 art; rules from tpir::doubleprices (Rust/WASM). EVIDENCE: the game's own text (see engine/src/doubleprices.rs).
import { kit } from './kit.js?v=3';
const K = await kit(35); const { ex, g } = K;
const all = (await (await fetch('products/all.json')).json()).filter((p) => p.price >= 200 && p.price <= 60000); const prod = all[(Math.random() * all.length) | 0];
const pimg = await K.product('products', prod); const main = await K.img('Double_Prices_Main'), glow = await K.img('Card_Glow'), pod = await K.img('DoublePricePodium');
const cards = [await K.img('Double_Prices_Price_Pink'), await K.img('Double_Prices_Price_Blue')];
ex.tp_dp_new((Math.random() * 2 ** 31) | 1, Math.round(prod.price)); const CARD = [{ x: 70, y: 380, w: 300, h: 130 }, { x: 430, y: 380, w: 300, h: 130 }];
function frame() {
  requestAnimationFrame(frame); K.pump(ex.tp_dp_events); const [done, won, l, r, realSide, picked] = K.f32(ex.tp_dp_state, 7); const vals = [l, r];
  for (const c of K.clicks.splice(0)) if (!done) CARD.forEach((b, i) => { if (c.x >= b.x && c.x < b.x + b.w && c.y >= b.y && c.y < b.y + b.h) ex.tp_dp_pick(i); });
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (main) g.drawImage(main, 0, 0, 800, 600);
  K.contain(pimg, 250, 80, 300, 260); K.center('Which value is the real price?', 365, '#fff');
  CARD.forEach((b, i) => { const hov = !done && K.ptr.x >= b.x && K.ptr.x < b.x + b.w && K.ptr.y >= b.y && K.ptr.y < b.y + b.h; if (cards[i]) g.drawImage(cards[i], b.x, b.y, b.w, b.h); else { g.fillStyle = '#e8c'; g.fillRect(b.x, b.y, b.w, b.h); }
    if (hov && glow) { g.save(); g.globalAlpha = 0.6; g.drawImage(glow, b.x - 15, b.y - 15, b.w + 30, b.h + 30); g.restore(); }
    const t = K.money(vals[i]); K.text(t, b.x + (b.w - K.font2.width(t)) / 2, b.y + b.h / 2 + 12, done && i === realSide ? '#1a1' : '#222', true); });
  if (done) K.center(won ? 'THAT MATCHES — YOU WIN!' : "THE PRICES DON'T MATCH — YOU LOSE", 540, won ? '#7f7' : '#f77', true);
  K.drawCaption(); window.__dp = { done: !!done, won, realSide, real: Math.round(prod.price), idle: K.idle() };
}
requestAnimationFrame(frame); window.__ready = true;
