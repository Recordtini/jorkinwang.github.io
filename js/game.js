/* WHEEL OF FORTUNE 2nd Edition - Web Port
 * Full game engine: 3-player rounds, wheel spin, letter guessing, vowels,
 * solving, scoring, AI opponents, and the bonus round.
 *
 * Original data: Regular.bin/Bonus.bin puzzles, original backgrounds/sprites,
 * converted cutscene videos, and original sound banks.
 */
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 800, H = 600;
canvas.width = W; canvas.height = H;

/* ------------------------------------------------------------------ *
 *  Configuration / constants
 * ------------------------------------------------------------------ */
const VOWELS = ['A','E','I','O','U'];
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Classic early-2000s Wheel layout (values present in the binary comparator).
const WHEEL_SEGMENTS = [
    { label: '$500',      value: 500 },
    { label: '$800',      value: 800 },
    { label: 'BANKRUPT',  value: 0,  type: 'bankrupt' },
    { label: '$350',      value: 350 },
    { label: '$450',      value: 450 },
    { label: '$500',      value: 500 },
    { label: '$650',      value: 650 },
    { label: '$400',      value: 400 },
    { label: '$900',      value: 900 },
    { label: '$250',      value: 250 },
    { label: '$500',      value: 500 },
    { label: '$550',      value: 550 },
    { label: '$800',      value: 800 },
    { label: '$300',      value: 300 },
    { label: '$400',      value: 400 },
    { label: '$350',      value: 350 },
    { label: '$600',      value: 600 },
    { label: 'LOSE TURN', value: 0,  type: 'loseturn' },
    { label: '$500',      value: 500 },
    { label: '$300',      value: 300 },
    { label: '$700',      value: 700 },
    { label: '$500',      value: 500 },
    { label: '$350',      value: 350 },
    { label: '$2500',     value: 2500 },
];

const ROUNDS_BY_LENGTH = { short: 3, standard: 3, long: 4 };
const BOARD_COLS = 12, BOARD_ROWS = 4;
const VOWEL_COST = 250;

/* ------------------------------------------------------------------ *
 *  Puzzle bank
 * ------------------------------------------------------------------ */
let PUZZLE_BANK = [];
let BONUS_BANK = [];

async function loadPuzzles() {
    const [bon, reg] = await Promise.all([
        fetch('assets/puzzles/bonus_game.json').then(r => r.json()).catch(() => []),
        fetch('assets/puzzles/game.json').then(r => r.json()).catch(() => [])
    ]);
    PUZZLE_BANK = reg;
    BONUS_BANK = bon;
    if (!PUZZLE_BANK.length) throw new Error('Could not load puzzle bank');
}

function pickPuzzle(bank, used) {
    if (!bank.length) return null;
    let idx = Math.floor(Math.random() * bank.length);
    for (let i = 0; i < bank.length; i++) {
        const cand = bank[(idx + i) % bank.length];
        if (!used.has(cand.s)) return cand;
    }
    return bank[Math.floor(Math.random() * bank.length)];
}

/* ------------------------------------------------------------------ *
 *  Audio engine
 * ------------------------------------------------------------------ */
class Sfx {
    constructor() {
        this.ctx = null;
        this.clips = {};
    }
    ensure() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }
    tone(freq, dur, type, vol, delay, slideTo) {
        const ctx = this.ensure();
        if (!ctx || GameAudio.muted) return;
        const t0 = ctx.currentTime + (delay || 0);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + dur + 0.02);
    }
    chord(freqs, dur, type, vol, delay) {
        freqs.forEach((f, i) => this.tone(f, dur, type, vol, (delay || 0) + i * 0.02));
    }
    playClip(name, vol) {
        const c = AudioCache[name];
        if (!c || GameAudio.muted) return false;
        try {
            c.currentTime = 0;
            if (vol !== undefined) c.volume = vol;
            c.play().catch(() => {});
            return true;
        } catch (e) { return false; }
    }
    spin() {
        // Original wheel SFX clip when available, synthesized decel otherwise.
        if (!this.playClip('spin1')) this.spinSound();
    }
    tick()  { this.tone(1200, 0.03, 'square', 0.05); }
    click() { this.tone(880, 0.05, 'square', 0.08); }
    spinSound() {
        const ctx = this.ensure(); if (!ctx || GameAudio.muted) return;
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, t0);
        osc.frequency.exponentialRampToValueAtTime(40, t0 + 3.5);
        g.gain.setValueAtTime(0.06, t0);
        g.gain.setValueAtTime(0.035, t0 + 3.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.8);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 4);
    }
    reveal()  { this.tone(660, 0.12, 'triangle', 0.14); this.tone(880, 0.12, 'triangle', 0.12, 0.08); }
    wrong()   { this.tone(180, 0.35, 'sawtooth', 0.12, 0, 120); }
    bankrupt(){ this.tone(140, 0.6, 'sawtooth', 0.15, 0, 60); this.tone(110, 0.8, 'square', 0.1, 0.15, 50); }
    solve()   { this.chord([523, 659, 784, 1047], 0.5, 'triangle', 0.14); }
    loss()    { this.tone(330, 0.4, 'sine', 0.1, 0, 200); }
    win()     { this.chord([523, 659, 784, 1047, 1319], 0.9, 'triangle', 0.16); }
    cash()    { this.tone(990, 0.08, 'square', 0.08); this.tone(1320, 0.1, 'square', 0.08, 0.06); }
    clockTick(){ this.tone(1000, 0.04, 'square', 0.1); }
}
const sfx = new Sfx();

/* ------------------------------------------------------------------ *
 *  Vanna (originally Voiced by Vanna White, from Vanna.dat)
 *  Lazy-loads the original WAV clips and plays them by duration bucket.
 * ------------------------------------------------------------------ */
const Vanna = {
    buckets: { letter: [], phrase: [], sentence: [], long: [] },
    loaded: false,
    audio: {},
    playing_: false,
    load() {
        if (this.loaded) return Promise.resolve();
        this.loaded = true;
        return fetch('assets/audio/vanna/buckets.json')
            .then(r => r.json())
            .catch(() => ({}))
            .then(b => { this.buckets = Object.assign(this.buckets, b); });
    },
    pick(bucket) {
        const arr = this.buckets[bucket];
        if (!arr || !arr.length) return null;
        return arr[randInt(arr.length)];
    },
    play(bucket, vol) {
        if (GameAudio.muted || this.playing_) return;
        const idx = this.pick(bucket);
        if (idx === null) return;
        this.playing_ = true;
        const el = this.audio[idx] || (() => {
            const a = new Audio('assets/audio/vanna/vanna_' + String(idx).padStart(4, '0') + '.wav');
            a.preload = 'auto';
            this.audio[idx] = a;
            return a;
        })();
        try {
            el.volume = vol || 0.8;
            el.currentTime = 0;
            const done = () => { this.playing_ = false; };
            el.onended = el.onerror = done;
            const p = el.play();
            if (p && p.catch) p.catch(done);
            setTimeout(done, 8000); // safety in case the clip stalls
        } catch (e) { this.playing_ = false; }
    },
    stop() { this.playing_ = false; }
};

/* ------------------------------------------------------------------ *
 *  Players / state
 * ------------------------------------------------------------------ */
const GameAudio = { muted: false };
let state = {
    screen: 'LOADING',
    players: [],
    round: 0,
    roundCount: 3,
    currentPlayer: 0,
    puzzle: null,
    revealed: new Set(),
    usedLetters: new Set(),
    spinning: false,
    spinValue: 0,
    spinType: 'money',
    solveMode: false,
    buyVowelMode: false,
    pickingLetter: false,
    message: '',
    message2: '',
    messageTimer: 0,
    lastPick: null,
    gameOver: false,
    freeSpins: [0, 0, 0],
    usedPuzzles: new Set(),
    surprise: null,
    inBonus: false,
    bonusActive: false,
    bonusResult: null,
    bonusTimer: 0,
    wheelAngle: 0,
    wheelTarget: 0,
    wheelVelocity: 0,
    wheelSpinning: false,
    wheelResult: null,
    wheelResultTimer: 0,
    config: { humans: 1, length: 'standard' },
};

function newPlayer(name, isHuman, diff) {
    return { name, isHuman, diff: diff || 2, score: 0, roundScore: 0 };
}

/* ------------------------------------------------------------------ *
 *  Localization of category names (from the binary's category table)
 * ------------------------------------------------------------------ */
const CATEGORY_LOOKUP = {
    Phrase: 'Phrase', Thing: 'Thing', Place: 'Place', Title: 'Title',
    'People': 'People', 'Person': 'Person', 'Proper Name': 'Proper Name',
    'Fun & Games': 'Fun & Games', 'Occupation': 'Occupation',
    'TV Title': 'TV Title', 'Song Lyrics': 'Song Lyrics',
    'Around the House': 'Around the House', 'Movie Title': 'Movie Title',
    'Comic Characters': 'Comic Characters', 'Celebrity Couples': 'Celebrity Couples',
    'Same Name': 'Same Name', 'Trivia': 'Trivia', 'Clue': 'Clue'
};

/* ------------------------------------------------------------------ *
 *  RNG helpers (game RNG)
 * ------------------------------------------------------------------ */
function randInt(n) { return Math.floor(Math.random() * n); }

/* ------------------------------------------------------------------ *
 *  Board (puzzle) model
 * ------------------------------------------------------------------ */
function boardCells(puzzle) {
    const s = puzzle.s.replace(/'/g, '');
    return s.split(' ').map(word => word.split(''));
}
function boardLength(puzzle) {
    let n = 0;
    puzzle.s.replace(/'/g, '').split(' ').forEach(w => n += w.length);
    return n;
}

/* ------------------------------------------------------------------ *
 *  Wheel model
 * ------------------------------------------------------------------ */
function shuffledWheel() {
    const segs = WHEEL_SEGMENTS.slice();
    for (let i = segs.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [segs[i], segs[j]] = [segs[j], segs[i]];
    }
    return segs;
}
let currentWheel = shuffledWheel();

function spinWheel(playerIdx, cb) {
    state.spinning = true; state.wheelSpinning = true;
    state.message = '';
    state.message2 = '';
    const spins = 4.2 + Math.random() * 2.2;         // full rotations
    const segIdx = randInt(currentWheel.length);
    const segAngle = (2 * Math.PI) / currentWheel.length;
    const base = state.wheelAngle;
    const target = base + spins * 2 * Math.PI + (segIdx + 0.5) * segAngle;
    state.wheelTarget = target;
    state.wheelVelocity = 0;
    sfx.spin();
    const animStart = performance.now();
    const DURATION = 3900;

    function frame(now) {
        const t = Math.min(1, (now - animStart) / DURATION);
        const eased = easeOutCubic(t);
        state.wheelAngle = base + (target - base) * eased;
        if (t < 1) { requestAnimationFrame(frame); return; }
        state.wheelAngle = target % (2 * Math.PI);
        state.spinning = false; state.wheelSpinning = false;
        const seg = currentWheel[segIdx];
        state.spinValue = seg.value;
        state.spinType = seg.type || 'money';
        state.wheelResult = seg;
        state.wheelResultTimer = 90;
        cb && cb(seg);
    }
    requestAnimationFrame(frame);
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

/* ------------------------------------------------------------------ *
 *  Game flow control
 * ------------------------------------------------------------------ */
function startGame(config) {
    const numHuman = config.humans || 1;
    state.players = [];
    for (let i = 0; i < 3; i++) {
        if (i < numHuman) state.players.push(newPlayer(config.playerNames[i] || 'YOU', true));
        else {
            const aiNames = ['REX', 'MAX', 'JENNY', 'KIP', 'SAM', 'MO', 'ANN', 'RIKKI'];
            state.players.push(newPlayer(aiNames[(i - numHuman) + Math.floor(Math.random() * 4)], false, 1 + randInt(3)));
        }
    }
    state.roundCount = ROUNDS_BY_LENGTH[config.length] || 3;
    state.round = 0;
    state.screen = 'PLAY';
    state.gameOver = false;
    state.usedPuzzles = new Set();
    state.freeSpins = [0, 0, 0];
    state.bonusResult = null;
    state.inBonus = false;
    currentWheel = shuffledWheel();
    startRound();
}

function startRound() {
    state.round++;
    state.wonThisRound = false;
    state.revealed = new Set();
    state.usedLetters = new Set();
    state.solveMode = false;
    state.buyVowelMode = false;
    state.pickingLetter = false;
    state.message = `ROUND ${state.round}`;
    state.message2 = 'choose your move';
    // Rotate start player
    state.currentPlayer = (state.round - 1) % 3;
    state.players.forEach(p => p.roundScore = 0);
    // pick a puzzle (avoid repeats)
    const p = pickPuzzle(PUZZLE_BANK, state.usedPuzzles);
    if (!p) { state.usedPuzzles.clear(); state.puzzle = PUZZLE_BANK[randInt(PUZZLE_BANK.length)]; }
    else { state.puzzle = p; state.usedPuzzles.add(p.s); }
    state.wheelResult = null;
    state.mustSpin = true;
    if (state.round > 1) videoBump(); // keep warm ambiance
    Vanna.play('phrase'); // "Round X!" style announcement (original voice clips)
    setTimeout(() => { if (!state.inBonus) Vanna.play('phrase'); }, 1500); // occasional follow-up call
    beginTurn();
}

function setMessage(m1, m2) {
    state.message = m1; state.message2 = m2 || '';
    state.messageTimer = 160;
}

function toggleMute() {
    GameAudio.muted = !GameAudio.muted;
    try {
        const v = document.querySelectorAll('video');
        v.forEach(el => { el.muted = GameAudio.muted; });
    } catch (e) {}
    if (GameAudio.muted) Vanna.stop();
    else sfx.click();
}

function currentPlayer() { return state.players[state.currentPlayer]; }

function consumeSpinAction() {
    // A player who just spun must now pick a consonant unless they hit a special.
}

/* --- AI decision making ------------------------------------------- */
function aiDecide(pi) {
    const p = state.players[pi];
    const diff = p.diff;
    const puzzleLetters = new Set();
    for (const ch of state.puzzle.s.replace(/[^A-Z]/g, '')) puzzleLetters.add(ch);

    const unpicked = CONSONANTS.filter(l => !state.usedLetters.has(l) && puzzleLetters.has(l));
    const hasMoney = p.roundScore >= VOWEL_COST;
    const vowelsAvailable = VOWELS.filter(l => !state.usedLetters.has(l));
    const guessable = [...puzzleLetters].filter(l => !state.usedLetters.has(l));

    // Difficulty gate: higher difficulty => smarter (favors copying original RNG gate).
    if (guessable.length === 0) return 'solve';
    if (state.mustSpin) return 'spin';

    const roll = Math.random();
    const wantSolve = state.revealed.size >= Math.max(4, boardLength(state.puzzle) * (0.35 + diff * 0.15));
    if (wantSolve && roll < 0.30 * diff) return 'solve';

    // Kept turn (no fresh spin behind it yet): buy a vowel now and then,
    // otherwise spin again. Never call a bare consonant here — without a
    // spin value the pick is rejected and the turn would stall.
    if (hasMoney && vowelsAvailable.length && roll < 0.10 + 0.08 * diff) return 'vowel';
    return 'spin';
}

function aiAutoPlay() {
    if (state.screen !== 'PLAY' || state.inBonus) return;
    const p = currentPlayer();
    if (p.isHuman) return;

    setTimeout(() => {
        if (state.solveMode || state.screen !== 'PLAY') return;
        const action = aiDecide(state.currentPlayer);
        doPlayerAction(state.currentPlayer, action);
    }, 700 + randInt(900));
}

/* ------------------------------------------------------------------ *
 *  Player actions
 * ------------------------------------------------------------------ */
function doPlayerAction(pi, action) {
    const p = state.players[pi];
    if (action === 'spin' && !state.mustSpin) {
        // allow spin if they have not spun yet
    }
    switch (action) {
        case 'spin':
            if (state.spinning) return;
            state.mustSpin = false;
            state.pickingLetter = false;
            state.buyVowelMode = false;
            spinWheel(pi, (seg) => onWheelResult(pi, seg));
            break;
        case 'consonant':
            if (state.spinValue <= 0 || state.spinType !== 'money') {
                // No spin behind this pick (e.g. kept turn): the AI spins
                // again instead of stalling; a human is told to spin.
                if (!p.isHuman) { doPlayerAction(pi, 'spin'); return; }
                setMessage(p.name, 'must spin first');
                return;
            }
            if (!CONSONANTS.some(l => !state.usedLetters.has(l))) {
                // Every consonant has been called: the only move left is solving.
                state.solveMode = true;
                stateGuess = '';
                setMessage(`${p.name}, no consonants left`, 'solve the puzzle to finish');
                if (!p.isHuman) aiSolve(pi);
                break;
            }
            state.pickingLetter = true;
            if (!p.isHuman) aiPickConsonant(pi);
            else setMessage(`$${state.spinValue} \u2014 ${p.name}, pick a consonant`, 'click a letter or type it');
            break;
        case 'vowel':
            if (p.roundScore < VOWEL_COST) {
                setMessage(p.name, 'not enough money for a vowel');
                if (!p.isHuman) { nextTurn(false, 'no money'); return; }
                return;
            }
            state.buyVowelMode = true;
            if (!p.isHuman) aiPickVowel(pi);
            else setMessage(`${p.name}, buy a vowel \u2014 $${VOWEL_COST}`, 'click a vowel or type it');
            break;
        case 'solve':
            state.solveMode = true;
            stateGuess = '';
            state.message = `${p.name}, solve the puzzle`;
            state.message2 = 'type it out below';
            if (!p.isHuman) {
                // AI solves if it has enough letters revealed
                const revealedCount = state.revealed.size;
                const total = boardLength(state.puzzle);
                if (revealedCount / total >= 0.5 + (3 - p.diff) * 0.08) aiSolve(pi);
                else { setMessage(p.name, 'CHANGE OF MIND'); nextTurn(false, 'change'); }
            }
            break;
    }
}

function onWheelResult(pi, seg) {
    const p = state.players[pi];
    if (seg.type === 'bankrupt') {
        p.roundScore = 0;
        sfx.bankrupt();
        Vanna.play('phrase'); // Vanna reacts to the bankrupt
        setMessage('BANKRUPT!', p.name + ' loses round earnings');
        state.spinValue = 0; state.spinType = 'money';
        setTimeout(() => nextTurn(true), 1800);
    } else if (seg.type === 'loseturn') {
        sfx.wrong();
        setMessage('LOSE TURN', p.name + ' loses the turn');
        state.spinValue = 0; state.spinType = 'money';
        setTimeout(() => nextTurn(true), 1700);
    } else {
        sfx.click();
        setMessage(`WHEEL LANDED ON $${seg.value}`, p.name + ' picks a consonant');
        state.mustSpin = false;
        if (!p.isHuman) setTimeout(() => doPlayerAction(pi, 'consonant'), 900 + randInt(700));
    }
}

function aiPickConsonant(pi) {
    const p = state.players[pi];
    const puzzleLetters = new Set();
    for (const ch of state.puzzle.s.replace(/[^A-Z]/g, '')) puzzleLetters.add(ch);
    // Deterministic first available consonant (A->Z), matching original AI
    const pick = CONSONANTS.find(l => !state.usedLetters.has(l) && puzzleLetters.has(l));
    setTimeout(() => {
        if (!pick) { setMessage(p.name, 'no consonants left'); nextTurn(true, 'no letters'); return; }
        resolveLetter(pi, pick);
    }, 1000 + randInt(800));
}

function aiPickVowel(pi) {
    const p = state.players[pi];
    const puzzleLetters = new Set();
    for (const ch of state.puzzle.s.replace(/[^A-Z]/g, '')) puzzleLetters.add(ch);
    const pick = VOWELS.find(l => !state.usedLetters.has(l) && puzzleLetters.has(l));
    setTimeout(() => {
        if (!pick) { setMessage(p.name, 'no vowels left'); nextTurn(true, 'no letters'); return; }
        resolveVowel(pi, pick);
    }, 1000 + randInt(800));
}

function aiSolve(pi) {
    setTimeout(() => {
        if (checkSolution(state.puzzle.s)) { /* handled in checkSolution */ }
        else { setMessage(state.players[pi].name, 'correct'); }
    }, 1200);
}

function resolveLetter(pi, letter) {
    const p = state.players[pi];
    if (VOWELS.includes(letter)) { setMessage(letter + ' is a vowel', 'buy it with BUY VOWEL instead'); return; }
    // Already called: stay in pick mode so another letter can be chosen.
    if (state.usedLetters.has(letter)) { setMessage(p.name, letter + ' was already called'); return; }
    state.buyVowelMode = false; state.solveMode = false; state.pickingLetter = false;
    state.usedLetters.add(letter);
    const count = countInPuzzle(state.puzzle.s, letter);
    if (count > 0) {
        const earned = state.spinValue * count;
        p.roundScore += earned;
        state.message = `${letter} x${count} = $${earned}`;
        sfx.reveal();
        setTimeout(() => {
            revealLetter(letter);
            if (isSolved()) { roundWon(pi, 'solved'); return; }
            if (!p.isHuman) {
                // original: reveal loop; allow continue (spin again/logic per difficulty)
                setTimeout(() => nextTurn(false, 'keep'), 1400);
            }
        }, 600);
    } else {
        sfx.wrong();
        state.message = `${letter} is not in the puzzle`;
        setTimeout(() => nextTurn(true), 1500);
    }
    state.spinValue = 0; state.spinType = 'money';
}

function resolveVowel(pi, letter) {
    const p = state.players[pi];
    if (!VOWELS.includes(letter)) { setMessage(letter + ' is not a vowel', 'pick A, E, I, O or U'); return; }
    if (p.roundScore < VOWEL_COST) { setMessage(p.name, 'not enough money for a vowel'); state.buyVowelMode = false; return; }
    // Already called: stay in pick mode so another vowel can be chosen.
    if (state.usedLetters.has(letter)) { setMessage(p.name, letter + ' was already called'); return; }
    state.buyVowelMode = false; state.solveMode = false; state.pickingLetter = false;
    p.roundScore -= VOWEL_COST;
    state.usedLetters.add(letter);
    const count = countInPuzzle(state.puzzle.s, letter);
    sfx.tick();
    sfx.playClip('coin'); // cash-register for the $250 vowel buy
    setTimeout(() => {
        revealLetter(letter);
        if (count === 0) setMessage(`${letter} is not in the puzzle`, `you paid $${VOWEL_COST}`);
        else setMessage(`${letter} appears ${count} time${count > 1 ? 's' : ''}`, `$${VOWEL_COST} deducted`);
        if (isSolved()) { roundWon(pi, 'solved'); return; }
        setTimeout(() => nextTurn(false, 'keep'), 1400);
    }, 400);
}

function resolveSolve(pi, guess) {
    state.solveMode = false;
    if (checkSolution(guess)) {
        sfx.solve();
        const bonus = state.spinValue > 0 ? state.spinValue * 5 : 1000;
        const p = state.players[pi];
        if (state.round === state.roundCount) {
            // Final round speed round already handled in startRound; keep simple
        }
    } else {
        sfx.wrong();
        sfx.playClip('wrong2');
        state.message = state.players[pi].name + ' is incorrect';
        setTimeout(() => nextTurn(true), 1500);
    }
}

function checkSolution(guess) {
    const a = normalize(guess);
    const b = normalize(state.puzzle.s);
    if (a === b) {
        if (!state.wonThisRound) roundWon(state.currentPlayer, 'solve');
        return true;
    }
    return false;
}
function normalize(s) { return s.toUpperCase().replace(/[^A-Z]/g, ''); }

function countInPuzzle(sol, letter) {
    let n = 0;
    for (const ch of sol) if (ch.toUpperCase() === letter) n++;
    return n;
}
function revealLetter(letter) {
    const puzzle = state.puzzle.s;
    for (let i = 0; i < puzzle.length; i++) {
        if (puzzle[i].toUpperCase() === letter) state.revealed.add(i);
    }
    state.lastPick = letter;
}
function isSolved() {
    const cells = boardCells(state.puzzle);
    // check all letters revealed
    let idx = 0;
    for (const word of state.puzzle.s.replace(/'/g, '').split(' ')) {
        for (const ch of word) {
            if (ch !== ch.toUpperCase() || ch === ' ') { idx++; continue; }
            if (!state.revealed.has(idx)) return false;
            idx++;
        }
    }
    return true;
}

function roundWon(pi, how) {
    const p = state.players[pi];
    state.wonThisRound = true;
    p.score += p.roundScore;
    sfx.solve();
    sfx.playClip('applause1');
    Vanna.play('sentence'); // congratulations call
    setMessage(`${p.name} SOLVED IT!`, `+$${p.roundScore.toLocaleString()}`);
    setTimeout(() => endRound(pi), 2600);
}

/* End round & next round ------------------------------------------- */
function endRound(winnerIdx) {
    // bank scores
    for (let i = 0; i < state.players.length; i++) {
        if (i !== winnerIdx) state.players[i].score += state.players[i].roundScore;
        state.players[i].roundScore = 0;
    }
    if (state.round >= state.roundCount) {
        startBonusRound();
    } else {
        startRound();
    }
}

function beginTurn() {
    state.spinValue = 0; state.spinType = 'money';
    state.solveMode = false; state.buyVowelMode = false; state.pickingLetter = false;
    state.mustSpin = true;
    const p = currentPlayer();
    if (p.isHuman) {
        setMessage('YOUR TURN', p.name + ' \u2014 spin, buy vowel, or solve');
    } else {
        setMessage(p.name + "'s TURN", '');
        aiAutoPlay();
    }
}

function nextTurn(lostTurn, reason) {
    if (state.wonThisRound) return;
    state.spinValue = 0; state.spinType = 'money';
    state.solveMode = false; state.buyVowelMode = false; state.pickingLetter = false;
    state.mustSpin = true;
    const next = (state.currentPlayer + 1) % 3;
    if (!lostTurn && reason === 'keep') {
        // Player kept the turn (correct consonant/vowel); they may spin again.
        currentWheel = shuffledWheel();
        if (!state.players[state.currentPlayer].isHuman) aiAutoPlay();
        return;
    }
    state.currentPlayer = next;
    beginTurn();
}

/* ------------------------------------------------------------------ *
 *  Bonus round
 * ------------------------------------------------------------------ */
function startBonusRound() {
    let winner = null, best = -1;
    for (let i = 0; i < state.players.length; i++) {
        if (state.players[i].score > best) { best = state.players[i].score; winner = i; }
    }
    state.currentPlayer = winner;
    const p = state.players[winner];
    state.puzzle = pickPuzzle(BONUS_BANK, state.usedPuzzles) || { s: 'GRAND PRIZE', c: 'Thing' };
    state.revealed = new Set();
    state.usedLetters = new Set();
    stateGuess = '';
    // Original rules: R, S, T, L, N, E are given up front.
    ['R', 'S', 'T', 'L', 'N', 'E'].forEach(L => { state.usedLetters.add(L); revealLetter(L); });
    p.score += p.roundScore; p.roundScore = 0;
    setMessage('BONUS ROUND', `${p.name}, pick 3 consonants and 1 vowel`);
    state.bonusPick = { consonants: [], vowel: null };
    state.bonusGranted = 0;
    state.bonusTimer = 15; // seconds
    state.bonusTimerActive = false;
    // Original bonus-round intro cutscene, then the round itself
    state.screen = 'CUTSCENE';
    const names = ['bonus1', 'bonus2', 'bonus3', 'bonus4', 'bonus5', 'bonus6'];
    VideoPlayer.play(names[randInt(6)], () => {
        state.screen = 'PLAY';
        state.inBonus = true; state.bonusActive = true;
        Vanna.play('phrase'); // "Bonus round!" style announcement
        setTimeout(() => Vanna.play('letter'), 1100);
        if (p.isHuman) {
            setTimeout(() => { if (state.inBonus && state.bonusGranted < 4) autoBonusLetters(); }, 5000);
        } else {
            // AI winner: everything automatic
            autoBonusLetters();
            setTimeout(() => {
                if (state.inBonus) {
                    const solved = boardLength(state.puzzle) > 0 &&
                        (state.revealed.size / boardLength(state.puzzle) > 0.45 || Math.random() < 0.55);
                    endBonusRound(solved);
                }
            }, 4500 + randInt(4000));
        }
    });
}

function autoBonusLetters() {
    const puzzleLetters = new Set();
    for (const ch of state.puzzle.s.replace(/[^A-Z]/g, '')) puzzleLetters.add(ch);
    let cons = CONSONANTS.filter(l => puzzleLetters.has(l) && !state.usedLetters.has(l));
    const picks = [];
    while (picks.length < 3 && cons.length) {
        picks.push(cons.splice(randInt(cons.length), 1)[0]);
    }
    const vowels = VOWELS.filter(l => puzzleLetters.has(l) && !state.usedLetters.has(l));
    const vowel = vowels.length ? vowels[randInt(vowels.length)] : 'E';
    picks.push(vowel);
    if (picks.length < 3) {
        // fill from remaining letters
        const all = ALPHABET.filter(l => !state.usedLetters.has(l));
        while (picks.length < 3 && all.length) picks.push(all.splice(randInt(all.length), 1)[0]);
    }
    grantBonusLetters(picks.slice(0, 3), picks[3] || 'E');
}

function pickBonusLetter(letter) {
    if (!state.inBonus || state.bonusGranted >= 4) return;
    if (VOWELS.includes(letter)) {
        if (state.bonusPick.vowel) return;
        state.bonusPick.vowel = letter;
    } else {
        if (state.bonusPick.consonants.length >= 3) return;
        if (state.bonusPick.consonants.includes(letter)) return;
        state.bonusPick.consonants.push(letter);
    }
    if (state.bonusPick.consonants.length + (state.bonusPick.vowel ? 1 : 0) >= 4) {
        grantBonusLetters(state.bonusPick.consonants.slice(0, 3), state.bonusPick.vowel);
    }
}

function grantBonusLetters(cons, vowel) {
    for (let i = 0; i < cons.length; i++) {
        if (!cons[i]) continue;
        state.usedLetters.add(cons[i]);
        const c = countInPuzzle(state.puzzle.s, cons[i]);
        setMessage(`Letters: ${cons.join(' ')} ${vowel}`, 'solving time!');
        setTimeout(() => revealLetter(cons[i]), 300 * i + 300);
    }
    if (vowel) { state.usedLetters.add(vowel); setTimeout(() => revealLetter(vowel), 300 * cons.length + 300); }
    state.bonusGranted = 4;
    setTimeout(() => { if (state.inBonus) startBonusClock(); }, 300 * cons.length + 900);
}

function startBonusClock() {
    if (state.bonusTimerActive) return; // never run two tick loops
    state.bonusTimer = 15;
    state.bonusTimerActive = true;
    tickBonusClock();
}
function tickBonusClock() {
    if (!state.bonusTimerActive) return;
    sfx.clockTick();
    state.bonusTimer--;
    if (state.bonusTimer <= 0) { endBonusRound(false); return; }
    setTimeout(tickBonusClock, 1000);
}
function endBonusRound(won) {
    state.bonusTimerActive = false;
    state.bonusResult = won;
    state.inBonus = false; state.bonusActive = false;
    if (won) {
        state.players[state.currentPlayer].score += 25000;
        sfx.win();
        Vanna.play('sentence'); // congratulations
        setTimeout(() => Vanna.play('long'), 2500); // outro/closing music
    } else {
        sfx.loss();
        Vanna.play('phrase');
    }
    setMessage(won ? 'BONUS ROUND WON!' : 'BONUS ROUND LOST', won ? '+$25,000' : state.puzzle.s);
    if (won) {
        // Original winner cutscene, then the final scores.
        state.screen = 'CUTSCENE';
        VideoPlayer.play('winner', () => { state.screen = 'GAMEOVER'; });
    } else {
        state.screen = 'GAMEOVER';
    }
}

/* ------------------------------------------------------------------ *
 *  Sequence player (marker-12 animations from the CD).
 *  Plays back the original frame layers at absolute 800x600 coords,
 *  scaled to dest rects, with WAV cues. Loops iff blob mode == 2.
 *  Playback rate is engine-side in the original; SEQ_FPS is our default.
 * ------------------------------------------------------------------ */
const SEQ_FPS = 12;
class SeqPlayer {
    constructor(seqId) {
        this.seqId = seqId;
        this.m = null;
        this.ready = false;
        this.done = false;
        this.slotIdx = 0;
        this.t = 0;
        this.byId = {};
        this.slotIds = [];
    }
    async init() {
        await SEQ.load();
        this.m = SEQ.get(this.seqId);
        if (!this.m || !this.m.frames.length) { this.done = true; return this; }
        const jobs = [];
        for (const f of this.m.frames) jobs.push(SEQ.loadFrame(this.m.file, f.sprite));
        await Promise.all(jobs);
        for (const f of this.m.frames) {
            (this.byId[f.frame] = this.byId[f.frame] || []).push(f);
        }
        this.slotIds = Object.keys(this.byId).map(Number).sort((a, b) => a - b);
        this.ready = true;
        this.fireCues(this.slotIds[0]);
        return this;
    }
    fireCues(slotId) {
        if (!this.m) return;
        for (const c of this.m.cues) {
            if (c.frame !== slotId) continue;
            const url = SEQ.cueURL(this.m.file, c.snd);
            try {
                const a = new Audio(url);
                if (!GameAudio.muted) a.play().catch(() => {});
            } catch (e) {}
        }
    }
    update(dt) {
        if (!this.ready || this.done) return;
        this.t += dt;
        const step = 1 / SEQ_FPS;
        let adv = Math.floor(this.t / step);
        this.t -= adv * step;
        if (adv > 4) { this.t = 0; adv = 4; } // clamp tab-switch jumps
        for (let k = 0; k < adv; k++) this.advance();
    }
    advance() {
        if (this.slotIdx >= this.slotIds.length - 1) {
            if (this.m.mode === 2) this.slotIdx = 0;
            else { this.done = true; return; }
        } else {
            this.slotIdx++;
        }
        this.fireCues(this.slotIds[this.slotIdx]);
    }
    draw(c) {
        if (!this.ready || this.done) return;
        const recs = this.byId[this.slotIds[this.slotIdx]];
        for (const f of recs) {
            const url = SEQ.frameURL(this.m.file, f.sprite);
            const img = url && SEQ.frameCache[url];
            if (!img) continue;
            const r = f.rect;
            const dw = r[2] - r[0], dh = r[3] - r[1];
            if (dw > 0 && dh > 0) {
                try { c.drawImage(img, r[0], r[1], dw, dh); } catch (e) {}
            }
        }
    }
}

/* Map-menu ambient loops (room idle animations over the neutral map). */
const MAP_PIK_SEQS = ['m0119', 'm0124', 'm0111', 'm0139', 'm0118', 'm0145'];
let mapAnims = null;
function ensureMapAnims() {
    if (mapAnims) return;
    mapAnims = MAP_PIK_SEQS.map((id) => { const p = new SeqPlayer(id); p.init(); return p; });
}

/* ------------------------------------------------------------------ *
 *  Rendering
 * ------------------------------------------------------------------ */
let raf;

function clearScreen() {
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, W, H);
}
function drawBackground() {
    const img = bgImage('board' + (((state.round - 1) % 25) + 1));
    if (img) {
        ctx.drawImage(img, 0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, W, H);
    } else {
        drawProceduralBg();
    }
}
function drawProceduralBg() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0a24');
    g.addColorStop(0.5, '#141438');
    g.addColorStop(1, '#070718');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // stars
    for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * W, Math.random() * H * 0.6, 2, 2);
    }
}
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* -- Wheel drawing ---------- */
function drawWheel(cx, cy, R) {
    const n = currentWheel.length;
    const seg = (2 * Math.PI) / n;
    let a = -Math.PI / 2 + Math.PI; // pointer at top
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.wheelAngle);

    for (let i = 0; i < n; i++) {
        const s = currentWheel[i];
        const start = i * seg;
        const end = start + seg;
        let color;
        if (s.type === 'bankrupt') color = '#a02020';
        else if (s.type === 'loseturn') color = '#202020';
        else if (s.value >= 2500) color = '#f5c530';
        else {
            const gold = s.value >= 600;
            color = gold ? '#2a6fd8' : '#2f8fc8';
        }
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, start, end);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#0a0a14';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.save();
        ctx.rotate(start + seg / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Verdana, sans-serif';
        if (s.type) {
            ctx.save();
            ctx.rotate(-(start + seg / 2));
            ctx.rotate(-Math.PI / 2);
            ctx.translate(0, -R + 22);
            ctx.fillText(s.label, 0, 0);
            ctx.restore();
            ctx.restore();
        } else {
            ctx.font = 'bold 15px Verdana, sans-serif';
            ctx.fillText(s.label.replace('$', ''), 0, -R + 16);
            ctx.restore();
        }
    }
    // hub
    const hub = spriteImage('wheelCenter');
    if (hub) {
        ctx.drawImage(hub, -R * 0.32, -R * 0.32, R * 0.64, R * 0.64);
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = '#c0a040';
        ctx.fill();
        ctx.strokeStyle = '#7a6210';
        ctx.lineWidth = 4;
        ctx.stroke();
    }
    ctx.restore();

    // Pointer
    ctx.save();
    ctx.translate(cx, cy - R - 18);
    ctx.fillStyle = '#f0e0c0';
    roundRect(-12, -6, 24, 30, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, -6); ctx.lineTo(0, -24); ctx.lineTo(12, -6);
    ctx.closePath();
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.strokeStyle = '#7a5a00';
    ctx.stroke();
    ctx.restore();
}

/* -- Puzzle board ---------- */
function drawPuzzleBoard() {
    if (!state.puzzle) return;
    const puzzle = state.puzzle.s;
    const cells = boardCells(state.puzzle);
    let totalLetters = 0;
    cells.forEach(w => totalLetters += w.length);
    const maxPerRow = BOARD_COLS;
    const rows = Math.ceil(totalLetters / maxPerRow);
    const colsUse = Math.min(maxPerRow, Math.max.apply(null, [
        ...cells.map(w => w.length), Math.ceil(totalLetters / rows)
    ]));
    const cols = Math.max(colsUse, ...cells.map(w => w.length ? Math.min(w.length, maxPerRow) : 0));

    const box = 46;
    const gap = 3;
    const boardW = cols * (box + gap) - gap;
    const boardH = rows * (box + gap) - gap;
    const bx = (W - boardW) / 2;
    const by = 70 + (160 - boardH) / 2;

    // header - category
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 20px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillText(categoryName(state.puzzle.c), W / 2, 46);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '18px Verdana, sans-serif';
    ctx.fillText(`ROUND ${state.round}`, 60, 40);

    // tiles
    let idx = 0;
    let wordIdx = 0;
    ctx.save();
    ctx.font = 'bold 26px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    cells.forEach(word => {
        let x = bx;
        // center each word? center whole line; simplest: center block per word
        const wordW = word.length * (box + gap) - gap;
        let wx = bx + (boardW - wordW) / 2;
        word.forEach(ch => {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            const cx = wx + col * (box + gap);
            const cy = by + row * (box + gap);
            const empty = state.revealed.has(idx);
            // tile
            ctx.fillStyle = empty ? '#ffd700' : '#1a3a5a';
            roundRect(cx, cy, box, box, 6);
            ctx.fill();
            ctx.strokeStyle = '#7fd8ff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            if (empty) {
                ctx.fillStyle = '#1a2a5a';
                ctx.fillText(ch, cx + box / 2, cy + box / 2 + 2);
            }
            idx++;
        });
        wordIdx++;
    });
    ctx.restore();
}

function categoryName(cat) { return CATEGORY_LOOKUP[cat] || cat || 'Phrase'; }

/* -- Player panels ---------- */
function drawPlayers() {
    const y0 = 340;
    const pw = 240, ph = 90;
    const spacing = 18;
    const totalW = 3 * pw + 2 * spacing;
    let x = (W - totalW) / 2;
    for (let i = 0; i < state.players.length; i++) {
        const p = state.players[i];
        const active = state.currentPlayer === i && !state.inBonus;
        ctx.fillStyle = active ? 'rgba(0,120,255,0.30)' : 'rgba(0,0,0,0.35)';
        roundRect(x, y0, pw, ph, 10);
        ctx.fill();
        ctx.strokeStyle = active ? '#ffd700' : '#335577';
        ctx.lineWidth = active ? 3 : 1;
        ctx.stroke();

        ctx.fillStyle = active ? '#ffe066' : '#aabbcc';
        ctx.font = 'bold 16px Verdana, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(p.name, x + 12, y0 + 24);
        if (state.freeSpins[i] > 0) {
            ctx.fillStyle = '#7dff8f';
            ctx.font = '12px Verdana, sans-serif';
            ctx.fillText('FREE SPIN x' + state.freeSpins[i], x + pw - 90, y0 + 22);
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Verdana, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('$' + p.roundScore.toLocaleString(), x + pw - 12, y0 + 56);
        ctx.font = '13px Verdana, sans-serif';
        ctx.fillStyle = '#88aacc';
        ctx.textAlign = 'right';
        ctx.fillText('$' + p.score.toLocaleString(), x + pw - 12, y0 + 80);
        ctx.textAlign = 'left';
        if (!p.isHuman) {
            ctx.fillStyle = '#556688';
            ctx.font = '10px Verdana, sans-serif';
            ctx.fillText('CPU', x + 12, y0 + ph - 6);
        }
        x += pw + spacing;
    }
}

/* -- Letter / action buttons ---------- */
function drawControls() {
    const y = 500;
    const labels = ['SPIN', 'BUY VOWEL', 'SOLVE'];
    const w = 150, h = 44, gap = 20;
    const totalW = 3 * w + 2 * gap;
    let x = (W - totalW) / 2;
    ctx.font = 'bold 18px Verdana, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
        if (state.solveMode || state.buyVowelMode || state.pickingLetter) {
            drawButton(x, y, w, h, labels[i], 'disabled');
        } else if (i === 0 && state.spinning) {
            drawButton(x, y, w, h, 'SPINNING...', 'disabled');
        } else {
            drawButton(x, y, w, h, labels[i], 'normal');
        }
        x += w + gap;
    }
}
function drawButton(x, y, w, h, label, kind) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (kind === 'disabled') {
        g.addColorStop(0, '#2a2a3a'); g.addColorStop(1, '#1a1a2a');
        ctx.fillStyle = g;
        roundRect(x, y, w, h, 8); ctx.fill();
        ctx.strokeStyle = '#3a3a4a'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#666688'; ctx.font = 'bold 18px Verdana, sans-serif';
        ctx.fillText(label, x + w / 2, y + h / 2 + 6);
        return;
    }
    g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#f5a623');
    ctx.fillStyle = g;
    roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3a2a00';
    ctx.fillText(label, x + w / 2, y + h / 2 + 6);
}

/* -- Letter picker grid (consonant / vowel) ---------- */
function letterGridGeom() {
    const tile = 40, gap = 6, cols = 9;
    const gw = cols * tile + (cols - 1) * gap;
    const gh = 3 * tile + 2 * gap;
    return { tile, gap, cols, x0: (W - gw) / 2, y0: 190 };
}
function drawLetterGrid() {
    const vowelMode = !!state.buyVowelMode;
    const g = letterGridGeom();
    ctx.fillStyle = 'rgba(0,0,12,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(vowelMode ? `BUY A VOWEL \u2014 $${VOWEL_COST}` : `PICK A CONSONANT \u2014 $${state.spinValue}`, W / 2, 150);
    ctx.font = 'bold 20px Verdana, sans-serif';
    for (let i = 0; i < ALPHABET.length; i++) {
        const letter = ALPHABET[i];
        const r = Math.floor(i / g.cols), c = i % g.cols;
        const x = g.x0 + c * (g.tile + g.gap);
        const y = g.y0 + r * (g.tile + g.gap);
        const isVowel = VOWELS.includes(letter);
        const usable = !state.usedLetters.has(letter) && (vowelMode ? isVowel : !isVowel);
        ctx.fillStyle = !usable ? '#1c2430' : (isVowel ? '#7a4fbf' : '#2a5fae');
        roundRect(x, y, g.tile, g.tile, 6);
        ctx.fill();
        ctx.strokeStyle = !usable ? '#33404f' : '#9ad0ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = !usable ? '#4a5a6e' : '#ffffff';
        ctx.fillText(letter, x + g.tile / 2, y + g.tile / 2 + 7);
    }
    ctx.fillStyle = '#8fa8c8';
    ctx.font = '13px Verdana, sans-serif';
    ctx.fillText('click a letter, type it, or click elsewhere to cancel', W / 2, g.y0 + 3 * (g.tile + g.gap) + 26);
}
function hitLetterGrid(px, py) {
    const g = letterGridGeom();
    for (let i = 0; i < ALPHABET.length; i++) {
        const r = Math.floor(i / g.cols), c = i % g.cols;
        const x = g.x0 + c * (g.tile + g.gap);
        const y = g.y0 + r * (g.tile + g.gap);
        if (px >= x && px <= x + g.tile && py >= y && py <= y + g.tile) return ALPHABET[i];
    }
    return null;
}

/* -- Used letters + spin value ---------- */
function drawStatus() {
    // spin result
    if (state.wheelResult && state.wheelResultTimer > 0) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state.spinValue > 0 ? '$' + state.spinValue : state.spinType, W / 2, 330);
    } else if (state.spinValue > 0) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText('$' + state.spinValue, W / 2, 326);
        ctx.shadowBlur = 0;
    }

    // message
    if (state.message) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
        ctx.fillText(state.message, W / 2, 560);
        if (state.message2) {
            ctx.font = '14px Verdana, sans-serif';
            ctx.fillStyle = '#aaccff';
            ctx.fillText(state.message2, W / 2, 580);
        }
        ctx.shadowBlur = 0;
    }

    // used letters
    const used = [...state.usedLetters].sort().join(' ');
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px Courier, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(used, W / 2, 476);
}

/* -- Solving input overlay ---------- */
function drawSolveBox() {
    if (!state.solveMode) return;
    ctx.fillStyle = 'rgba(0,0,10,0.8)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SOLVE THE PUZZLE', W / 2, 200);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Verdana, sans-serif';
    ctx.fillText('Type your answer, then press ENTER', W / 2, 240);
    if (stateGuess) {
        ctx.fillStyle = '#aaffaa';
        ctx.font = 'bold 22px Courier, monospace';
        ctx.fillText(stateGuess, W / 2, 300);
    } else {
        ctx.fillStyle = '#556677';
        ctx.font = '18px Courier, monospace';
        ctx.fillText('_', W / 2, 300);
    }
    ctx.fillStyle = '#8888aa';
    ctx.font = '12px Verdana, sans-serif';
    ctx.fillText('ESC to cancel', W / 2, 340);
}

/* -- Bonus overlay ---------- */
function drawBonusOverlay() {
    if (!state.inBonus) return;
    if (state.bonusTimerActive) {
        ctx.fillStyle = 'rgba(5,0,20,0.35)';
        ctx.fillRect(0, 0, W, H);
    } else {
        ctx.fillStyle = 'rgba(5,0,20,0.55)';
        ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BONUS ROUND', W / 2, 90);
    ctx.font = '16px Verdana, sans-serif';
    ctx.fillStyle = '#aaccff';
    if (state.bonusTimerActive === false && state.bonusGranted < 4) {
        ctx.fillText('Pick 3 consonants + 1 vowel to reveal (click, or type)', W / 2, 130);
        drawBonusLetterGrid();
    } else if (state.bonusTimerActive) {
        ctx.fillText('Solve before the clock runs out!', W / 2, 130);
    } else {
        ctx.fillText('Letters revealed \u2014 solve now', W / 2, 130);
    }
    if (state.bonusTimerActive) {
        ctx.fillStyle = state.bonusTimer <= 3 ? '#ff6666' : '#ffffff';
        ctx.font = 'bold 40px Verdana, sans-serif';
        ctx.fillText(state.bonusTimer, W / 2, 40);
    }
    // Show chosen picks status
    const picks = (state.bonusPick ? state.bonusPick.consonants : []).slice();
    if (state.bonusPick && state.bonusPick.vowel) picks.push(state.bonusPick.vowel);
    if (state.bonusTimerActive && stateGuess) {
        ctx.fillStyle = '#aaffaa';
        ctx.font = 'bold 22px Courier, monospace';
        ctx.fillText('GUESS: ' + stateGuess, W / 2, 440);
    }
    if (picks.length) {
        ctx.fillStyle = '#7dff8f';
        ctx.font = 'bold 20px Verdana, sans-serif';
        ctx.fillText('Chosen: ' + picks.join(' '), W / 2, 470);
    }
}

function drawBonusLetterGrid() {
    const tile = 34, gap = 4, cols = 10;
    let startX = (W - (cols * tile + (cols-1) * gap)) / 2;
    const y = 200;
    ctx.font = 'bold 18px Verdana, sans-serif';
    ctx.textAlign = 'center';
    let idx = 0;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < cols; c++) {
            if (idx >= ALPHABET.length) break;
            const letter = ALPHABET[idx];
            const x = startX + c * (tile + gap);
            const used = state.usedLetters.has(letter);
            const isVowel = VOWELS.includes(letter);
            const conCount = state.bonusPick ? state.bonusPick.consonants.length : 0;
            const disabled = used || (isVowel && state.bonusPick && state.bonusPick.vowel) ||
                             (!isVowel && conCount >= 3);
            ctx.fillStyle = disabled ? '#223344' : (isVowel ? '#7a4fbf' : '#2a5fae');
            roundRect(x, y, tile, tile, 5);
            ctx.fill();
            ctx.strokeStyle = disabled ? '#334455' : '#9ad0ff';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = used ? '#556677' : '#ffffff';
            ctx.fillText(letter, x + tile / 2, y + tile / 2 + 6);
            idx++;
        }
    }
    const total = (state.bonusPick ? state.bonusPick.consonants.length : 0) + (state.bonusPick && state.bonusPick.vowel ? 1 : 0);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 16px Verdana, sans-serif';
    ctx.fillText(total + '/4 selected', W / 2, y + 3 * (tile + gap) + 12);
}

/* -- Game over ---------- */
function drawGameOver() {
    clearScreen();
    drawProceduralBg();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, 140);
    let y = 210;
    const sorted = state.players.slice().sort((a, b) => b.score - a.score);
    sorted.forEach(p => {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Verdana, sans-serif';
        ctx.fillText(`${p.name}: $${p.score.toLocaleString()}`, W / 2, y);
        y += 40;
    });
    if (state.bonusResult !== null) {
        ctx.fillStyle = state.bonusResult ? '#7dff8f' : '#ff8888';
        ctx.font = 'bold 20px Verdana, sans-serif';
        ctx.fillText(state.bonusResult ? 'BONUS ROUND WON! +$25,000' : 'Bonus round puzzle: ' + state.puzzle.s, W / 2, y + 20);
    }
    drawButton(W / 2 - 90, H - 120, 180, 48, 'PLAY AGAIN', 'normal');
}

/* ------------------------------------------------------------------ *
 *  Main render loop
 * ------------------------------------------------------------------ */
function render() {
    clearScreen();
    if (state.wheelResultTimer > 0) state.wheelResultTimer--;
    if (state.screen === 'CUTSCENE') {
        drawCutscene();
    } else if (state.screen === 'PLAY') {
        drawBackground();
        drawPuzzleBoard();
        if (!state.inBonus) drawWheel(618, 400, 150);
        drawPlayers();
        drawControls();
        drawStatus();
        if ((state.pickingLetter || state.buyVowelMode) && !state.inBonus) drawLetterGrid();
        if (state.solveMode) drawSolveBox();
        if (state.inBonus) {
            // puzzle visible without wheel overlay
            drawBonusOverlay();
        }
    } else if (state.screen === 'GAMEOVER') {
        drawGameOver();
    } else if (state.screen === 'MENU') {
        drawMenu();
    } else if (state.screen === 'OPTIONS') {
        drawOptions();
    }
    drawMuteButton();
}

function drawMuteButton() {
    const x = W - 130, y = 12, w = 120, h = 34;
    ctx.textAlign = 'center';
    ctx.fillStyle = GameAudio.muted ? 'rgba(200,60,60,0.85)' : 'rgba(0,200,180,0.75)';
    roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 8); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Verdana, sans-serif';
    ctx.fillText(GameAudio.muted ? 'SOUND: OFF' : 'SOUND: ON', x + w / 2, y + 22);
}

/* -- Menu (backstage map: original BMPs + hotspot overlays) ----------
 * Reverse-engineered from the exe (hotspot registration 0x40ede0,
 * callbacks 0x417510+, room entry 0x417550, BMP swap 0x417720):
 * hover plays the mmrolXXX overlay seq (no BMP swap); click enters the
 * room (BMP swap + room idle seq). Room BMPs: exa->0002 exam screen,
 * green->0003, control->0000, prod->0005, dress->0001, stage->0006. */
function drawMenu() {
    ensureMapAnims();
    ensureRolAnims();
    const room = state.room;
    const img = bgImage(room ? ROOM_BG[room] : 'menu5');
    if (img) ctx.drawImage(img, 0, 0, W, H);
    else drawProceduralBg();
    if (!room && mapAnims) for (const p of mapAnims) { p.update(frameDt); p.draw(ctx); }
    if (room && state.roomPlayer) { state.roomPlayer.update(frameDt); state.roomPlayer.draw(ctx); }
    const hov = state.menuHover;
    if (hov && hov !== 'back' && hov !== 'back2' && rolAnims && rolAnims[hov]) {
        rolAnims[hov].update(frameDt);
        rolAnims[hov].draw(ctx);
    }
}

/* Hotspot rects verbatim from the exe (0x40ede0 registrations). */
const MENU_HOTSPOTS = {
    exa:     { x: 30, y: 90,  w: 107, h: 32, room: 'exa' },
    green:   { x: 26, y: 147, w: 147, h: 24, room: 'green' },
    control: { x: 24, y: 179, w: 181, h: 24, room: 'control' },
    prod:    { x: 24, y: 214, w: 246, h: 23, room: 'prod' },
    dress:   { x: 22, y: 247, w: 200, h: 23, room: 'dress' },
    stage:   { x: 23, y: 282, w: 76,  h: 29, room: 'stage' },
    back:    { x: 42, y: 520, w: 87,  h: 92, room: null },
    back2:   { x: 673, y: 15, w: 87, h: 52, room: null },
};
const ROOM_BG = { exa: 'menu3', green: 'menu4', control: 'menu1', prod: 'menu6', dress: 'menu2', stage: 'menu7' };
const ROOM_IDLE = { exa: 'm0119', green: 'm0124', control: 'm0111', prod: 'm0139', dress: 'm0118', stage: 'm0145' };
const ROL_SEQS = { exa: 'm0166', green: 'm0171', control: 'm0160', prod: 'm0186', dress: 'm0165', stage: 'm0192' };
let rolAnims = null;
function ensureRolAnims() {
    if (rolAnims) return;
    rolAnims = {};
    for (const k of Object.keys(ROL_SEQS)) {
        const p = new SeqPlayer(ROL_SEQS[k]);
        p.init();
        rolAnims[k] = p;
    }
}
function setRoom(r) {
    state.room = r;
    state.menuHover = null;
    state.roomPlayer = null;
    if (r && ROOM_IDLE[r]) {
        const p = new SeqPlayer(ROOM_IDLE[r]);
        p.init();
        state.roomPlayer = p;
    }
}
function hoverAt(px, py) {
    for (const k of Object.keys(MENU_HOTSPOTS)) {
        const r = MENU_HOTSPOTS[k];
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return k;
    }
    return null;
}
function menuActivate(key) {
    if (key === 'back' || key === 'back2') { sfx.click(); setRoom(null); return; }
    const room = (MENU_HOTSPOTS[key] || {}).room;
    if (!room) return;
    if (room === 'control') { sfx.click(); state.screen = 'OPTIONS'; return; }
    // Clicking the Stage label while on the Stage screen starts the game
    // (exact start hotspot on the stage screen pending further RE).
    if (room === 'stage' && state.room === 'stage') { startGameFromConfig(); return; }
    sfx.click();
    setRoom(room);
}

function startGameFromConfig() {
    sfx.click();
    sfx.playClip('chime2');
    startGame({ humans: state.config.humans, length: state.config.length, playerNames: ['YOU', 'PLAYER 2', 'PLAYER 3'] });
}

function drawOptions() {
    const img = bgImage('menu2');
    if (img) {
        ctx.drawImage(img, 0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,10,0.55)';
        ctx.fillRect(0, 0, W, H);
    } else {
        drawBackground();
    }
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
    ctx.fillText('OPTIONS', W / 2, 140);
    ctx.shadowBlur = 0;
    drawButton(W / 2 - 170, 200, 340, 50, 'HUMAN PLAYERS: ' + state.config.humans + ' OF 3', 'normal');
    drawButton(W / 2 - 170, 264, 340, 50, 'ROUNDS: ' + state.config.length.toUpperCase(), 'normal');
    drawButton(W / 2 - 170, 328, 340, 50, 'SOUND: ' + (GameAudio.muted ? 'OFF' : 'ON'), 'normal');
    drawButton(W / 2 - 170, 404, 340, 50, 'START GAME', 'normal');
    drawButton(W / 2 - 170, 468, 340, 50, 'BACK', 'normal');
}

function hitOptions(px, py) {
    const cx = W / 2;
    const inRow = (y0) => (px > cx - 170 && px < cx + 170 && py > y0 && py < y0 + 50);
    if (inRow(200)) { state.config.humans = state.config.humans % 3 + 1; sfx.click(); }
    else if (inRow(264)) {
        const order = ['short', 'standard', 'long'];
        state.config.length = order[(order.indexOf(state.config.length) + 1) % order.length];
        sfx.click();
    }
    else if (inRow(328)) { toggleMute(); }
    else if (inRow(404)) { startGameFromConfig(); }
    else if (inRow(468)) { sfx.click(); showMenu(); }
}

let frameDt = 0.016;
let lastFrameT = 0;
function mainLoop(now) {
    if (now === undefined) now = (typeof performance !== 'undefined' && performance.now()) || 0;
    frameDt = lastFrameT ? Math.min(0.1, Math.max(0, (now - lastFrameT) / 1000)) : 0.016;
    lastFrameT = now;
    render();
    raf = requestAnimationFrame(mainLoop);
}

/* ------------------------------------------------------------------ *
 *  Input handling
 * ------------------------------------------------------------------ */
let stateGuess = '';

function resolveHit(px, py) {
    // Mute toggle (top-right), always available
    if (px > W - 130 && px < W - 10 && py > 12 && py < 46) {
        toggleMute();
        return;
    }
    // Skip cutscenes on click
    if (state.screen === 'CUTSCENE') {
        VideoPlayer.skip();
        return;
    }
    // Solve box cancel etc.
    if (state.solveMode) { state.solveMode = false; stateGuess = ''; return; }
    // Letter picker: a tile click resolves the pick, anywhere else cancels.
    if (state.pickingLetter || state.buyVowelMode) {
        const L = hitLetterGrid(px, py);
        if (L && !state.usedLetters.has(L)) {
            sfx.click();
            if (state.buyVowelMode) resolveVowel(state.currentPlayer, L);
            else resolveLetter(state.currentPlayer, L);
        } else {
            state.pickingLetter = false; state.buyVowelMode = false;
        }
        return;
    }
    // Bonus letter picker
    if (state.inBonus && state.bonusTimerActive === false && state.bonusGranted < 4) {
        const hit = hitBonusLetter(px, py);
        if (hit) { sfx.click(); pickBonusLetter(hit); return; }
    }
    if (state.screen === 'GAMEOVER') {
        if (px > W/2 - 90 && px < W/2 + 90 && py > H - 120 && py < H - 72) {
            showMenu();
        }
        return;
    }
    if (state.screen === 'MENU') {
        const hov = state.menuHover || hoverAt(px, py);
        if (!hov) return;
        menuActivate(hov);
        return;
    }
    if (state.screen === 'OPTIONS') {
        hitOptions(px, py);
        return;
    }
    // action buttons
    const y = 500, w = 150, h = 44, gap = 20;
    const totalW = 3 * w + 2 * gap;
    let x = (W - totalW) / 2;
    for (let i = 0; i < 3; i++) {
        if (px > x && px < x + w && py > y && py < y + h) {
            sfx.click();
            doPlayerAction(state.currentPlayer, ['spin', 'vowel', 'solve'][i]);
            return;
        }
        x += w + gap;
    }
}

function hitBonusLetter(px, py) {
    const tile = 34, gap = 4, cols = 10;
    let startX = (W - (cols * tile + (cols-1) * gap)) / 2;
    const y = 200;
    let idx = 0;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < cols; c++) {
            if (idx >= ALPHABET.length) break;
            const x = startX + c * (tile + gap);
            if (px > x && px < x + tile && py > y && py < y + tile) return ALPHABET[idx];
            idx++;
        }
    }
    return null;
}

canvas.addEventListener('click', (e) => {
    sfx.ensure();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    resolveHit(px, py);
});

function handleKey(e) {
    sfx.ensure();
    const key = e.key.toUpperCase();
    if (key === 'M') { toggleMute(); return; }
    const p = state.players[state.currentPlayer];
    if (state.solveMode) {
        if (key === 'ESCAPE') { state.solveMode = false; return; }
        if (key === 'ENTER') {
            finishSolve();
            return;
        }
        if (/^[A-Z ',-.?]$/.test(key)) stateGuess += key;
        else if (key === 'BACKSPACE') stateGuess = stateGuess.slice(0, -1);
        return;
    }
    // During the bonus round timer, the player can type the answer
    if (state.inBonus && state.bonusTimerActive) {
        if (key === 'ENTER' && stateGuess.length) { finishBonusSolve(); stateGuess = ''; return; }
        if (/^[A-Z ',-.?]$/.test(key)) stateGuess += key;
        else if (key === 'BACKSPACE') stateGuess = stateGuess.slice(0, -1);
        return;
    }
    if (state.inBonus && state.bonusTimerActive === false && state.bonusGranted < 4) {
        if (/^[A-Z]$/.test(key) && !state.usedLetters.has(key)) {
            sfx.click();
            pickBonusLetter(key);
        }
        return;
    }
    if (p && p.isHuman && state.screen === 'PLAY') {
        // quick actions
        if (key === ' ') { doPlayerAction(state.currentPlayer, 'spin'); }
        else if (VOWELS.includes(key) && state.buyVowelMode) resolveVowel(state.currentPlayer, key);
        else if (CONSONANTS.join('').includes(key) && state.pickingLetter) resolveLetter(state.currentPlayer, key);
        else if (key === 'E' && state.spinValue > 0) { doPlayerAction(state.currentPlayer, 'vowel'); }
    }
}

function finishBonusSolve() {
    const guess = stateGuess.trim();
    stateGuess = '';
    if (!guess) return;
    endBonusRound(checkSolution(guess));
}

function finishSolve() {
    const guess = stateGuess.trim();
    stateGuess = '';
    state.solveMode = false;
    if (!guess) return;
    const p = state.players[state.currentPlayer];
    if (checkSolution(guess)) {
        sfx.solve();
        setMessage(p.name + ' SOLVED IT!', '+$' + p.roundScore.toLocaleString());
        roundWon(state.currentPlayer, 'solve');
    } else {
        sfx.wrong();
        setMessage('INCORRECT', 'turn passes');
        setTimeout(() => nextTurn(true, 'wrong'), 1500);
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
    handleKey(e);
});

/* ------------------------------------------------------------------ *
 *  Videos & cutscenes
 * ------------------------------------------------------------------ */
function videoBump() {
    // A cutscene can be queued here; keep gameplay uninterrupted.
}

/* ------------------------------------------------------------------ *
 *  Video cutscene player (original AVI cutscenes, converted to MP4)
 * ------------------------------------------------------------------ */
const VideoPlayer = {
    el: null,
    running: false,
    onEnd: null,
    skipNext: false,
    play(name, onEnd, opts) {
        opts = opts || {};
        const el = AudioCache['vid:' + name];
        if (!el) { onEnd && onEnd(); return; }
        this.el = el;
        this.onEnd = onEnd;
        this.running = true;
        this.skipNext = false;
        state.cutscene = name;
        let started = false;
        const onStarted = () => { started = true; };
        el.addEventListener('playing', onStarted);
        const onDone = () => {
            if (!this.running) return;
            this.running = false;
            state.cutscene = null;
            el.removeEventListener('ended', onDone);
            el.removeEventListener('error', onDone);
            el.removeEventListener('playing', onStarted);
            clearTimeout(fallback);
            const cb = this.onEnd; this.onEnd = null;
            cb && cb();
        };
        // Watchdog: if the video never starts playing (load stall/autoplay block), advance.
        const fallback = setTimeout(() => {
            if (this.running && this.el === el && !started) onDone();
        }, 4000);
        el.addEventListener('ended', onDone);
        el.addEventListener('error', onDone);
        el.muted = !!opts.muted;
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => { setTimeout(onDone, 50); });
    },
    skip() {
        if (this.el) { try { this.el.pause(); this.el.currentTime = 0; } catch (e) {} }
        const cb = this.onEnd; this.onEnd = null;
        if (this.running) {
            this.running = false;
            state.cutscene = null;
            cb && cb();
        }
    },
    stop() {
        if (this.el) { try { this.el.pause(); this.el.currentTime = 0; } catch (e) {} }
        this.running = false;
        this.onEnd = null;
        state.cutscene = null;
    }
};

function drawCutscene() {
    const el = VideoPlayer.el;
    if (!el || !el.videoWidth) return;
    clearScreen();
    const vw = el.videoWidth || 640, vh = el.videoHeight || 480;
    const scale = Math.min(W / vw, H / vh);
    const dw = vw * scale, dh = vh * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;
    ctx.drawImage(el, dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '13px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('[click to skip]', W / 2, H - 18);
}

/* ------------------------------------------------------------------ *
 *  Menu / init
 * ------------------------------------------------------------------ */
function showMenu() {
    state.screen = 'MENU';
    setRoom(null);
    setMessage('', '');
}

canvas.addEventListener('mousemove', (e) => {
    if (state.screen !== 'MENU') { state.menuHover = null; return; }
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    state.menuHover = hoverAt(px, py);
});

function playIntroSequence() {
    state.screen = 'CUTSCENE';
    VideoPlayer.play('logo', () => {
        VideoPlayer.play('intro', () => {
            showMenu();
        }, { muted: false });
    });
}

async function boot() {
    document.getElementById('loadbar').style.width = '5%';
    try {
        await Promise.all([
            (async () => {
                const ok = await preloadAll((p) => { document.getElementById('loadbar').style.width = (5 + p * 80) + '%'; });
                return ok;
            })(),
            (async () => {
                document.getElementById('loadmsg').textContent = 'Loading puzzles...';
                await Promise.all([loadPuzzles(), Vanna.load()]);
                document.getElementById('loadbar').style.width = '90%';
            })()
        ]);
    } catch (e) {
        console.error(e);
    }
    document.getElementById('loadbar').style.width = '100%';
    document.getElementById('loadmsg').textContent = 'Ready!';
    document.getElementById('startbtn').style.display = 'block';
    document.getElementById('startbtn').textContent = 'START GAME';
    document.getElementById('startbtn').onclick = () => {
        sfx.ensure();
        document.getElementById('loading').classList.add('hidden');
        playIntroSequence();
        mainLoop();
    };
    // silent pre-roll of intro video metadata
    if (AudioCache['vid:intro']) {
        const v = AudioCache['vid:intro'];
        v.muted = true;
        v.play().then(() => { setTimeout(() => v.pause(), 300); }).catch(() => {});
    }
}

boot();