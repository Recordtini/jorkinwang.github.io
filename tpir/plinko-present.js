// Screen 048 pricing/widget state. The retail animations are still being traced.
import {unprojectContainer} from './ui-container.js';
export const PLINKO_PHOTOS = ['5d547134','c45d208e','b35a1018','2d3e85bb'];
export const PLINKO_STACK = ['e20b6857','950c58c1','0c05097b','7b0239ed','e566ac4e'];
const WIN = ['064e4a17','9f471bad','e8402b3b','7624be98'];
const WRONG = ['f87b7506','617224bc','1675142a','88118189'];
const COVERS = ['a245067e','4972bd7d','a6b0d643','446ccd3a'];

// PC pickup block 0x5a1ab7..0x5a1c38 permits only the top remaining chip.
export function plinkoStackHit(ui,chips,x,y) {
  const n=ui.all.get(PLINKO_STACK[chips-1]);
  return n && ui.isVisible(n) && ui.contains(n,x,y) ? n : null;
}
// PC 0x403e80 centers the drag widget using integer half-width/height.
export function centerPlinkoChip(point,size) {
  return [Math.trunc(point.x)-Math.trunc(size/2), Math.trunc(point.y)-Math.trunc(size/2)];
}
export function resolvePlinkoScreenDrop(ui,ex,x,y,size) {
  const board=ui.all.get('6224f135');
  const projection=board.inputPath.at(-1).projection;
  // PC 0x5a1ec0 uses 0x65f450's offset/scale for the acceptance test.
  // It uses a separate full inverse transform when initializing physics.
  const scroll=unprojectContainer([0,0],projection);
  const test=[x+scroll[0],y+scroll[1]], kind=ex.tp_pl_drop_region(...test);
  if(kind===0)return null;
  let root=[x,y];
  if(kind===2) {
    const pointer=ex.tp_pl_snap_center(...test);if(!pointer)return null;
    const center=new Int32Array(ex.memory.buffer,pointer,2);
    root=centerPlinkoChip({x:center[0]-scroll[0],y:center[1]-scroll[1]},size);
  }
  return {root_rect:[root[0],root[1],root[0]+size,root[1]+size],local:ui.localPoint(board,...root)};
}
export function configurePlinkoChip(ui,state,dragged=null) {
  const chip=ui.all.get('29080f82');
  ui.vis.set(chip.inst,!!dragged || state[0]===2);
  if(dragged) {
    ui.reparent(chip,ui.all.get('54f13e88'));
    chip.x=dragged.px;chip.y=dragged.py;chip.w=chip.h=dragged.size;
  } else if(state[0]===2) {
    // 0x50ee10 reparents to the board; 0x50ee28 moves it before the glass.
    ui.reparent(chip,ui.all.get('6224f135'));
    ui.moveBefore(chip,ui.all.get('69f29503'));
    chip.x=state[7];chip.y=state[8];chip.w=chip.h=state[12];
  }
}

export function configurePlinko(ui, state, reveal = null, draggedId = null, coverProgress = 1, camera = null, realPrice = null) {
  const node = id => ui.all.get(id);
  const pricing = state[0] === 0, item = Math.min(3,state[1]|0), offset = [0,453,906,1360][item];
  // PC 0x50cac8/0x50de6c select authored views 1..4 for pricing;
  // 0x50e403 resets to view 0 for board entry. No synthetic root scroll.
  ui.setView(camera || ui.S.views[pricing ? item + 1 : 0]);
  ui.vis.set('9efeb6ff',pricing); ui.vis.set('6224f135',!pricing);
  // Retail shows the board winnings label at 0x50e6fb and updates it on landing.
  ui.vis.set('005bc389',!pricing);
  ui.setText('005bc389',`$${Math.round(state[3]).toLocaleString('en-US')}`);
  node('54f13e88').x = 0;
  // These ten active controls move by the next podium's position difference
  // in PC 0x50d55d..0x50d88f. Keep the surrounding four podiums authored.
  const moving = ['30940635','d1a50fdb','b74dabf2','ba2b4dcf','75a3b087',
    '501d37d8','f69a033a','6e1863f8','cdca26a6','764f28bc'];
  ui.plinkoOrigins ||= new Map(moving.map(id=>[id,node(id).x]));
  for (const id of moving) node(id).x = ui.plinkoOrigins.get(id) + offset;
  ['ba2b4dcf','75a3b087'].forEach((id,i) => {
    const n=node(id);
    n.res=3225+(i ? state[5]%10 : Math.floor(state[5]/10));
    // 0x50d4c0 shows these after cover completion; 0x5130b0 hides both
    // before the result animation, so digits must not cover the WIN panel.
    ui.vis.set(id,pricing && reveal===null && coverProgress>=1);
  });
  ui.vis.set('30940635',pricing && reveal===null && coverProgress>=1);
  // 0x50cbb0 binds true-price digits to both result pairs. Correct results
  // show the small pair at 0x5122a9/0x5122be; incorrect results show the
  // large pair at 0x512b05/0x512b1a. 0x50ce8f..0x50cece hides both at entry.
  for (const [id,digit,correct] of [['501d37d8',0,true],['f69a033a',1,true],
      ['6e1863f8',0,false],['cdca26a6',1,false]]) {
    if(realPrice!==null) node(id).res=3144+(digit ? Math.round(realPrice)%10 : Math.floor(Math.round(realPrice)/10));
    ui.vis.set(id,pricing && realPrice!==null && reveal===correct);
  }
  for(let i=0;i<4;i++) {
    // 0x50cee9..0x50d3a0 moves the active podium cover upward by the
    // height of screen-048 rect 477c5947 (220), over 1500 ms.
    node(COVERS[i]).y = i < item ? -220 : i === item ? Math.trunc(-220*Math.max(0,Math.min(1,coverProgress))) : 0;
    // 0x50bb00 loads all four authored-visible photo widgets. Their covers
    // conceal the unrevealed products; changing the active item does not
    // clear the products from podiums whose covers have already risen.
    ui.vis.set(PLINKO_PHOTOS[i],pricing);
    ui.vis.set(WIN[i],pricing && reveal === true && i===item);
    ui.vis.set(WRONG[i],pricing && reveal === false && i===item);
  }
  for(let i=0;i<PLINKO_STACK.length;i++)
    ui.vis.set(PLINKO_STACK[i],!pricing && i < state[2] && PLINKO_STACK[i] !== draggedId);
}
