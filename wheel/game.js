import {wheelValues} from './presentation.js?v=20261006-cuts';
export const VOWELS = 'AEIOU';
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const WEDGES = wheelValues().map(value=>({value}));
export const money = value => '$' + value.toLocaleString('en-US');
export const normalizeAnswer = answer => answer.toUpperCase().replace(/[^A-Z0-9]/g, '');

export class WheelGame {
  constructor(puzzles, {random = Math.random, onChange = () => {}} = {}) {
    this.puzzles = puzzles;
    this.random = random;
    this.onChange = onChange;
    this.usedPuzzles = new Set();
    this.state = null;
  }
  emit(event = 'update') { this.onChange(this.state, event); }
  start(names, mode = 'solo') {
    if (!Array.isArray(names) || names.length < 1 || names.length > 3) throw new Error('Choose one to three players.');
    const players = names.map((entry, i) => typeof entry === 'string'
      ? {name:entry, ai:mode === 'solo' && i > 0, slot:i}
      : {name:String(entry.name || `Player ${i+1}`).trim().slice(0,18), ai:entry.ai === true, slot:entry.slot ?? i});
    if (players.every(p=>p.ai) || players.some(p=>!Number.isInteger(p.slot)||p.slot<0||p.slot>2) || new Set(players.map(p=>p.slot)).size!==players.length) throw new Error('Choose at least one local player and distinct podiums.');
    this.usedPuzzles.clear();
    this.state = {version: 2, mode, players: players.map(p=>({...p, bank:0, cash:0})),
      round: 1, turn: 0, used: [], phase: 'action', lastWedge: null, jackpot: 5000,
      bonusChoices: [], bonusPrize: 0, message: 'Spin the wheel, buy a vowel, or solve the puzzle.'};
    this.selectPuzzle(false);
    this.emit('start');
  }
  selectPuzzle(bonus) {
    let pool = this.puzzles.filter(p => p.bonus === bonus && !this.usedPuzzles.has(p.id));
    if (!pool.length) pool = this.puzzles.filter(p => p.bonus === bonus);
    if (!pool.length) throw new Error('No puzzles available for this round');
    const puzzle = pool[Math.floor(this.random() * pool.length)];
    this.usedPuzzles.add(puzzle.id);
    this.state.puzzle = puzzle;
    this.state.used = bonus ? ['R', 'S', 'T', 'L', 'N', 'E'] : [];
  }
  get player() { return this.state.players[this.state.turn]; }
  get isBonus() { return this.state.round === 5; }
  wedges() {
    return wheelValues(Math.min(4,this.state?.round??1)).map(value=>({value}));
  }
  beginSpin() {
    if (this.state.phase !== 'action') return null;
    const index = Math.floor(this.random() * WEDGES.length);
    this.state.phase = 'spinning';
    this.state.message = 'Round and round it goes...';
    this.emit('spin');
    return index;
  }
  finishSpin(index) {
    if (this.state.phase !== 'spinning' || !Number.isInteger(index) || index < 0 || index >= WEDGES.length) return;
    const wedge = this.wedges()[index].value;
    this.state.lastWedge = wedge;
    if (wedge === 'BANKRUPT') {
      this.player.cash = 0;
      this.passTurn('Bankrupt! Your round money is gone.', 'bankrupt');
    } else if (wedge === 'LOSE A TURN') {
      this.passTurn('Lose a turn. The wheel passes to the next player.', 'miss');
    } else {
      this.state.phase = 'consonant';
      this.state.message = typeof wedge === 'number' ? `${money(wedge)} per letter. Choose a consonant.` : `${wedge}! Choose a consonant.`;
      this.emit('land');
    }
  }
  buyVowel() {
    if (this.state.phase !== 'action' || this.player.cash < 250 || [...VOWELS].every(l => this.state.used.includes(l))) return false;
    this.player.cash -= 250;
    this.state.phase = 'vowel';
    this.state.message = 'Vowel purchased. Choose A, E, I, O, or U.';
    this.emit();
    return true;
  }
  canGuess(letter) {
    if (!LETTERS.includes(letter) || letter.length !== 1 || this.state.used.includes(letter)) return false;
    if (this.state.phase === 'bonus-select') {
      const choices = this.state.bonusChoices;
      return VOWELS.includes(letter) ? !choices.some(l => VOWELS.includes(l)) : choices.filter(l => !VOWELS.includes(l)).length < 3;
    }
    return this.state.phase === 'vowel' ? VOWELS.includes(letter) : this.state.phase === 'consonant' && !VOWELS.includes(letter);
  }
  guess(letter) {
    letter = letter.toUpperCase();
    if (!this.canGuess(letter)) return false;
    if (this.state.phase === 'bonus-select') {
      this.state.bonusChoices.push(letter);
      this.state.used.push(letter);
      if (this.state.bonusChoices.length === 4) {
        this.state.phase = 'bonus-solve';
        this.state.message = 'You have 30 seconds. Solve the bonus puzzle!';
        this.emit('bonus-ready');
      } else {
        this.state.message = `Bonus letters: ${this.state.bonusChoices.join(' ')}. Pick ${3 - this.state.bonusChoices.filter(l => !VOWELS.includes(l)).length} more consonants${this.state.bonusChoices.some(l => VOWELS.includes(l)) ? '' : ' and a vowel'}.`;
        this.emit('letter');
      }
      return true;
    }
    this.state.used.push(letter);
    const count = [...this.state.puzzle.answer.toUpperCase()].filter(l => l === letter).length;
    if (!count) {
      if (this.state.lastWedge === 'FREE PLAY' && this.state.phase === 'consonant') {
        this.state.phase = 'action';
        this.state.message = `No ${letter}. Free Play keeps your turn.`;
        this.emit('miss');
      } else this.passTurn(`No ${letter} in the puzzle. Next player.`, 'miss');
      return true;
    }
    if (this.state.phase === 'consonant') {
      const wedge = this.state.lastWedge;
      const value = typeof wedge === 'number' ? wedge : wedge === 'MYSTERY' ? 1000 : 500;
      this.player.cash += value * count;
      if (this.state.round === 2) this.state.jackpot += value * count;
      if (wedge === 'MYSTERY') {
        this.state.phase = 'mystery';
        this.state.message = `${count} ${letter}${count > 1 ? 's' : ''}! Keep the cash or risk it for $10,000?`;
        this.emit('mystery');
        return true;
      }
    }
    this.state.phase = 'action';
    this.state.message = `${count} ${letter}${count > 1 ? 's' : ''}! Spin again, buy a vowel, or solve.`;
    if (this.complete()) this.winRound(); else this.emit('letter');
    return true;
  }
  mystery(risk) {
    if (this.state.phase !== 'mystery') return;
    if (risk && this.random() < .5) { this.player.cash = 0; this.passTurn('Mystery Bankrupt! The next player is up.', 'bankrupt'); return; }
    if (risk) this.player.cash += 10000;
    this.state.phase = 'action';
    this.state.message = risk ? '$10,000! Keep going.' : 'You kept your money. Spin again or solve.';
    if (this.complete()) this.winRound(); else this.emit(risk ? 'win' : 'letter');
  }
  complete() { return [...this.state.puzzle.answer.toUpperCase()].every(l => !LETTERS.includes(l) || this.state.used.includes(l)); }
  passTurn(message, event) {
    this.state.turn = (this.state.turn + 1) % this.state.players.length;
    this.state.phase = 'action'; this.state.lastWedge = null;
    this.state.message = message; this.emit(event);
  }
  solve(answer) {
    if (!['action', 'consonant', 'vowel', 'bonus-solve'].includes(this.state.phase)) return false;
    if (!normalizeAnswer(answer)) return false;
    const correct = normalizeAnswer(answer) === normalizeAnswer(this.state.puzzle.answer);
    if (this.isBonus) {
      if (correct) this.finishBonus(true);
      else { this.state.message = 'That is not it. Try again before time runs out!'; this.emit('miss'); }
    } else if (correct) this.winRound();
    else this.passTurn('That solution is not correct. Next player.', 'miss');
    return correct;
  }
  winRound() {
    let earned = Math.max(1000, this.player.cash);
    if (this.state.round === 2 && this.state.lastWedge === 'JACKPOT') earned += this.state.jackpot;
    this.player.bank += earned;
    this.state.used = [...LETTERS];
    this.state.phase = 'round-over';
    this.state.message = `${this.player.name} solved it! ${money(earned)} added to the bank.`;
    this.emit('win');
  }
  nextRound() {
    if (this.state.phase !== 'round-over') return;
    this.state.round++;
    this.state.players.forEach(p => { p.cash = 0; });
    this.state.lastWedge = null;
    if (this.isBonus) {
      this.state.turn = this.state.players.reduce((best, p, i, all) => p.bank > all[best].bank ? i : best, 0);
      this.state.bonusChoices = [];
      this.state.bonusPrize = [25000, 30000, 35000, 40000, 50000, 100000][Math.floor(this.random() * 6)];
      this.selectPuzzle(true);
      this.state.phase = 'bonus-spin';
      this.state.message = `${this.player.name} reaches the bonus round! Spin the bonus wheel.`;
    } else {
      this.state.turn = (this.state.round - 1) % this.state.players.length;
      this.selectPuzzle(false);
      this.state.phase = 'action';
      this.state.message = `Round ${this.state.round}. Spin the wheel!`;
    }
    this.emit('round');
  }
  beginBonusSpin(){
    if(this.state.phase!=='bonus-spin')return false;
    this.state.phase='spinning-bonus';this.state.message='Spinning for your bonus prize...';this.emit('spin');return true;
  }
  finishBonusSpin(){
    if(this.state.phase!=='spinning-bonus')return;
    this.state.phase='bonus-select';this.state.message='RSTLNE are yours. Pick three consonants and one vowel.';this.emit('bonus-letters');
  }
  finishBonus(won) {
    if (!this.isBonus || this.state.phase === 'finished') return;
    if (won) this.player.bank += this.state.bonusPrize;
    this.state.used = [...LETTERS]; this.state.phase = 'finished';
    this.state.message = won ? `${this.player.name} wins ${money(this.state.bonusPrize)}! Final total: ${money(this.player.bank)}.` : `The answer was ${this.state.puzzle.answer}. Final total: ${money(this.player.bank)}.`;
    this.emit(won ? 'win' : 'miss');
  }
  save() { return JSON.stringify({state: this.state, used: [...this.usedPuzzles]}); }
  restore(serialized) {
    try {
      const {state, used} = JSON.parse(serialized);
      const puzzle = this.puzzles.find(p => p.id === state?.puzzle?.id);
      if (![1,2].includes(state?.version) || !puzzle || !Array.isArray(state.players) || state.players.length < 1 || state.players.length > 3 || !Number.isInteger(state.round) || state.round < 1 || state.round > 5 || !Number.isInteger(state.turn) || state.turn < 0 || state.turn >= state.players.length) return false;
      if (!['action','spinning','consonant','vowel','mystery','round-over','bonus-spin','spinning-bonus','bonus-select','bonus-solve','finished'].includes(state.phase) || !Array.isArray(state.used) || state.players.some(p => !Number.isFinite(p.cash) || !Number.isFinite(p.bank) || typeof p.name !== 'string')) return false;
      state.bonusChoices=Array.isArray(state.bonusChoices)?state.bonusChoices:[];
      if(state.version===1)state.players.forEach((p,i)=>{p.slot=i;p.ai=!!p.ai;});
      if(state.players.some(p=>typeof p.ai!=='boolean'||!Number.isInteger(p.slot)||p.slot<0||p.slot>2)||state.players.every(p=>p.ai)||new Set(state.players.map(p=>p.slot)).size!==state.players.length)return false;
      state.version=2;
      state.puzzle = puzzle;
      if (state.phase === 'spinning') state.phase = 'action';
      if (state.phase === 'spinning-bonus') state.phase = 'bonus-spin';
      if (state.phase === 'bonus-solve') state.phase = 'bonus-select';
      this.state = state; this.usedPuzzles = new Set(used); this.emit('restore'); return true;
    } catch { return false; }
  }
}
