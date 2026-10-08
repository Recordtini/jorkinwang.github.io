import test from 'node:test';
import assert from 'node:assert/strict';
import {WheelGame,LETTERS} from '../game.js';
import {boardTransition,tileRevealed,automaticView} from '../presentation.js';
import fs from 'node:fs';

const puzzles=[
  {id:1,bonus:false,category:'PHRASE',answer:'HELLO WORLD',rows:[' HELLO WORLD  ']},
  {id:2,bonus:false,category:'THING',answer:'GOLD RING',rows:['  GOLD RING   ']},
  {id:3,bonus:true,category:'THING',answer:'RAIN BARREL',rows:[' RAIN BARREL  ']},
  {id:4,bonus:true,category:'THING',answer:'COFFEE CUP',rows:['  COFFEE CUP  ']},
];
const players=[{name:'Alex',slot:0,ai:false},{name:'Sam',slot:1,ai:false},{name:'Kelly',slot:2,ai:true}];
const create=()=>new WheelGame(puzzles,{random:()=>0});

test('quick play keeps custom local/CPU setup and difficulty but skips the show',()=>{
  const g=create();g.startQuick(players,{rounds:4,tossups:true,bonus:true,collectibles:true,difficulty:'hard'});
  assert.deepEqual(g.state.players.map(({name,slot,ai})=>({name,slot,ai})),players);
  assert.equal(g.state.rules.difficulty,'hard');assert.ok(g.state.players[2].cpu);
  assert.equal(g.state.rules.rounds,1);assert.equal(g.state.rules.tossups,false);
  assert.equal(g.state.rules.bonus,false);assert.equal(g.state.rules.collectibles,false);
  assert.equal(g.state.stageType,'regular');assert.equal(g.state.phase,'action');
  g.solve(g.state.puzzle.answer);g.nextRound();
  assert.equal(g.state.phase,'finished');assert.equal(g.state.round,1);
});
test('random puzzle avoids the previous puzzle, resets scores, and preserves podium gaps',()=>{
  const g=create();g.startQuick([players[0],players[2]]);
  const id=g.state.puzzle.id;g.player.cash=5000;g.player.bank=7000;
  g.startQuick(g.state.players);
  assert.notEqual(g.state.puzzle.id,id);assert.deepEqual(g.state.players.map(p=>p.slot),[0,2]);
  assert.ok(g.state.players.every(p=>p.cash===0&&p.bank===0));
});
test('reveal ends regular rounds without a win, payout, or future spin completion',()=>{
  const g=create();g.startQuick(players);g.player.cash=600;g.player.bank=2000;
  const index=g.beginSpin();assert.equal(g.revealPuzzle(),true);g.finishSpin(index);
  assert.equal(g.state.phase,'round-over');assert.equal(g.player.cash,600);assert.equal(g.player.bank,2000);
  assert.deepEqual(g.state.used,[...LETTERS]);assert.equal(g.solve(g.state.puzzle.answer),false);
  assert.equal(g.revealPuzzle(),false);assert.equal(g.state.jackpotEligible,false);
});
test('reveal ends toss-ups without inventing a winner or bank',()=>{
  const g=create();g.start(players,'custom',{tossups:true});g.buzz(1);g.revealPuzzle();
  assert.equal(g.state.phase,'tossup-over');assert.equal(g.state.tossupWinner,null);
  assert.ok(g.state.players.every(p=>p.bank===0));
  assert.ok(g.state.puzzle.rows.flatMap((r,row)=>[...r].map((l,c)=>tileRevealed(g.state,row*14+c,l)||l===' ')).every(Boolean));
});
test('quick bonus starts at the small wheel with a local contestant and standard letter rules',()=>{
  const g=create();g.startQuickBonus(players,{bonusSlot:1});
  assert.equal(g.state.round,5);assert.equal(g.player.name,'Sam');assert.equal(g.state.phase,'bonus-spin');
  assert.equal(g.state.puzzle.bonus,true);assert.deepEqual(g.state.used,['R','S','T','L','N','E']);
  assert.equal(automaticView(g.state),'bonus');assert.ok(g.beginPower());assert.ok(g.beginBonusSpin(55));
  g.finishBonusSpin();for(const l of ['B','C','D','A'])assert.ok(g.guess(l));
  assert.equal(g.state.phase,'bonus-solve');assert.match(g.state.message,/30 seconds/);
  g.solve(g.state.puzzle.answer);assert.equal(g.state.phase,'finished');assert.equal(g.player.bank,g.state.bonusPrize);
});
test('quick bonus falls back from a CPU slot and reveal never awards its secret prize',()=>{
  const g=create();g.startQuickBonus(players,{bonusSlot:2});assert.equal(g.player.name,'Alex');
  const id=g.state.puzzle.id;g.revealPuzzle();assert.equal(g.state.phase,'finished');assert.equal(g.player.bank,0);
  g.startQuickBonus(g.state.players);assert.notEqual(g.state.puzzle.id,id);
});
test('quick modes and custom lineup survive save/resume',()=>{
  for(const bonus of [false,true]){
    const g=create();if(bonus)g.startQuickBonus(players);else g.startQuick(players);
    const resumed=create();assert.ok(resumed.restore(g.save()));
    assert.equal(resumed.state.rules.quickPlay,true);assert.equal(resumed.state.rules.quickBonus,bonus);
    assert.deepEqual(resumed.state.players,g.state.players);assert.equal(resumed.state.phase,g.state.phase);
  }
});
test('reveal renders all letters immediately even after a canceled opening sequence',()=>{
  const g=create();g.startQuick(players);g.revealPuzzle();
  const transition=boardTransition(null,g.state,'reveal',{mTimeAfterBlue:200,mTimeBetweenLetters:100});
  assert.equal(transition.opening,false);assert.equal(transition.duration,300);
  assert.ok(transition.tiles.every(t=>t.at===0&&t.kind==='letter'));assert.equal(automaticView(g.state,'reveal'),'board');
});
test('bonus clock packages all three retail podium textures and Cosmos font',()=>{
  for(const color of ['red','yellow','blue']){
    const png=fs.readFileSync(new URL('../assets/presentation/bonus-clock/'+color+'.png',import.meta.url));
    assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),64);
  }
  const font=fs.readFileSync(new URL('../assets/presentation/bonus-clock/cosmos.woff',import.meta.url));
  assert.equal(font.toString('ascii',0,4),'wOFF');
});
