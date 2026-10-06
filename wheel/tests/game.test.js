import test from 'node:test';
import assert from 'node:assert/strict';
import {WheelGame, normalizeAnswer} from '../game.js';
const puzzles = [
  {id: 0, category: 'PHRASE', bonus: false, answer: 'HELLO WORLD', rows: ['              ', ' HELLO WORLD  ', '              ', '              ']},
  {id: 1, category: 'THING', bonus: true, answer: 'RAIN BARREL', rows: ['              ', '    RAIN      ', '   BARREL     ', '              ']},
];
function game(random = () => 1/24) { const g = new WheelGame(puzzles, {random}); g.start(['A','B','C'],'local'); return g; }
test('spin awards per occurrence and rejects duplicate letters', () => {
  const g = game(); const index = g.beginSpin(); assert.equal(index,1);
  g.finishSpin(index); assert.equal(g.state.phase,'consonant');
  assert.equal(g.guess('L'),true); assert.equal(g.player.cash,2400);
  assert.equal(g.guess('L'),false); assert.equal(g.player.cash,2400);
});
test('bankruptcy only clears current round winnings', () => {
  const g = game(); g.player.cash=2000; g.player.bank=3000;
  g.beginSpin(); g.finishSpin(20);
  assert.equal(g.state.turn,1); assert.equal(g.state.players[0].cash,0); assert.equal(g.state.players[0].bank,3000);
});
test('vowels cost $250 even when absent and cannot be consonant guesses', () => {
  const g = game(); g.player.cash=1000; assert.equal(g.buyVowel(),true);
  assert.equal(g.guess('L'),false); assert.equal(g.guess('A'),true);
  assert.equal(g.state.players[0].cash,750); assert.equal(g.state.turn,1);
});
test('incorrect solve passes the turn, correct solve banks winnings', () => {
  const g = game(); assert.equal(g.solve('wrong'),false); assert.equal(g.state.turn,1);
  g.player.cash=1800; assert.equal(g.solve('hello, world!'),true);
  assert.equal(g.player.bank,1800); assert.equal(g.state.phase,'round-over');
  g.nextRound(); assert.equal(g.state.round,2); assert.equal(g.player.cash,0);
});
test('four rounds lead to bonus with RSTLNE, 3 consonants and 1 vowel', () => {
  const g=game(); for(let i=0;i<4;i++){g.solve('HELLO WORLD');g.nextRound();}
  assert.equal(g.state.round,5);assert.equal(g.state.phase,'bonus-spin');g.beginBonusSpin();g.finishBonusSpin();
  assert.equal(g.guess('R'),false); ['C','D','M','A'].forEach(l=>assert.equal(g.guess(l),true));
  assert.equal(g.state.phase,'bonus-solve'); const bank=g.player.bank;
  assert.equal(g.solve('rain barrel'),true);assert.equal(g.player.bank,bank+25000);
  assert.equal(g.state.phase,'finished');g.finishBonus(true);assert.equal(g.player.bank,bank+25000);
});
test('reload preserves bank and resets interrupted wheel spin', () => {
  const g=game();g.player.bank=7000;g.beginSpin();const saved=g.save();const h=game();
  assert.equal(h.restore(saved),true);assert.equal(h.state.phase,'action');assert.equal(h.player.bank,7000);
  assert.equal(h.restore('{broken'),false);
});
test('the original top Lose A Turn wedge passes without clearing cash',()=>{const g=game();g.player.cash=200;g.beginSpin();g.finishSpin(0);assert.equal(g.state.turn,1);assert.equal(g.state.players[0].cash,200);});
test('mystery risk can lose round cash without losing bank',()=>{const g=game();g.state.round=3;g.state.mysteryWinSector=23;g.player.bank=5000;g.beginSpin();g.finishSpin(11);g.guess('L');assert.equal(g.state.phase,'mystery');g.mystery(true);assert.equal(g.state.turn,1);assert.equal(g.state.players[0].bank,5000);assert.equal(g.state.players[0].cash,0);});
test('solution normalization retains numerals',()=>{assert.equal(normalizeAnswer('Route 66!'),'ROUTE66');assert.notEqual(normalizeAnswer('Route 66'),normalizeAnswer('Route'));});
test('single player survives misses, all rounds, and save restoration',()=>{
  const g=new WheelGame(puzzles,{random:()=>1/24});g.start([{name:'Only Me',slot:1,ai:false}],'single');
  g.solve('wrong');assert.equal(g.state.turn,0);assert.equal(g.player.slot,1);
  for(let round=1;round<=4;round++){assert.equal(g.state.round,round);g.solve('HELLO WORLD');g.nextRound();assert.equal(g.state.turn,0);}
  const restored=new WheelGame(puzzles);assert.equal(restored.restore(g.save()),true);assert.equal(restored.state.players.length,1);
});
test('mixed local and CPU players keep their physical podium slots',()=>{
  const g=new WheelGame(puzzles);g.start([{name:'A',slot:0,ai:false},{name:'B',slot:1,ai:false},{name:'C',slot:2,ai:true}],'custom');
  g.solve('wrong');assert.equal(g.player.ai,false);g.solve('wrong');assert.equal(g.player.ai,true);
  const two=new WheelGame(puzzles);two.start([{name:'A',slot:0,ai:false},{name:'C',slot:2,ai:true}],'custom');
  two.solve('HELLO WORLD');two.nextRound();assert.equal(two.state.turn,1);assert.equal(two.player.slot,2);
  assert.throws(()=>g.start([{name:'CPU',ai:true,slot:0}],'custom'),/local player/);
});
test('version-one three-player saves migrate without losing scores',()=>{
  const g=game(),save=JSON.parse(g.save());save.state.version=1;save.state.players.forEach(p=>delete p.slot);save.state.players[1].bank=1234;
  assert.equal(g.restore(JSON.stringify(save)),true);assert.equal(g.state.players[1].bank,1234);assert.equal(g.state.players[2].slot,2);
});
