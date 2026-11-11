// Screen 048 pricing/widget state. The retail animations are still being traced.
export const PLINKO_PHOTOS = ['5d547134','c45d208e','b35a1018','2d3e85bb'];
export const PLINKO_STACK = ['e20b6857','950c58c1','0c05097b','7b0239ed','e566ac4e'];
const WIN = ['064e4a17','9f471bad','e8402b3b','7624be98'];
const WRONG = ['f87b7506','617224bc','1675142a','88118189'];
const COVERS = ['a245067e','4972bd7d','a6b0d643','446ccd3a'];

export function configurePlinko(ui, state, reveal = null, draggedId = null, coverProgress = 1) {
  const node = id => ui.all.get(id);
  const pricing = state[0] === 0, item = Math.min(3,state[1]|0), offset = [0,453,906,1360][item];
  ui.vis.set('9efeb6ff',pricing); ui.vis.set('6224f135',!pricing);
  node('54f13e88').x = pricing ? -offset : 0;
  ['ba2b4dcf','75a3b087'].forEach((id,i) => {
    const n=node(id); n.x=(i?158:75)+offset;
    n.res=3225+(i ? state[5]%10 : Math.floor(state[5]/10));
  });
  for(let i=0;i<4;i++) {
    // 0x50cee9..0x50d3a0 moves the active podium cover upward by the
    // height of screen-048 rect 477c5947 (220), over 1500 ms.
    node(COVERS[i]).y = i < item ? -220 : i === item ? Math.trunc(-220*Math.max(0,Math.min(1,coverProgress))) : 0;
    ui.vis.set(PLINKO_PHOTOS[i],pricing && i===item);
    ui.vis.set(WIN[i],pricing && reveal === true && i===item);
    ui.vis.set(WRONG[i],pricing && reveal === false && i===item);
  }
  for(let i=0;i<PLINKO_STACK.length;i++)
    ui.vis.set(PLINKO_STACK[i],!pricing && i < state[2] && PLINKO_STACK[i] !== draggedId);
}
