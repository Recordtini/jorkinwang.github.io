import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {boardTransition,displayLetters,automaticView,cameraAutomation,wheelValues,solveTiles,fillSolution,materialAlpha} from '../presentation.js';
const source=JSON.parse(await readFile(new URL('../assets/presentation/presentation.json',import.meta.url)));
const timing=source.timing;
const state={round:1,phase:'action',used:[],bonusChoices:[],puzzle:{id:1,rows:['              ','   HELLO      ','    WORLD     ','              ']}};
test('opening follows retail column-then-row order and 50ms spacing',()=>{
  const sequence=boardTransition(null,state,'round',timing);
  assert.deepEqual(sequence.tiles.slice(0,4).map(t=>[t.r,t.c]),[[1,3],[1,4],[2,4],[1,5]]);
  assert.equal(sequence.tiles[1].at-sequence.tiles[0].at,50);
});
test('fill-in solving locks revealed letters and preserves punctuation and numbers',()=>{
  const s={...state,used:['L'],puzzle:{rows:['              ',' HELLO WORLD  ',' ROUTE 66!    ','              ']}};
  const tiles=solveTiles(s);assert.ok(tiles.filter(t=>t.text==='L').every(t=>!t.editable));
  assert.equal(fillSolution(s,{}),null);
  const entries=Object.fromEntries(tiles.filter(t=>t.editable).map(t=>[t.index,s.puzzle.rows[t.row][t.column]]));
  assert.equal(fillSolution(s,entries),'HELLO WORLD ROUTE 66!');entries[15]='X';assert.equal(fillSolution(s,entries),'XELLO WORLD ROUTE 66!');
});
test('source flags distinguish opaque wheel steps from transparent blue blades',()=>{
  assert.equal(materialAlpha({alphaFlags:11500,alphaThreshold:0}).blend,false);
  const blue=materialAlpha({alphaFlags:237,alphaThreshold:0});assert.equal(blue.blend,true);assert.equal(blue.src,6);assert.equal(blue.dst,7);
});
test('all 37 original cameras, controller keys, roles and screen movies are packaged',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../assets/presentation/cameras.json',import.meta.url)));
  assert.equal(catalog.cameras.length,37);assert.equal(Object.keys(catalog.roles).length,16);
  assert.equal(catalog.cameras.reduce((total,c)=>total+c.tracks.length,0),30);
  for(const c of catalog.cameras){
    assert.ok([...c.position,...c.forward,...c.up,c.fov,c.aspect].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...c.forward)-1)<1e-5);
    assert.ok(c.fov>0&&c.fov<180);
  }
  for(let slot=0;slot<3;slot++){
    const camera=catalog.cameras.find(c=>c.name===catalog.roles[`spin_player${slot}`][0]);
    assert.ok(camera.position[1]>5);assert.ok(camera.forward[1]<-.98);assert.ok(camera.tracks[0].translation.keys.length>=2);
  }
  assert.equal(catalog.materials.wheel_baseShape.alphaFlags,11500);
  assert.equal(catalog.materials['wheel_bonus_rig/bonus_wheelShape:1'].alphaFlags,null);
  for(const name of ['game_logo','jackpot_intro','mystery_intro','fireworks']){const data=await readFile(new URL(`../assets/presentation/screens/${name}.mp4`,import.meta.url));assert.equal(data.toString('ascii',4,8),'ftyp');}
});
test('matching letters go blue before the source 750ms letter sequence',()=>{
  const next={...state,used:['L']},s=boardTransition({id:1,used:[]},next,'letter',timing);
  assert.equal(s.tiles.length,3);assert.deepEqual(s.tiles.map(t=>t.at),[1750,2500,3250]);
  assert.ok(s.duration>s.tiles.at(-1).at);
});
test('solves reveal remaining letters together, as handlePuzzleSolved does',()=>{
  const s=boardTransition({id:1,used:[]},{...state,phase:'round-over',used:[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']},'win',timing);
  assert.ok(s.tiles.every(t=>t.at===0));assert.equal(s.duration,300);
});
test('bonus letters stay hidden until all four choices are submitted',()=>{
  const s={...state,round:5,phase:'bonus-select',used:[...'RSTLNECD'],bonusChoices:['C','D']};
  assert.deepEqual(displayLetters(s),[...'RSTLNE']);
  assert.deepEqual(displayLetters({...s,phase:'bonus-solve'}),[...'RSTLNECD']);
});
test('automatic cameras follow action, spin, board and bonus states',()=>{
  assert.equal(automaticView(state),'show');assert.equal(automaticView(state,'round'),'board');
  for(const phase of ['spinning','spinning-bonus','consonant','bonus-solve','finished'])assert.equal(automaticView({...state,phase}),phase==='spinning'?'wheel':phase==='spinning-bonus'?'bonus':'board');
});
test('new and resumed games reset automatic cuts; manual overrides survive within a match',()=>{
  assert.equal(cameraAutomation(false,'start'),true);assert.equal(cameraAutomation(false,'restore'),true);
  for(const event of ['spin','land','letter','round','win'])assert.equal(cameraAutomation(false,event),false);
  assert.equal(cameraAutomation(true,'spin'),true);
  const single={...state,players:[{slot:0,ai:false}],turn:0};
  assert.equal(automaticView(single,'start'),'board');assert.equal(automaticView({...single,phase:'spinning'}),'wheel');
  assert.equal(automaticView({...single,phase:'consonant'},'land'),'board');
});
test('native wheel sector values are also the engine payouts',()=>{
  assert.equal(wheelValues()[0],'LOSE A TURN');assert.equal(wheelValues()[1],800);
  assert.equal(wheelValues(1)[4],700);assert.equal(wheelValues(2)[10],'JACKPOT');assert.equal(wheelValues(2)[7],3500);
  assert.equal(wheelValues(3)[7],3500);assert.equal(wheelValues(4)[6],600);
  assert.equal(wheelValues(3)[11],'MYSTERY');assert.equal(wheelValues(3)[23],'MYSTERY');
  assert.equal(wheelValues(4)[7],5000);assert.ok(wheelValues(1).every(v=>v!=='FREE PLAY'));
});
test('original wheel frames, tile atlas, category atlas and embedded fonts exist',async()=>{
  for(const file of [...source.wheels,source.tile.url,source.category.url]){
    const data=await readFile(new URL('../'+file,import.meta.url));assert.equal(data.toString('ascii',1,4),'PNG');
  }
  for(const file of Object.values(source.fonts)){const data=await readFile(new URL('../'+file,import.meta.url));assert.equal(data.toString('ascii',0,4),'wOFF');}
  assert.equal(source.category.frames.length,source.category.text.length);assert.equal(source.provenance.length,3);
});
