import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {boardTransition,displayLetters,automaticView,wheelValues} from '../presentation.js';
const source=JSON.parse(await readFile(new URL('../assets/presentation/presentation.json',import.meta.url)));
const timing=source.timing;
const state={round:1,phase:'action',used:[],bonusChoices:[],puzzle:{id:1,rows:['              ','   HELLO      ','    WORLD     ','              ']}};
test('opening follows retail column-then-row order and 50ms spacing',()=>{
  const sequence=boardTransition(null,state,'round',timing);
  assert.deepEqual(sequence.tiles.slice(0,4).map(t=>[t.r,t.c]),[[1,3],[1,4],[2,4],[1,5]]);
  assert.equal(sequence.tiles[1].at-sequence.tiles[0].at,50);
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
