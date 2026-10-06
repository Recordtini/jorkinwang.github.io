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
test('mystery risk can lose round cash without losing bank',()=>{const g=game();g.state.round=3;g.player.bank=5000;g.beginSpin();g.finishSpin(11);g.guess('L');assert.equal(g.state.phase,'mystery');g.mystery(true);assert.equal(g.state.turn,1);assert.equal(g.state.players[0].bank,5000);assert.equal(g.state.players[0].cash,0);});
test('solution normalization retains numerals',()=>{assert.equal(normalizeAnswer('Route 66!'),'ROUTE66');assert.notEqual(normalizeAnswer('Route 66'),normalizeAnswer('Route'));});
