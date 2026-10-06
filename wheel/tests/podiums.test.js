import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {podiumScore,podiumDigits,digitFrame,podiumEffect,PodiumDisplay} from '../podiums.js';
import {WheelGame} from '../game.js';
const data=JSON.parse(await readFile(new URL('../assets/presentation/podiums/podiums.json',import.meta.url)));
const context=new Proxy({},{get:()=>()=>{}});
const display=()=>new PodiumDisplay(context,data,{});
const state=(turn=0,cash=0)=>({players:[{slot:0,cash},{slot:2,cash:800}],turn,phase:'action'});

test('retail formatting leaves zero blank and uses native comma insertion',()=>{
  assert.equal(podiumScore(0),'');assert.equal(podiumScore(-1),'');
  assert.equal(podiumScore(800),'$800');assert.equal(podiumScore(1250),'$1,250');
  assert.equal(podiumScore(1000000),'$1000,000');
});
test('retail glyph widths, 8px tracking and comma -7px shift are retained',()=>{
  const digits=podiumDigits(1250,data.widths);
  assert.equal(digits[0].x,73.5);assert.equal(digits[1].x-digits[0].x,35);
  assert.equal(digits[2].x-digits[1].x,18);assert.equal(digits[3].x-digits[2].x,28);
});
test('score and final animation callbacks follow source frame numbers',()=>{
  assert.equal(digitFrame('out',0,0),10);assert.equal(digitFrame('out',1,0),94);
  assert.equal(digitFrame('out',3,1),94);assert.equal(digitFrame('out',19,0),3);
  assert.equal(digitFrame('in',19,0),3);assert.equal(digitFrame('in',20,0),129);
  assert.equal(digitFrame('in',38,0),10);assert.equal(digitFrame('final',7,0),20);
  assert.equal(digitFrame('final',12,1),20);assert.equal(digitFrame('final',32,0),10);
});
test('restore sets scores immediately, changes animate only affected physical slot',()=>{
  const p=display();assert.equal(p.update(state(),'restore',100),0);
  assert.deepEqual(p.scores,[0,0,800]);assert.equal(p.active,0);
  assert.equal(p.update(state(0,1600),'letter',200),49/30*1000);
  assert.equal(p.transitions[0].old,0);assert.equal(p.transitions[0].value,1600);
  assert.equal(p.transitions[2],null);
  p.update(state(0,1600),'spin',300);assert.equal(p.transitions[0].start,200);
  p.draw(2000);assert.equal(p.transitions[0],null);
});
test('Bankrupt belongs to outgoing podium; handoff waits for original effect completion',()=>{
  const p=display();p.update(state(0,1600),'restore',100);
  assert.equal(p.update(state(1,0),'bankrupt',200),140/30*1000);
  assert.equal(p.effect.slot,0);assert.equal(p.active,null);
  p.draw(4867);assert.equal(p.effect,null);assert.equal(p.active,2);
  assert.equal(p.scores[0],0);assert.equal(p.scores[2],800);
});
test('Lose a Turn is distinct from a missed guess and does not remove cash',()=>{
  assert.equal(podiumEffect('miss'),null);assert.equal(podiumEffect('lose-turn'),'lose');
  const p=display();p.update(state(0,1600),'restore',100);
  assert.equal(p.update(state(1,1600),'lose-turn',200),37*1000/30);
  assert.equal(p.transitions[0],null);assert.equal(p.scores[0],1600);
  const events=[],g=new WheelGame([{id:1,bonus:false,answer:'HELLO',rows:['HELLO']}],{random:()=>0,onChange:(_,e)=>events.push(e)});
  g.start(['A','B'],'local');g.player.cash=1200;g.beginSpin();g.finishSpin(0);
  assert.equal(events.at(-1),'lose-turn');assert.equal(g.state.players[0].cash,1200);assert.equal(g.state.turn,1);
});
test('final-score effect hides turn arrows and reset cancels all native timelines',()=>{
  const p=display();p.update(state(0,1600),'restore',0);
  assert.equal(p.update({...state(0,1600),phase:'round-over'},'win',100),61/30*1000);
  assert.equal(p.active,null);assert.equal(p.transitions[0].mode,'final');
  p.reset();p.draw(5000);assert.equal(p.effect,null);assert.equal(p.active,null);
  assert.deepEqual(p.transitions,[null,null,null]);
});
test('native artwork, source glyphs, Univers font and exact stage coordinates are packaged',async()=>{
  assert.deepEqual(data.slots,[0,362,724]);assert.equal(data.width,1024);assert.equal(data.height,512);
  assert.equal(data.font,'Univers ExtraBlack');assert.equal(data.digitKeys.length,157);
  assert.equal(data.turn.frames.length,22);assert.equal(data.lose.frames.length,37);assert.equal(data.bankrupt.frames.length,140);
  assert.deepEqual(data.backgrounds.frames,[4,12,24]);assert.equal(data.digitKeys[9].visible,true);
  for(const url of [data.body,...['backgrounds','turn','lose','bankrupt','glyphs'].map(n=>data[n].url)]){
    const png=await readFile(new URL('../'+url,import.meta.url));assert.equal(png.toString('ascii',1,4),'PNG');
  }
  const font=await readFile(new URL('../'+data.fontUrl,import.meta.url));assert.equal(font.toString('ascii',0,4),'wOFF');
});
