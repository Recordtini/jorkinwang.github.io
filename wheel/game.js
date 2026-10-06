import {wheelValues,letterAvailability} from './presentation.js?v=20261006-recovery';
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
  start(names, mode = 'solo', options = {}) {
    if (!Array.isArray(names) || names.length < 1 || names.length > 3) throw new Error('Choose one to three players.');
    const players = names.map((entry, i) => typeof entry === 'string'
      ? {name:entry, ai:mode === 'solo' && i > 0, slot:i}
      : {name:String(entry.name || `Player ${i+1}`).trim().slice(0,18), ai:entry.ai === true, slot:entry.slot ?? i});
    players.sort((a,b)=>a.slot-b.slot);
    if (players.every(p=>p.ai) || players.some(p=>!Number.isInteger(p.slot)||p.slot<0||p.slot>2) || new Set(players.map(p=>p.slot)).size!==players.length) throw new Error('Choose at least one local player and distinct podiums.');
    this.usedPuzzles.clear();
    const rules={tossups:options.tossups===true,rounds:Math.max(1,Math.min(4,Math.trunc(options.rounds)||4)),bonus:options.bonus!==false,difficulty:['easy','medium','hard'].includes(options.difficulty)?options.difficulty:'medium',collectibles:options.collectibles===true};
    this.state = {version: 2, mode, rules, stageType:'regular', players: players.map(p=>({...p, bank:0, cash:0,prizes:0,freeSpin:false,wildCard:false,million:false,millionRound:null})),
      round: 1, turn: 0, used: [], phase: 'action', lastWedge: null, jackpot: 5000,
      availableCollectibles:{Million:true,WildCard:true,FreeSpin:true},mysteryTaken:false,mysteryWinSector:this.random()<.5?11:23,firstRoundTurn:0,jackpotEligible:false,
      bonusChoices: [], bonusPrize: 0, message: 'Spin the wheel, buy a vowel, or solve the puzzle.'};
    if(rules.tossups)this.startTossup(1);else this.selectPuzzle(false);
    this.emit('start');
  }
  selectPuzzle(bonus) {
    let pool = this.puzzles.filter(p => p.bonus === bonus && !this.usedPuzzles.has(p.id));
    if (!pool.length) pool = this.puzzles.filter(p => p.bonus === bonus);
    if (!pool.length) throw new Error('No puzzles available for this round');
    const puzzle = pool[Math.floor(this.random() * pool.length)];
    this.usedPuzzles.add(puzzle.id);
    this.state.puzzle = puzzle;
    this.state.announcedNotice=null;
    this.state.used = bonus ? ['R', 'S', 'T', 'L', 'N', 'E'] : [];
  }
  get player() { return this.state.players[this.state.turn]; }
  get isBonus() { return this.state.round === 5; }
  get isTossup() {return ['tossup','tiebreaker'].includes(this.state.stageType);}
  wedges() {
    const values=wheelValues(Math.min(4,this.state?.round??1));
    if(this.state?.rules?.collectibles&&!this.isTossup&&!this.isBonus){
      for(const [kind,sector] of Object.entries(this.collectibleSectors??{}))if(this.state.availableCollectibles[kind]&&(kind!=='Million'||this.state.round<=3))values[sector]=kind==='Million'?'MILLION DOLLAR':kind==='WildCard'?'WILD CARD':'FREE SPIN';
    }
    if(this.state.mysteryTaken&&this.state.round===3){values[11]=1000;values[23]=300;}
    return values.map(value=>({value}));
  }
  beginPower(){
    if(this.state.phase!=='action'||!letterAvailability(this.state).consonants)return false;
    this.state.phase='power';this.state.message='Press spin again to stop the power meter.';this.emit('power');return true;
  }
  beginSpin(power=55) {
    if (!['action','power'].includes(this.state.phase)||!letterAvailability(this.state).consonants) return null;
    this.state.spinPower=Math.max(11,Math.min(100,Math.round(power)||55));
    const index = Math.floor(this.random() * WEDGES.length);
    this.state.landingThird=this.wedges()[index].value==='MILLION DOLLAR'?Math.floor(this.random()*3)-1:0;
    this.state.phase = 'spinning';
    this.state.jackpotEligible=false;
    this.state.message = 'Round and round it goes...';
    this.emit('spin');
    return index;
  }
  finishSpin(index) {
    if (this.state.phase !== 'spinning' || !Number.isInteger(index) || index < 0 || index >= WEDGES.length) return;
    const wedge = this.landingValue(index);
    this.state.lastSpinIndex=index;
    this.state.lastWedge = wedge;
    if(this.state.round===2)this.state.jackpot+=typeof wedge==='number'?wedge:wedge==='JACKPOT'?500:0;
    if (wedge === 'BANKRUPT') {
      this.bankrupt();
      this.passTurn('Bankrupt! Your round money is gone.', 'bankrupt');
    } else if (wedge === 'LOSE A TURN') {
      this.passTurn('Lose a turn. The wheel passes to the next player.', 'lose-turn');
    } else {
      this.state.phase = 'consonant';
      this.state.message = typeof wedge === 'number' ? `${money(wedge)} per letter. Choose a consonant.` : `${wedge}! Choose a consonant.`;
      this.emit('land');
    }
  }
  buyVowel() {
    if (this.state.phase !== 'action' || this.player.cash < 250 || !letterAvailability(this.state).vowels) return false;
    this.player.cash -= 250;
    this.state.jackpotEligible=false;
    this.state.phase = 'vowel';
    this.state.message = 'Vowel purchased. Choose A, E, I, O, or U.';
    this.emit();
    return true;
  }
  canGuess(letter) {
    if (!LETTERS.includes(letter) || letter.length !== 1 || this.state.used.includes(letter)) return false;
    if (this.state.phase === 'bonus-select') {
      const choices = this.state.bonusChoices;
      return VOWELS.includes(letter) ? !choices.some(l => VOWELS.includes(l)) : choices.filter(l => !VOWELS.includes(l)).length < (this.state.bonusConsonants??3);
    }
    return this.state.phase === 'vowel' ? VOWELS.includes(letter) : this.state.phase === 'consonant' && !VOWELS.includes(letter);
  }
  guess(letter) {
    letter = letter.toUpperCase();
    if (!this.canGuess(letter)) return false;
    if (this.state.phase === 'bonus-select') {
      this.state.bonusChoices.push(letter);
      this.state.used.push(letter);
      if (this.state.bonusChoices.length === (this.state.bonusConsonants??3)+1) {
        this.state.phase = 'bonus-solve';
        this.state.message = 'You have 30 seconds. Solve the bonus puzzle!';
        this.emit('bonus-ready');
      } else {
        this.state.message = `Bonus letters: ${this.state.bonusChoices.join(' ')}. Pick ${(this.state.bonusConsonants??3) - this.state.bonusChoices.filter(l => !VOWELS.includes(l)).length} more consonants${this.state.bonusChoices.some(l => VOWELS.includes(l)) ? '' : ' and a vowel'}.`;
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
      const value = typeof wedge === 'number' ? wedge : wedge === 'MYSTERY' ? 1000 : wedge==='MILLION DOLLAR'||wedge==='FREE SPIN'?0:500;
      this.player.cash += value * count;
      const kind={'MILLION DOLLAR':'Million','WILD CARD':'WildCard','FREE SPIN':'FreeSpin'}[wedge];
      if(kind){this.player[{Million:'million',WildCard:'wildCard',FreeSpin:'freeSpin'}[kind]]=true;this.state.availableCollectibles[kind]=false;if(kind==='Million')this.player.millionRound=this.state.round;}
      this.state.wildCardValue=kind?500:value;
      this.state.jackpotEligible=wedge==='JACKPOT';
      if (wedge === 'MYSTERY') {
        this.state.phase = 'mystery';
        this.state.mysteryCash=value*count;
        this.state.message = `${count} ${letter}${count > 1 ? 's' : ''}! Keep the cash or risk it for $10,000?`;
        this.emit('mystery');
        return true;
      }
    }
    this.state.phase = 'action';
    this.state.message = `${count} ${letter}${count > 1 ? 's' : ''}! Spin again, buy a vowel, or solve.`;
    const available=letterAvailability(this.state);
    if(!available.vowels&&available.consonants)this.state.message=`${count} ${letter}${count>1?'s':''}! No more vowels. Spin again or solve.`;
    if(!available.consonants&&available.vowels)this.state.message=`${count} ${letter}${count>1?'s':''}! Only vowels remain. Buy a vowel or solve.`;
    if (this.complete()) this.winRound(); else this.emit('letter');
    return true;
  }
  mystery(risk) {
    if (this.state.phase !== 'mystery') return;
    if(risk)this.state.mysteryTaken=true;
    if (risk && this.state.lastSpinIndex!==this.state.mysteryWinSector) { this.bankrupt(); this.passTurn('Mystery Bankrupt! The next player is up.', 'bankrupt'); return; }
    if (risk){this.player.cash-=this.state.mysteryCash;this.player.prizes+=10000;}
    this.state.phase = 'action';
    this.state.message = risk ? '$10,000! Keep going.' : 'You kept your money. Spin again or solve.';
    if (this.complete()) this.winRound(); else this.emit(risk ? 'prize' : 'letter');
  }
  complete() { return [...this.state.puzzle.answer.toUpperCase()].every(l => !LETTERS.includes(l) || this.state.used.includes(l)); }
  passTurn(message, event) {
    if(this.player.freeSpin){this.state.phase='free-spin';this.state.pendingTurn={message,event};this.state.message='Would you like to use your Free Spin now?';this.emit(event);return;}
    this.state.turn = (this.state.turn + 1) % this.state.players.length;
    this.state.phase = 'action'; this.state.lastWedge = null;this.state.jackpotEligible=false;
    this.state.message = message; this.emit(event);
  }
  solve(answer) {
    if (!['action', 'bonus-solve','tossup-solve'].includes(this.state.phase)) return false;
    if (!normalizeAnswer(answer)) return false;
    const correct = normalizeAnswer(answer) === normalizeAnswer(this.state.puzzle.answer);
    if(this.isTossup){
      if(correct){this.player.bank+=this.state.tossupAward;this.state.used=[...LETTERS];this.state.revealedTiles=this.state.puzzle.rows.flatMap((r,i)=>[...r].map((_,c)=>i*14+c));this.state.phase='tossup-over';this.state.message=`${this.player.name} wins the ${money(this.state.tossupAward)} toss-up!`;this.state.tossupWinner=this.state.turn;this.emit('tossup-win');}
      else this.releaseBuzz();
    } else if (this.isBonus) {
      if (correct) this.finishBonus(true);
      else { this.state.message = 'That is not it. Try again before time runs out!'; this.emit('miss'); }
    } else if (correct) this.winRound();
    else this.passTurn('That solution is not correct. Next player.', 'miss');
    return correct;
  }
  winRound() {
    let earned = Math.max(1000, this.player.cash+this.player.prizes);
    if (this.state.round === 2 && this.state.jackpotEligible) earned += this.state.jackpot;
    for(const [i,p] of this.state.players.entries())if(p.millionRound===this.state.round){if(i!==this.state.turn)p.million=false;p.millionRound=null;}
    this.player.bank += earned;
    this.state.used = [...LETTERS];
    this.state.phase = 'round-over';
    this.state.message = `${this.player.name} solved it! ${money(earned)} added to the bank.`;
    this.emit('win');
  }
  nextRound() {
    if(this.state.phase==='tossup-over'){this.advanceTossup();return;}
    if (this.state.phase !== 'round-over') return;
    if(this.state.rules?.tossups&&this.state.round===3&&this.state.rules.rounds===4){this.startTossup(3);this.emit('round');return;}
    if(this.state.round>=(this.state.rules?.rounds??4)){
      const best=Math.max(...this.state.players.map(p=>p.bank)),tied=this.state.players.map((p,i)=>p.bank===best?i:null).filter(i=>i!==null);
      if(tied.length>1&&this.state.rules?.tossups){this.startTossup(0,tied);this.emit('round');return;}
      this.startFinal(tied[0]);return;
    }
    this.state.round++;
    this.state.players.forEach(p => { p.cash = 0;p.prizes=0; });
    this.state.lastWedge = null;
    {
      this.state.turn = ((this.state.firstRoundTurn??0)+this.state.round-1) % this.state.players.length;
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
    this.state.phase=this.player.wildCard?'bonus-wildcard':'bonus-select';this.state.message=this.player.wildCard?'Would you like to use your Wild Card for an extra bonus consonant?':'RSTLNE are yours. Pick three consonants and one vowel.';this.emit('bonus-letters');
  }
  finishBonus(won) {
    if (!this.isBonus || this.state.phase === 'finished') return;
    if (won) this.player.bank += this.state.bonusPrize;
    this.state.used = [...LETTERS]; this.state.phase = 'finished';
    this.state.message = won ? `${this.player.name} wins ${money(this.state.bonusPrize)}! Final total: ${money(this.player.bank)}.` : `The answer was ${this.state.puzzle.answer}. Final total: ${money(this.player.bank)}.`;
    this.emit(won ? 'win' : 'miss');
  }
  save() { return JSON.stringify({state: this.state, used: [...this.usedPuzzles]}); }
  bankrupt(){this.player.cash=0;this.player.prizes=0;this.player.million=false;this.player.millionRound=null;this.player.wildCard=false;}
  landingValue(index){const v=this.wedges()[index].value;return v==='MILLION DOLLAR'&&this.state.landingThird!==0?'BANKRUPT':v;}
  useFreeSpin(use){
    if(this.state.phase!=='free-spin')return;
    const pending=this.state.pendingTurn;this.state.pendingTurn=null;
    if(use){this.player.freeSpin=false;this.state.phase='action';this.state.lastWedge=null;this.state.message='Free Spin used. You keep your turn.';this.emit('free-spin-used');}
    else{this.state.turn=(this.state.turn+1)%this.state.players.length;this.state.phase='action';this.state.lastWedge=null;this.state.message=pending.message;this.emit('turn');}
  }
  useWildCard(use=true){
    if(this.state.phase==='bonus-wildcard'){
      if(use){this.player.wildCard=false;this.state.bonusConsonants=4;}
      this.state.phase='bonus-select';this.state.message=`RSTLNE are yours. Pick ${this.state.bonusConsonants} consonants and one vowel.`;this.emit('wild-card');return true;
    }
    if(this.state.phase!=='action'||!this.player.wildCard||!(this.state.wildCardValue>0)||this.state.lastWedge===null)return false;
    this.player.wildCard=false;this.state.lastWedge=this.state.wildCardValue;this.state.jackpotEligible=false;this.state.phase='consonant';this.state.message=`Wild Card: choose another consonant for ${money(this.state.wildCardValue)} per letter.`;this.emit('wild-card');return true;
  }
  startTossup(number,eligible=null){
    Object.assign(this.state,{stageType:number===0?'tiebreaker':'tossup',tossupNumber:number,tossupAward:number*1000,tossupWinner:null,tossupLocked:[],tossupEligible:eligible??this.state.players.map((_,i)=>i),revealedTiles:[],phase:'tossup',lastWedge:null});
    this.state.players.forEach(p=>{p.cash=0;});this.selectPuzzle(false);
    this.state.tossupOrder=this.state.puzzle.rows.flatMap((r,i)=>[...r].map((l,c)=>({l,index:i*14+c}))).filter(t=>/[A-Z]/.test(t.l)).map(t=>t.index);
    for(let i=this.state.tossupOrder.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.state.tossupOrder[i],this.state.tossupOrder[j]]=[this.state.tossupOrder[j],this.state.tossupOrder[i]];}
    this.state.message=number?`${money(number*1000)} toss-up. Buzz in when you know the puzzle!`:'Tie-breaker. Buzz in to win your place in the bonus round!';
  }
  revealTossup(){
    if(this.state.phase!=='tossup')return false;
    const index=this.state.tossupOrder.find(i=>!this.state.revealedTiles.includes(i));
    if(index===undefined){this.endTossup();return false;}
    this.state.revealedTiles.push(index);this.emit('tossup-letter');return true;
  }
  buzz(index){
    if(this.state.phase!=='tossup'||!this.state.tossupEligible.includes(index)||this.state.tossupLocked.includes(index))return false;
    this.state.turn=index;this.state.phase='tossup-solve';this.state.message=`${this.player.name} buzzed in. Fill the missing letters!`;this.emit('buzz');return true;
  }
  endTossup(){
    this.state.phase='tossup-over';this.state.used=[...LETTERS];this.state.revealedTiles=this.state.tossupOrder.slice();
    this.state.message='No winner on this toss-up. The answer is on the board.';this.emit('tossup-end');
  }
  releaseBuzz(){
    if(this.state.phase!=='tossup-solve')return;
    this.state.tossupLocked.push(this.state.turn);this.state.phase='tossup';this.state.message='That is not it. The other players can buzz in.';
    if(this.state.tossupEligible.every(i=>this.state.tossupLocked.includes(i)))this.endTossup();else this.emit('miss');
  }
  advanceTossup(){
    const number=this.state.tossupNumber,winner=this.state.tossupWinner;
    if(number===0){if(winner===null){this.startTossup(0,this.state.tossupEligible);this.emit('round');}else this.startFinal(winner);return;}
    if(number===1){this.startTossup(2);this.emit('round');return;}
    Object.assign(this.state,{stageType:'regular',round:number===3?4:1,phase:'action',turn:winner??0,lastWedge:null,message:'Spin the wheel, buy a vowel, or solve the puzzle.'});
    if(number===2)this.state.firstRoundTurn=winner??0;
    this.selectPuzzle(false);this.emit('round');
  }
  startFinal(winner){
    this.state.turn=winner;
    if(this.state.rules?.bonus===false){this.state.phase='finished';this.state.message=`${this.player.name} wins with ${money(this.player.bank)}!`;this.emit('win');return;}
    Object.assign(this.state,{round:5,stageType:'bonus',bonusChoices:[],bonusConsonants:3,lastWedge:null});
    const prizes=[25000,30000,35000,40000,45000,50000,this.player.million?1000000:100000];
    this.state.bonusPrize=prizes[Math.floor(this.random()*prizes.length)];
    this.selectPuzzle(true);this.state.phase='bonus-spin';this.state.message=`${this.player.name} reaches the bonus round! Spin the bonus wheel.`;this.emit('round');
  }
  restore(serialized) {
    try {
      const {state, used} = JSON.parse(serialized);
      const puzzle = this.puzzles.find(p => p.id === state?.puzzle?.id);
      if (![1,2].includes(state?.version) || !puzzle || !Array.isArray(state.players) || state.players.length < 1 || state.players.length > 3 || !Number.isInteger(state.round) || state.round < 1 || state.round > 5 || !Number.isInteger(state.turn) || state.turn < 0 || state.turn >= state.players.length) return false;
      if (!['action','power','spinning','consonant','vowel','mystery','round-over','bonus-spin','spinning-bonus','bonus-select','bonus-solve','finished','free-spin','bonus-wildcard','tossup','tossup-solve','tossup-over'].includes(state.phase) || !Array.isArray(state.used) || state.players.some(p => !Number.isFinite(p.cash) || !Number.isFinite(p.bank) || typeof p.name !== 'string')) return false;
      state.bonusChoices=Array.isArray(state.bonusChoices)?state.bonusChoices:[];
      if(state.version===1)state.players.forEach((p,i)=>{p.slot=i;p.ai=!!p.ai;});
      if(state.players.some(p=>typeof p.ai!=='boolean'||!Number.isInteger(p.slot)||p.slot<0||p.slot>2)||state.players.every(p=>p.ai)||new Set(state.players.map(p=>p.slot)).size!==state.players.length)return false;
      state.version=2;
      state.rules??={rounds:4,tossups:false,bonus:true,difficulty:'medium',collectibles:false};
      if(![1,2,3,4].includes(state.rules.rounds)||!['easy','medium','hard'].includes(state.rules.difficulty))return false;
      state.firstRoundTurn??=0;state.jackpotEligible??=state.lastWedge==='JACKPOT'&&state.phase==='action';
      if(![11,23].includes(state.mysteryWinSector))state.mysteryWinSector=this.random()<.5?11:23;
      state.stageType??=state.round===5?'bonus':'regular';state.bonusConsonants??=3;
      state.availableCollectibles??={Million:true,WildCard:true,FreeSpin:true};state.mysteryTaken??=false;
      state.players.forEach(p=>{p.prizes=Number.isFinite(p.prizes)?p.prizes:0;for(const k of ['freeSpin','wildCard','million'])p[k]=p[k]===true;});
      if(['tossup','tossup-solve','tossup-over'].includes(state.phase)){
        if(!Array.isArray(state.tossupOrder)||!Array.isArray(state.revealedTiles)||!Array.isArray(state.tossupLocked)||!Array.isArray(state.tossupEligible)||[...state.tossupOrder,...state.revealedTiles].some(i=>!Number.isInteger(i)||i<0||i>=56)||state.tossupEligible.some(i=>!Number.isInteger(i)||!state.players[i]))return false;
        if(state.phase==='tossup-solve')state.phase='tossup';
      }
      if(state.phase==='free-spin'&&(!state.pendingTurn||typeof state.pendingTurn.message!=='string'))return false;
      state.puzzle = puzzle;
      if (['spinning','power'].includes(state.phase)) state.phase = 'action';
      if (state.phase === 'spinning-bonus') state.phase = 'bonus-spin';
      if (state.phase === 'bonus-solve') state.phase = 'bonus-select';
      this.state = state; this.usedPuzzles = new Set(used); this.emit('restore'); return true;
    } catch { return false; }
  }
}
