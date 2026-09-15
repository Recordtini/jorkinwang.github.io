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

// Exact machine wheel (statically RE'd: base init 0x4257C0, patches 0x425AA0).
// 72 micro-positions; wedge w = micros [(w*3-1)%72, (w*3)%72, (w*3+1)%72].
// Dollar encoding: (raw & 0x7FF) * 10. Specials by (raw & 0x7800).
const WHEEL_BASE_MICRO = [
    0x3c,0x3c,0x28,0x28,0x28,0x1e,0x1e,0x1e,0x800,0x800,0x800,
    0x50,0x50,0x50,0x23,0x23,0x23,0x2d,0x2d,0x2d,0x46,0x46,0x46,
    0x1e,0x1e,0x1e,0x3c,0x3c,0x3c,0x64,0x64,0x64,0x1e,0x1e,0x1e,
    0x3c,0x3c,0x3c,0x1e,0x1e,0x1e,0x32,0x32,0x32,0x50,0x50,0x50,
    0x37,0x37,0x37,0x28,0x28,0x28,0x1e,0x1e,0x1e,0x5a,0x5a,0x5a,
    0x32,0x32,0x32,0x1e,0x1e,0x1e,0x5a,0x5a,0x5a,0x1800,0x1800,0x1800,0x3c
];
let wheelMicro = [];
function buildWheel() {
    wheelMicro = WHEEL_BASE_MICRO.slice();
    applyWheelRound(state.round || 1);
    buildMicroSeq();
}
// Per-round patches, rebuilt idempotently (base + all patches <= round).
function applyWheelRound(round) {
    const R = Math.min(Math.max(round, 1), 4);
    const set3 = (i, v) => { wheelMicro[i] = v; wheelMicro[i + 1] = v; wheelMicro[i + 2] = v; };
    const dis3 = (i, on) => { for (let k = 0; k < 3; k++) wheelMicro[i + k] = on ? (wheelMicro[i + k] | 0x8000) : (wheelMicro[i + k] & ~0x8000); };
    if (R >= 1) { set3(29, 100); dis3(62, true); }
    if (R >= 2) { set3(29, 250); wheelMicro[38] = 0x1800; wheelMicro[39] = 0x6000; wheelMicro[40] = 0x1800; set3(14, 0x2000); dis3(62, true); }
    if (R >= 3) { set3(29, 350); set3(38, 0x1800); set3(41, 0x4000); set3(14, 0x2000); dis3(62, false); }
    if (R >= 4) { set3(29, 500); set3(41, 50); set3(14, 0x2000); }
    applyMicroRound(R);
}
function decodeMicro(raw) {
    if (raw & 0x8000) return { type: 'disabled', value: 0, label: '\u2014' };
    const h = raw & 0x7800;
    if (h === 0x1800) return { type: 'bankrupt', value: 0, label: 'BANKRUPT' };
    if (h === 0x0800) return { type: 'loseturn', value: 0, label: 'LOSE TURN' };
    if (h === 0x3000) return { type: 'freespin', value: 0, label: 'FREE SPIN' };
    if (h === 0x6000) return { type: 'jackpot', value: 10000, label: 'JACKPOT' };
    if (h === 0x2000) return { type: 'surprise', value: 0, label: 'SURPRISE' };
    if (h === 0x4000) return { type: 'bankrupt', value: 0, label: 'BANKRUPT' };
    const v = (raw & 0x7FF) * 10;
    return { type: 'money', value: v, label: '$' + v };
}
// Game RNG: LCG state*214013+2521491, output (state>>>16)&0x7FFF (0x426430).
// Seed source unreversed; wall-clock seed matches distribution only.
let rngState = (Date.now() & 0xffffffff) >>> 0;
function rng15() {
    rngState = (Math.imul(rngState, 214013) + 2521491) >>> 0;
    return (rngState >>> 16) & 0x7FFF;
}
function wedgeOfMicro(i) { return Math.floor((i + 1) / 3) % 24; }
function wedgeCenterMicro(w) { return (w * 3) % 72; }
// Spin duration (engine rotation timing unreversed; frames are authentic).
const SPIN_MS = 3900;

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
        // Original spin loop (wheel.dat #6723); synthesized decel fallback.
        if (!this.playClip('spinLoop')) this.spinSound();
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
    wheelTarget: 0,
    wheelVelocity: 0,
    wheelSpinning: false,
    wheelResult: null,
    wheelResultTimer: 0,
    // Menu system (binary screen numbering): 1 map(+room), 2 exam, 3 main,
    // 4 count, 5 length, 6 names, 7 location, 8 list, 9 help, 10 options.
    mscreen: 3,
    prevStack: [],
    helpPage: 0,
    setupFlow: null,
};

function newPlayer(name, isHuman) {
    return { name, isHuman, score: 0, roundScore: 0 };
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

const TEMPLATE_CELLS = [[105,235],[140,235],[175,235],[210,235],[245,235],[105,290],[140,290],[175,290],[210,290],[245,290],[280,290],[315,290],[350,290],[510,235],[545,235],[580,235],[615,235],[650,235],[685,235],[720,235],[755,235],[510,290],[545,290],[580,290],[615,290],[105,365],[140,365],[175,365],[210,365],[245,365],[280,365],[315,365],[105,420],[140,420],[175,420],[210,420],[245,420],[280,420],[510,365],[545,365],[580,365],[615,365],[650,365],[685,365],[720,365],[755,365],[510,420],[545,420],[580,420],[615,420],[105,235],[140,235],[175,235],[210,235],[245,235],[280,235],[315,235],[105,290],[140,290],[175,290],[210,290],[245,290],[496,215],[530,215],[564,215],[598,215],[632,215],[666,215],[700,215],[734,215],[768,215],[570,265],[605,265],[640,265],[500,305],[535,305],[570,305],[605,305],[640,305],[675,305],[710,305],[745,305],[105,365],[140,365],[175,365],[210,365],[245,365],[280,365],[315,365],[350,365],[105,420],[140,420],[175,420],[210,420],[510,365],[545,365],[580,365],[615,365],[650,365],[685,365],[505,420],[539,420],[573,420],[607,420],[641,420],[675,420],[709,420],[742,420],[775,420],[105,235],[140,235],[175,235],[210,235],[105,290],[140,290],[175,290],[210,290],[492,212],[526,212],[560,212],[594,212],[628,212],[662,212],[696,212],[730,212],[764,212],[510,285],[545,285],[580,285],[615,285],[650,285],[685,285],[720,285],[105,365],[140,365],[175,365],[210,365],[245,365],[280,365],[105,420],[140,420],[175,420],[210,420],[245,420],[280,420],[105,475],[140,475],[175,475],[210,475],[245,475],[510,365],[545,365],[580,365],[615,365],[650,365],[685,365],[485,420],[520,420],[555,420],[590,420],[625,420],[660,420],[695,420],[730,420],[765,420],[510,475],[545,475],[580,475],[615,475],[650,475],[685,475],[720,475],[105,235],[140,235],[175,235],[210,235],[245,235],[105,290],[140,290],[175,290],[210,290],[245,290],[280,290],[315,290],[510,235],[545,235],[580,235],[615,235],[650,235],[685,235],[510,290],[545,290],[580,290],[615,290],[650,290],[685,290],[105,365],[140,365],[175,365],[210,365],[245,365],[280,365],[105,420],[105,420],[140,420],[175,420],[210,420],[245,420],[280,420],[315,420],[510,365],[545,365],[580,365],[615,365],[650,365],[510,420],[545,420],[580,420],[615,420],[650,420]];
/* Board letter art: menus.dat entry ids. A-H from the 0x4020e0 immediates
 * (pre-push stores); I-Z shifted one slot by the push at 0x40214f, so
 * I reads J's value 0x20175 (menus 373, genuine 17x28 I glyph), J reads
 * 374, ..., Y reads 0x20666 (1638), Z the extra slot 0x2066d (1645).
 * I blits at cell_x+5 (ecx=5 I-exclusive nudge). */
const LETTER_ART = { A:286,B:287,C:312,D:329,E:330,F:344,G:357,H:358,
    I:373,J:374,K:375,L:376,M:377,N:1465,O:1499,P:1541,Q:1544,
    R:1545,S:1546,T:1563,U:1622,V:1624,W:1625,X:1630,Y:1638,Z:1645 };
function letterArtURL(ch) {
    if (!SEQ.spriteIndex) return null;
    return SEQ.spriteIndex['m' + String(LETTER_ART[ch]).padStart(4, '0')] || null;
}
/* Landing anim table: micro -> wheel seq id, dumped from 0x47D070
 * (file state = base: wedge w gets 92+w, wedge 0 shares a12=104)
 * with the verified per-round runtime deltas. */
let microSeq = [];
function buildMicroSeq() {
    microSeq = [];
    for (let i = 0; i < 72; i++) {
        const w = wedgeOfMicro(i);
        microSeq.push(w === 0 ? 104 : 92 + w);
    }
    applyMicroRound(state.round || 1);
}
function applyMicroRound(round) {
    const R = Math.min(Math.max(round, 1), 4);
    const setM = (a, b, v) => { for (let i = a; i <= b; i++) microSeq[i] = v; };
    if (R >= 1) setM(62, 64, 117);
    if (R >= 2) { setM(29, 31, 119); microSeq[38] = 115; microSeq[39] = 118; microSeq[40] = 115; setM(14, 16, 123); setM(62, 64, 117); }
    if (R >= 3) { setM(29, 31, 120); setM(38, 40, 115); setM(41, 43, 122); setM(62, 64, 113); setM(14, 16, 123); }
    if (R >= 4) { setM(29, 31, 121); setM(41, 43, 106); setM(14, 16, 123); }
}
/* Board model helpers (template flow). */
/* ------------------------------------------------------------------ *
 *  Board (puzzle) model: authentic template coordinates
 * ------------------------------------------------------------------ */
// UI exclusion zones (turn buttons) that board flow avoids.
const BOARD_EXCLUDE = [
    [180, 279, 296, 395], [342, 279, 458, 395], [504, 326, 616, 438],
];
function cellBlocked(x, y) {
    for (const r of BOARD_EXCLUDE) {
        if (x + 39 > r[0] && x < r[2] && y + 28 > r[1] && y < r[3]) return true;
    }
    return false;
}
function buildBoardCells(puzzle) {
    const s = puzzle.s.toUpperCase();
    // Order cells by band then x; detect run breaks (x-gap > 50 or y change).
    // Bottom band (y475) sits under the player panels: excluded from flow.
    const pts = TEMPLATE_CELLS.filter(([x, y]) => !cellBlocked(x, y) && y <= 466);
    pts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const bounds = [];
    for (let i = 0; i < pts.length; i++) {
        if (i === 0) { bounds.push(true); continue; }
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        bounds.push(dy !== 0 || dx > 50);
    }
    // Words with string indices (letters only; spaces/apostrophes handled inline).
    const words = [];
    let i = 0;
    while (i < s.length) {
        if (s[i] === ' ') { i++; continue; }
        const w = [];
        while (i < s.length && s[i] !== ' ') { w.push(i); i++; }
        words.push(w);
    }
    const cells = [];
    let p = 0;
    const nextBoundary = (from) => {
        for (let k = from; k < pts.length; k++) if (bounds[k]) return k;
        return pts.length;
    };
    for (const w of words) {
        // Fit whole word before the next boundary if possible.
        let run = 1;
        while (p + run < pts.length && !bounds[p + run]) run++;
        run = Math.min(run, Math.max(0, pts.length - p));
        if (w.length > run) p = nextBoundary(p);
        for (const si of w) {
            if (p >= pts.length) break;
            cells.push({ x: pts[p][0], y: pts[p][1], si });
            p++;
        }
        // Word gap: skip one cell.
        if (p < pts.length) p++;
    }
    return cells;
}
function boardLength(puzzle) {
    let n = 0;
    puzzle.s.replace(/'/g, '').split(' ').forEach(w => n += w.length);
    return n;
}

/* ------------------------------------------------------------------ *
 *  Wheel model (fixed machine order; result predetermined by RNG%72)
 * ------------------------------------------------------------------ */
function spinWheel(playerIdx, cb) {
    state.spinning = true; state.wheelSpinning = true;
    state.message = '';
    state.message2 = '';
    let micro = rng15() % 72;                       // 0x426430 % 72, stored first
    if (state.forceGoodSpin) {
        // Engine re-spin loop (0x420833): re-roll until >= $250, no 0x8000.
        state.forceGoodSpin = false;
        for (let t = 0; t < 200; t++) {
            const raw = wheelMicro[micro];
            if (!(raw & 0x8000) && (raw & 0x7FF) * 10 >= 250) break;
            micro = rng15() % 72;
        }
    }
    state.lastMicro = micro;
    const seg = decodeMicro(wheelMicro[micro]);
    sfx.spin();
    // The spin visual IS the result stop seq, stretched over the duration.
    onWheelResult(playerIdx, seg);
    const animStart = performance.now();

    function frame(now) {
        const t = Math.min(1, (now - animStart) / SPIN_MS);
        if (t < 1) { requestAnimationFrame(frame); return; }
        state.spinning = false; state.wheelSpinning = false;
        cb && cb(seg);
    }
    requestAnimationFrame(frame);
}

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
            state.players.push(newPlayer(aiNames[(i - numHuman) + Math.floor(Math.random() * 4)], false));
        }
    }
    state.roundCount = config.rounds || ROUNDS_BY_LENGTH[config.length] || 3;
    state.round = 0;
    state.screen = 'PLAY';
    state.gameOver = false;
    state.usedPuzzles = new Set();
    state.freeSpins = [0, 0, 0];
    state.bonusResult = null;
    state.inBonus = false;
    state.buyDialogSeen = false;
    buildWheel();
    startRound();
}

function startRound() {
    state.round++;
    state.wonThisRound = false;
    applyWheelRound(state.round);
    state.revealed = new Set();
    state.usedLetters = new Set();
    state.solveMode = false;
    state.buyVowelMode = false;
    state.pickingLetter = false;
    state.message = `ROUND ${state.round}`;
    state.message2 = 'choose your move';
    // Rotate start player (middle starts R1, right R2 per the rules text).
    state.currentPlayer = state.round % 3;
    state.players.forEach(p => p.roundScore = 0);
    // pick a puzzle (avoid repeats)
    const p = pickPuzzle(PUZZLE_BANK, state.usedPuzzles);
    if (!p) { state.usedPuzzles.clear(); state.puzzle = PUZZLE_BANK[randInt(PUZZLE_BANK.length)]; }
    else { state.puzzle = p; state.usedPuzzles.add(p.s); }
    state.wheelResult = null;
    state.mustSpin = true;
    state.boardCells = buildBoardCells(state.puzzle);
    state.solveCells = null;
    state.plaqueUntil = performance.now() + 3000;
    state.plaquePlayer = null;
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

/* --- AI decision making (0x421b40 structure; NO skill model exists) ---- *
 * The binary plays every CPU seat identically: deterministic first-A-Z
 * consonant (0x41cff0) and first-A/E/I/O/U vowel (0x41d0e0) verified
 * present-and-unguessed, correct-or-pass (never a wrong letter),
 * vowel buys gated on score >= 250 (0xfa) or the free flag.
 * Solve attempts happen once no hidden consonants remain (0x41d2d0);
 * the exact solve trigger/verify path is not yet reversed. */
function hiddenConsonants() {
    const s = state.puzzle.s;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i].toUpperCase();
        if (CONSONANTS.includes(ch) && !state.revealed.has(i)) return true;
    }
    return false;
}
function aiTurnDecide(pi) {
    const p = state.players[pi];
    if (!hiddenConsonants()) return 'solve';
    const upper = state.puzzle.s.toUpperCase();
    const vowelInPuzzle = VOWELS.some(l => !state.usedLetters.has(l) && upper.includes(l));
    if ((p.roundScore >= VOWEL_COST || state.freeSpins[pi] > 0) && vowelInPuzzle) return 'vowel';
    return 'spin';
}

function aiAutoPlay() {
    if (state.screen !== 'PLAY' || state.inBonus) return;
    if (state.stopAnim && !state.stopAnim.done) { setTimeout(() => aiAutoPlay(), 500); return; }
    const p = currentPlayer();
    if (p.isHuman) return;

    setTimeout(() => {
        if (state.solveMode || state.screen !== 'PLAY') return;
        if (state.spinning || state.pendingSeg) { setTimeout(() => aiAutoPlay(), 500); return; }
        doPlayerAction(state.currentPlayer, aiTurnDecide(state.currentPlayer));
        // (Pacing timeouts stand in for the engine's seq/speech pacing.)
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
            if (state.pendingSeg) {
                // Result still landing: retry shortly (AI-safe; humans re-click).
                if (!p.isHuman) {
                    setTimeout(() => {
                        if (!state.spinning && !state.pendingSeg && !state.inBonus) doPlayerAction(pi, 'spin');
                        else aiAutoPlay();
                    }, 600);
                }
                return;
            }
            state.mustSpin = false;
            state.pickingLetter = false;
            state.buyVowelMode = false;
            state.pendingDisabled = false;
            spinWheel(pi, null);
            break;
        case 'consonant':
            if ((state.spinValue <= 0 || state.spinType !== 'money') && !state.pendingDisabled) {
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
            else {
                enterPickMode();
                setMessage(`$${state.spinValue} \u2014 ${p.name}, pick a consonant`, 'click a tile, type it');
            }
            break;
        case 'vowel':
            // 0x41f170: score >= 250 (0xfa) or the free flag.
            if (p.roundScore < VOWEL_COST && state.freeSpins[pi] === 0) {
                setMessage(p.name, 'not enough money for a vowel');
                if (!p.isHuman) { nextTurn(false, 'no money'); return; }
                return;
            }
            state.buyVowelMode = true;
            state.buyDialogSeen = true;
            if (!p.isHuman) aiPickVowel(pi);
            else {
                enterPickMode();
                setMessage(`${p.name}, buy a vowel \u2014 $${VOWEL_COST}`, 'click a tile, type it');
            }
            break;
        case 'solve':
            state.solveMode = true;
            state.solveCells = { cursor: firstHiddenCell(), guesses: {} };
            state.message = `${p.name}, solve the puzzle`;
            state.message2 = 'click a tile, type letters, ENTER to submit';
            if (!p.isHuman) aiSolve(pi);
            break;
    }
}

// Solve-by-cells (no typing box in the original): click an unrevealed
// tile to place the cursor, type to fill, ENTER submits the assembly.
function firstHiddenCell() {
    if (!state.boardCells) return null;
    for (const c of state.boardCells) {
        const ch = state.puzzle.s[c.si].toUpperCase();
        if (ch >= 'A' && ch <= 'Z' && !state.revealed.has(c.si)) return c;
    }
    return state.boardCells[0] || null;
}
function solveGuessAt(c) {
    return (state.solveCells && state.solveCells.guesses[c.si]) || null;
}
function solveAdvance(dir) {
    const sc = state.solveCells;
    if (!sc || !state.boardCells) return;
    const order = state.boardCells.filter(c => {
        const ch = state.puzzle.s[c.si].toUpperCase();
        return ch >= 'A' && ch <= 'Z' && !state.revealed.has(c.si);
    });
    if (!order.length) return;
    let i = order.indexOf(sc.cursor);
    i = i < 0 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length;
    sc.cursor = order[i];
}
function finishSolve() {
    const sc = state.solveCells;
    state.solveMode = false;
    state.solveCells = null;
    if (!sc) return;
    let guess = '';
    for (const c of state.boardCells) {
        const ch = state.puzzle.s[c.si].toUpperCase();
        if (ch < 'A' || ch > 'Z') { guess += state.puzzle.s[c.si]; continue; }
        if (state.revealed.has(c.si)) guess += ch;
        else if (sc.guesses[c.si]) guess += sc.guesses[c.si];
        else { setMessage('INCOMPLETE', 'fill every letter first'); state.solveMode = true; state.solveCells = sc; return; }
    }
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

function onWheelResult(pi, seg) {
    // spinValue goes live with the result effects (after the overlay), so
    // mid-spin picks stay blocked as in the original.
    // Landing anim: file-backed micro->seq table (0x47D070 + round deltas),
    // stretched across the spin; pointer rides along.
    const micro = state.lastMicro === undefined ? 0 : state.lastMicro;
    const seqId = 'w' + String(microSeq[micro] || 0).padStart(4, '0');
    const p = new SeqPlayer(seqId);
    p.once = true;
    p.stretchMs = SPIN_MS;
    p.init();
    state.stopAnim = p;
    const pp = new SeqPlayer('w0092');
    pp.hold = true;
    pp.stretchMs = SPIN_MS;
    pp.init();
    state.pointerAnim = pp;
    state.pendingSeg = { pi, seg };
    sfx.playClip('spinTick', 0.5);
    // Watchdog for paused render loops (background tabs): force-apply.
    if (state.pendingTimer) clearTimeout(state.pendingTimer);
    state.pendingTimer = setTimeout(() => {
        state.pendingTimer = null;
        if (state.pendingSeg) {
            const ps = state.pendingSeg;
            state.pendingSeg = null;
            state.stopAnim = null;
            state.pointerAnim = null;
            applySegResult(ps.pi, ps.seg);
        }
    }, 4000);
}
function applySegResult(pi, seg) {
    const p = state.players[pi];
    state.spinValue = seg.value;
    state.spinType = seg.type || 'money';
    state.wheelResult = seg;
    state.wheelResultTimer = 90;
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
    } else if (seg.type === 'disabled') {
        // Disabled wedge (0x8000): turn NOT ended. The player calls a
        // letter; a correct call grants a token + re-enables the wedge.
        state.pendingDisabled = true;
        sfx.click();
        setMessage('DISABLED WEDGE', p.name + ' — call a letter to unlock it');
        state.spinValue = 0; state.spinType = 'money';
        state.mustSpin = false;
        if (!p.isHuman) setTimeout(() => doPlayerAction(pi, 'consonant'), 900 + randInt(700));
    } else if (seg.type === 'freespin') {
        // Help text: up to 11 free spins per puzzle. (Decode-grant of the
        // token is unproven in code; the wedge is named frees and the
        // disabled path is the only traced grant.)
        if (state.freeSpins[pi] < 11) state.freeSpins[pi]++;
        sfx.cash();
        setMessage('FREE SPIN!', p.name + ' banks a free spin token');
        state.spinValue = 0; state.spinType = 'money';
        state.mustSpin = true;
        if (!p.isHuman) setTimeout(() => doPlayerAction(pi, 'consonant'), 900 + randInt(700));
    } else if (seg.type === 'surprise') {
        // Surprise (0x2000): NO cash at decode. Prize resolves via Vanna
        // ceremony + inventory (unmapped: no prize awarded). Turn continues
        // with an engine-style guaranteed re-spin (re-roll until >= $250,
        // no disabled). Prize teardown ($350 restore) on correct letter.
        state.surprisePending = true;
        sfx.cash();
        setMessage('SURPRISE!', p.name + ' spins again free');
        state.spinValue = 0; state.spinType = 'money';
        state.mustSpin = true;
        state.forceGoodSpin = true;
        setTimeout(() => doPlayerAction(pi, 'spin'), 1400);
    } else if (seg.type === 'jackpot') {
        // Jackpot $10,000 (arming-conditional credit unproven: always
        // credit). One-shot teardown (micro39 -> bankrupt) on resolution.
        p.roundScore += seg.value;
        state.jackpotPending = true;
        sfx.win();
        setMessage(`JACKPOT! +$${seg.value.toLocaleString()}`, p.name + ' picks a consonant');
        state.spinValue = 0; state.spinType = 'money';
        state.mustSpin = false;
        if (!p.isHuman) setTimeout(() => doPlayerAction(pi, 'consonant'), 900 + randInt(700));
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
    // Letter-name AV (0x424560 + pair): Vanna voices the called letter.
    // (Bucket clip approximates; exact speech-id mapping pending RE.)
    if (VOWELS.includes(letter)) { setMessage(letter + ' is a vowel', 'buy it with BUY VOWEL instead'); return; }
    // Already called: silent ignore, turn kept, pick again (pending kept).
    if (state.usedLetters.has(letter)) return;
    state.buyVowelMode = false; state.solveMode = false; state.pickingLetter = false;
    state.pickEcho = null;
    state.usedLetters.add(letter);
    const count = countInPuzzle(state.puzzle.s, letter);
    if (count > 0) {
        const earned = state.spinValue * count;
        p.roundScore += earned;
        Vanna.play('letter');
        if (state.pendingDisabled) {
            // Disabled-wedge unlock: token + re-enable micros 62-64.
            state.pendingDisabled = false;
            if (state.freeSpins[pi] < 11) state.freeSpins[pi]++;
            for (const i of [62, 63, 64]) wheelMicro[i] &= ~0x8000;
            microSeq[62] = microSeq[63] = microSeq[64] = 113;
            pressFx('w0580'); pressFx('w0593');
            setMessage('WEDGE UNLOCKED!', p.name + ' banks a free spin');
        }
        if (state.surprisePending) {
            // Surprise teardown: restore $350/a05 on a correct call.
            state.surprisePending = false;
            wheelMicro[14] = wheelMicro[15] = wheelMicro[16] = 0x23;
            microSeq[14] = microSeq[15] = microSeq[16] = 97;
        }
        if (state.jackpotPending) {
            // Jackpot one-shot teardown: micro39 -> bankrupt.
            state.jackpotPending = false;
            wheelMicro[39] = 0x1800;
            microSeq[39] = 115;
        }
        Vanna.play('letter');
        setTimeout(() => {
            revealLetter(letter);
            if (isSolved()) { roundWon(pi, 'solved'); return; }
            if (!p.isHuman) {
                // Turn retained after a correct letter; the AI decides again.
                setTimeout(() => nextTurn(false, 'keep'), 1400);
            }
        }, 600);
    } else {
        if (state.jackpotPending) {
            state.jackpotPending = false;
            wheelMicro[39] = 0x1800;
            microSeq[39] = 115;
        }
        state.pendingDisabled = false;
        // Miss annunciation uses the same letter-indexed AV (no buzzer in
        // any letter path; the only "buzzer" string is free-spin help).
        Vanna.play('letter');
        if (state.freeSpins[pi] > 0) {
            // Free-spin token retains the turn after a miss.
            state.freeSpins[pi]--;
            sfx.click();
            setMessage(`${letter} is not in the puzzle`, `${p.name} uses a FREE SPIN`);
            if (!p.isHuman) setTimeout(() => aiAutoPlay(), 1200);
        } else {
            setTimeout(() => nextTurn(true), 1500);
        }
    }
    state.spinValue = 0; state.spinType = 'money';
}

function resolveVowel(pi, letter) {
    const p = state.players[pi];
    if (!VOWELS.includes(letter)) { setMessage(letter + ' is not a vowel', 'pick A, E, I, O or U'); return; }
    if (p.roundScore < VOWEL_COST && state.freeSpins[pi] === 0) {
        Vanna.play('phrase'); // unaffordable-vowel guard speech
        setMessage(p.name, 'not enough money for a vowel');
        state.buyVowelMode = false;
        return;
    }
    // Already called: silent ignore (vowel-slot loop skips tried slots).
    if (state.usedLetters.has(letter)) return;
    state.buyVowelMode = false; state.solveMode = false; state.pickingLetter = false;
    state.pickEcho = null;
    p.roundScore -= VOWEL_COST; // silent subtract: no deduction display found
    state.usedLetters.add(letter);
    const count = countInPuzzle(state.puzzle.s, letter);
    Vanna.play('letter');
    setTimeout(() => {
        revealLetter(letter);
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
    if (!state.boardCells) return false;
    for (const c of state.boardCells) {
        const ch = state.puzzle.s[c.si].toUpperCase();
        if (ch >= 'A' && ch <= 'Z' && !state.revealed.has(c.si)) return false;
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
    state.pendingDisabled = false; state.surprisePending = false; state.jackpotPending = false;
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
    state.pendingDisabled = false; state.surprisePending = false; state.jackpotPending = false;
    state.mustSpin = true;
    const next = (state.currentPlayer + 1) % 3;
    if (!lostTurn && reason === 'keep') {
        // Player kept the turn (correct consonant/vowel); they may spin again.
        // (Machine wheel order is fixed; no reshuffle.)
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
    state.boardCells = buildBoardCells(state.puzzle);
    state.solveCells = null;
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
            // AI winner: everything automatic. The binary's solve-verify
            // path is not yet reversed; the machine plays deterministic
            // correct-or-pass everywhere, so the AI solves here.
            autoBonusLetters();
            setTimeout(() => {
                if (state.inBonus) endBonusRound(true);
            }, 4500 + randInt(4000));
        }
    });
}

function autoBonusLetters() {
    // Deterministic like the letter pickers (no random-pick evidence in
    // the binary): first 3 unused consonants in the puzzle + first unused
    // vowel, falling back to alphabetical order.
    const puzzleLetters = new Set();
    for (const ch of state.puzzle.s.replace(/[^A-Z]/g, '')) puzzleLetters.add(ch);
    const cons = CONSONANTS.filter(l => puzzleLetters.has(l) && !state.usedLetters.has(l));
    const picks = cons.slice(0, 3);
    const vowel = VOWELS.find(l => puzzleLetters.has(l) && !state.usedLetters.has(l));
    if (picks.length < 3) {
        for (const l of ALPHABET) {
            if (picks.length >= 3) break;
            if (!VOWELS.includes(l) && !state.usedLetters.has(l) && !picks.includes(l)) picks.push(l);
        }
    }
    grantBonusLetters(picks.slice(0, 3), vowel || VOWELS.find(l => !state.usedLetters.has(l)) || 'E');
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
// Menu rollover rate is not in the binary (no ms/frame constant exists);
// 2 fps gives the gentle pulse the engine's sticky highlight implies.
// Everything else (spins, landings, presses, game buttons) stays at 12.
const MENU_ROL_FPS = 2;
class SeqPlayer {
    constructor(seqId) {
        this.seqId = seqId;
        this.m = null;
        this.ready = false;
        this.done = false;
        this.hold = false; // when true, draw() keeps showing the last slot
        this.once = false; // when true, play through once then done (no loop)
        this.rate = SEQ_FPS; // frames/sec; menu rolls use MENU_ROL_FPS
        this.stretchMs = 0; // when set, spread slots over wall time
        this.t0 = 0;
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
        for (const f of this.m.frames) {
            jobs.push(SEQ.loadFrame(this.m.file, f.sprite));
            // f2==2 layers composite opaque: preload the opaque variant.
            if (f.f2 === 2) jobs.push(SEQ.loadURL(SEQ.opqURL(this.m.file, f.sprite)));
        }
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
        if (this.stretchMs) {
            if (!this.t0) this.t0 = performance.now();
            const k = Math.min(1, (performance.now() - this.t0) / this.stretchMs);
            const idx = Math.min(this.slotIds.length - 1, Math.floor(k * this.slotIds.length));
            if (idx !== this.slotIdx) {
                this.slotIdx = idx;
                this.fireCues(this.slotIds[idx]);
            }
            if (k >= 1) this.done = true;
            return;
        }
        this.t += dt;
        const step = 1 / (this.rate || SEQ_FPS);
        let adv = Math.floor(this.t / step);
        this.t -= adv * step;
        if (adv > 4) { this.t = 0; adv = 4; } // clamp tab-switch jumps
        for (let k = 0; k < adv; k++) this.advance();
    }
    advance() {
        if (this.slotIdx >= this.slotIds.length - 1) {
            if (this.once || this.m.mode !== 2) this.done = true;
            else this.slotIdx = 0;
        } else {
            this.slotIdx++;
        }
        if (!this.done) this.fireCues(this.slotIds[this.slotIdx]);
    }
    // Engine restarts the roll on every interior mousemove (no
    // already-hovered guard): reset to frame 0 + refire its cues.
    restart() {
        if (!this.ready) return;
        this.slotIdx = 0;
        this.t = 0;
        this.t0 = 0;
        this.done = false;
        if (this.slotIds.length) this.fireCues(this.slotIds[0]);
    }
    draw(c) {
        if (!this.ready || (this.done && !this.hold)) return;
        const ids = this.slotIds;
        const recs = this.byId[ids[Math.min(this.slotIdx, ids.length - 1)]];
        for (const f of recs) {
            const url = SEQ.frameURL(this.m.file, f.sprite);
            let img = url && SEQ.frameCache[url];
            // f2==2 layers are opaque (keyed blit off): prefer variant.
            if (f.f2 === 2) {
                const ourl = SEQ.opqURL(this.m.file, f.sprite);
                if (ourl && SEQ.frameCache[ourl]) img = SEQ.frameCache[ourl];
                else if (ourl) SEQ.loadURL(ourl);
            }
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
    mapAnims = MAP_PIK_SEQS.map((id) => {
        const p = new SeqPlayer(id);
        p.once = true; p.hold = true;
        p.init();
        return p;
    });
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

/* -- Stop-sequence overlay + category plaque + solve picking ------- *
 * On a land, the wedge stop anim (absolute 800x600 coords) plays over
 * the scene; result effects apply when it finishes (pendingSeg). */
function drawStopOverlay() {
    if (state.stopAnim) {
        state.stopAnim.update(frameDt);
        state.stopAnim.draw(ctx);
        if (state.pointerAnim) { state.pointerAnim.update(frameDt); state.pointerAnim.draw(ctx); }
    }
    // No anim (e.g. disabled wedge) counts as instantly done.
    if (state.pendingSeg && (!state.stopAnim || state.stopAnim.done)) {
        const ps = state.pendingSeg;
        state.pendingSeg = null;
        state.stopAnim = null;
        state.pointerAnim = null;
        if (state.pendingTimer) { clearTimeout(state.pendingTimer); state.pendingTimer = null; }
        applySegResult(ps.pi, ps.seg);
    }
}
// Category plaque (mcass art + text) shown briefly at round start.
function drawPlaque() {
    if (!state.plaqueUntil || performance.now() > state.plaqueUntil) return;
    if (!state.plaquePlayer) {
        const p = new SeqPlayer('m0046');
        p.once = true; p.hold = true;
        p.init();
        state.plaquePlayer = p;
    }
    state.plaquePlayer.update(frameDt);
    state.plaquePlayer.draw(ctx);
    ctx.fillStyle = '#1a2a5a';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(categoryName(state.puzzle.c).toUpperCase(), 403, 282);
}
function solveTileHit(px, py) {
    if (!state.boardCells) return null;
    for (const c of state.boardCells) {
        const ch = state.puzzle.s[c.si].toUpperCase();
        if (ch < 'A' || ch > 'Z' || state.revealed.has(c.si)) continue;
        if (px >= c.x && px <= c.x + 39 && py >= c.y && py <= c.y + 28) return c;
    }
    return null;
}

function drawPuzzleBoard() {
    if (!state.puzzle || !state.boardCells) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of state.boardCells) {
        if (c.si < 0 || c.si >= state.puzzle.s.length) continue;
        const raw = state.puzzle.s[c.si];
        const ch = raw.toUpperCase();
        const isLetter = ch >= 'A' && ch <= 'Z';
        const known = state.revealed.has(c.si);
        // Unrevealed trilon (green) / revealed bed (darker green).
        ctx.fillStyle = known ? '#0d5a2e' : '#0e6b34';
        roundRect(c.x, c.y, 39, 28, 3);
        ctx.fill();
        ctx.strokeStyle = '#083d20';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (!isLetter) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px "Courier New", monospace';
            ctx.fillText(raw, c.x + 19.5, c.y + 15);
        } else if (known) {
            drawBoardLetter(ch, c);
        }
        // Solve cursor.
        if (state.solveCells && state.solveCells.cursor === c && !known) {
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2.5;
            roundRect(c.x - 1.5, c.y - 1.5, 42, 31, 4);
            ctx.stroke();
            const g = solveGuessAt(c);
            if (g) {
                ctx.fillStyle = '#ffe066';
                ctx.font = 'bold 15px "Courier New", monospace';
                ctx.fillText(g, c.x + 19.5, c.y + 15);
            }
        }
        // Pick cursor + keystroke echo.
        if ((state.pickingLetter || state.buyVowelMode) && !known && state.pickCursor === c) {
            drawPickCursor();
        }
    }
    ctx.restore();
}

function drawBoardLetter(ch, c) {
    const url = letterArtURL(ch);
    const img = url && SEQ.frameCache[url];
    if (!img) {
        if (url) SEQ.loadFrame('menus.dat', LETTER_ART[ch]);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.fillText(ch, c.x + 19.5, c.y + 15);
        return;
    }
    ctx.drawImage(img, c.x + 19.5 - img.width / 2, c.y + 14 - img.height / 2);
}

function categoryName(cat) { return CATEGORY_LOOKUP[cat] || cat || 'Phrase'; }

/* -- Player panels ---------- */
/* -- Player panels (Courier type; fixed side tints; round starter) ---- *
 * Per the help/rules text: middle panel starts round 1, right starts
 * round 2 (starter = round % 3). Names shrink to fit 215px. */
function fitFont(text, maxW, base, weight) {
    let size = base;
    ctx.font = `${weight} ${size}px "Courier New", monospace`;
    while (size > 9 && ctx.measureText(text).width > maxW) {
        size--;
        ctx.font = `${weight} ${size}px "Courier New", monospace`;
    }
    return size;
}

function drawPlayers() {
    const y0 = 500;
    const pw = 240, ph = 80;
    const spacing = 18;
    const totalW = 3 * pw + 2 * spacing;
    let x = (W - totalW) / 2;
    const starter = state.round % 3;
    for (let i = 0; i < state.players.length; i++) {
        const p = state.players[i];
        const active = state.currentPlayer === i && !state.inBonus;
        let fill = 'rgba(0,0,0,0.45)';
        if (i === 1) fill = 'rgba(120,90,10,0.45)';   // middle panel gold tint
        if (i === 2) fill = 'rgba(10,60,120,0.45)';   // right panel blue tint
        if (active) fill = 'rgba(0,120,255,0.30)';
        ctx.fillStyle = fill;
        roundRect(x, y0, pw, ph, 10);
        ctx.fill();
        ctx.strokeStyle = (i === starter) ? '#ffd700' : (active ? '#ffd700' : '#335577');
        ctx.lineWidth = (i === starter || active) ? 3 : 1;
        ctx.stroke();

        ctx.fillStyle = active ? '#ffe066' : '#aabbcc';
        ctx.textAlign = 'left';
        fitFont(p.name, 150, 16, 'bold');
        ctx.fillText(p.name, x + 12, y0 + 24);
        if (state.freeSpins[i] > 0) {
            ctx.fillStyle = '#7dff8f';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText('FREE SPIN x' + state.freeSpins[i], x + pw - 96, y0 + 22);
        }
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        fitFont('$' + p.roundScore.toLocaleString(), 200, 20, 'bold');
        ctx.fillText('$' + p.roundScore.toLocaleString(), x + pw - 12, y0 + 54);
        ctx.font = '13px "Courier New", monospace';
        ctx.fillStyle = '#88aacc';
        ctx.fillText('$' + p.score.toLocaleString(), x + pw - 12, y0 + 74);
        ctx.textAlign = 'left';
        if (!p.isHuman) {
            ctx.fillStyle = '#556688';
            ctx.font = '10px Verdana, sans-serif';
            ctx.fillText('CPU', x + 12, y0 + ph - 6);
        }
        x += pw + spacing;
    }
}

/* -- Turn buttons: original seq art at original rects ---------------- *
 * SPIN idle w0836 [342,279,458,395], SOLVE idle w0832 [504,326,616,438],
 * BUY idle w0191 [195,326,307,438] with press byein w0192/byeou w0193. */
function drawControls() {
    const spin = seqBtn('w0836');
    spin.update(frameDt); spin.draw(ctx);
    const solv = seqBtn('w0832');
    solv.update(frameDt); solv.draw(ctx);
    const buy = seqBtn('w0191');
    buy.update(frameDt); buy.draw(ctx);
    drawBuyDialog();
}
// Buy proposition dialog (MWProp2, menus 248): pre-shown during normal
// play, removed on buy press (0x439740). One-shot per game.
function drawBuyDialog() {
    if (state.buyDialogSeen || state.buyVowelMode || state.inBonus) return;
    const p = seqBtn('m0248');
    p.once = true; p.hold = true;
    p.update(frameDt); p.draw(ctx);
}
// Fire-and-forget press/flash anims (played once, drawn in render).
function pressFx(seqId) {
    const p = new SeqPlayer(seqId);
    p.once = true;
    p.init();
    if (!state.fxAnims) state.fxAnims = [];
    state.fxAnims.push(p);
}
function drawFxAnims() {
    if (!state.fxAnims) return;
    for (const p of state.fxAnims) { p.update(frameDt); p.draw(ctx); }
    state.fxAnims = state.fxAnims.filter(p => !p.done);
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

/* Pick cursor + echo + countdown (human letter entry) -------------- *
 * Typing echoes the keystroke onto the cursor tile (entry box), then
 * resolves immediately. Unrevealed-letter cells only. Countdown aborts
 * the pick mode at zero (turn passes). */
function pickCells() {
    if (!state.boardCells) return [];
    return state.boardCells.filter(c => {
        const ch = state.puzzle.s[c.si].toUpperCase();
        return ch >= 'A' && ch <= 'Z' && !state.revealed.has(c.si);
    });
}
function pickStep(dir) {
    const cells = pickCells();
    if (!cells.length) return;
    let i = cells.indexOf(state.pickCursor);
    i = i < 0 ? (dir > 0 ? 0 : cells.length - 1) : (i + dir + cells.length) % cells.length;
    state.pickCursor = cells[i];
}
function enterPickMode() {
    const cells = pickCells();
    state.pickCursor = cells[0] || null;
    state.pickEcho = null;
    state.pickCount = 300;
}
function drawPickCursor() {
    const c = state.pickCursor;
    if (!c || state.revealed.has(c.si)) return;
    const now = performance.now();
    ctx.strokeStyle = '#7fd8ff';
    ctx.lineWidth = 2;
    roundRect(c.x - 1.5, c.y - 1.5, 42, 31, 4);
    ctx.stroke();
    const e = state.pickEcho;
    if (e && e.si === c.si && now < e.until) {
        ctx.fillStyle = '#ffe066';
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.letter, c.x + 19.5, c.y + 15);
    }
}
function tickPickCount() {
    if ((!state.pickingLetter && !state.buyVowelMode) || state.screen !== 'PLAY') return;
    if (state.pickCount === undefined) state.pickCount = 300;
    if (state.pickCount <= 0) {
        // Timeout abort: exit pick mode, turn passes.
        state.pickingLetter = false; state.buyVowelMode = false;
        state.pickCursor = null; state.pickEcho = null;
        setTimeout(() => nextTurn(true, 'timeout'), 800);
        return;
    }
    state.pickCount--;
}
/* -- Used letters + spin value ---------- */
function drawStatus() {
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    // category + round header
    if (state.puzzle) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 17px Verdana, sans-serif';
        ctx.fillText(categoryName(state.puzzle.c), W / 2 - 60, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '15px Verdana, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`ROUND ${state.round}`, 24, 28);
        ctx.textAlign = 'center';
    }
    // spin result
    if (state.wheelResult && state.wheelResultTimer > 0) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px Verdana, sans-serif';
        ctx.fillText(state.spinValue > 0 ? '$' + state.spinValue : state.spinType, W / 2 - 60, 62);
    } else if (state.spinValue > 0) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px Verdana, sans-serif';
        ctx.fillText('$' + state.spinValue, W / 2 - 60, 62);
    }

    // message
    if (state.message) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 19px Verdana, sans-serif';
        ctx.fillText(state.message, W / 2 - 60, 92);
        if (state.message2) {
            ctx.font = '13px Verdana, sans-serif';
            ctx.fillStyle = '#aaccff';
            ctx.fillText(state.message2, W / 2 - 60, 110);
        }
    }
    ctx.shadowBlur = 0;

    // used letters
    const used = [...state.usedLetters].sort().join(' ');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px Courier, monospace';
    ctx.fillText(used, W / 2, 594);
}

/* -- Solving input overlay ---------- */
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
    // Pick-count countdown (~10Hz while picking; aborts at zero).
    if ((state.pickingLetter || state.buyVowelMode) && state.screen === 'PLAY') {
        state.pickTick = ((state.pickTick || 0) + 1) % 6;
        if (state.pickTick === 0) tickPickCount();
    }
    if (state.screen === 'CUTSCENE') {
        drawCutscene();
    } else if (state.screen === 'PLAY') {
        drawBackground();
        drawPuzzleBoard();
        drawPlaque();
        drawPlayers();
        drawControls();
        drawFxAnims();
        drawStopOverlay();
        drawStatus();
        if (state.solveMode && state.solveCells) {
            ctx.fillStyle = '#ffe066';
            ctx.font = 'bold 15px Verdana, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('click a tile, type letters, ENTER to solve', W / 2, 592);
        }
        if (state.inBonus) {
            // puzzle visible without wheel overlay
            drawBonusOverlay();
        }
    } else if (state.screen === 'GAMEOVER') {
        drawGameOver();
    } else if (state.screen === 'MENU') {
        drawMenuScreen();
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

function drawMenuScreen() {
    const m = state.mscreen;
    if (m === 3) drawMain();
    else if (m === 4) drawCount();
    else if (m === 5) drawLength();
    else if (m === 6) drawNames();
    else if (m === 7) drawLocation();
    else if (m === 8) drawList();
    else if (m === 9) drawHelp();
    else if (m === 10) drawOptions10();
    else drawMenu(); // 1 map/rooms, 2 exam room
}

/* -- Menu (backstage map: original BMPs + hotspot overlays) ----------
 * Reverse-engineered from the exe (hotspot registration 0x40ede0,
 * callbacks 0x417510+, room entry 0x417550, BMP swap 0x417720):
 * hover plays the mmrolXXX overlay seq (no BMP swap); click enters the
 * room (BMP swap + room idle seq). Room BMPs: exa->0002 exam screen,
 * green->0003, control->0000, prod->0005, dress->0001, stage->0006. */
/* Sticky highlight: leave is a no-op (p10=0 everywhere), so the roll
 * keeps looping until replaced. Restarted on every interior mousemove. */
function rolPlayerFor(scr, key) {
    if (key === 'gback') return seqBtn('m0012');
    if (scr === 1) return (rolAnims && rolAnims[key]) || null;
    if (scr === 3) {
        const b = MAIN_BTNS.find(b => b.k === key);
        return (b && b.rol) ? seqBtn(b.rol) : null;
    }
    if (scr === 9) {
        const b = HELP_BTNS.find(b => b.k === key);
        return (b && b.rol) ? seqBtn(b.rol) : null;
    }
    return null;
}
function stickyKeyFor() {
    const m = state.mscreen, h = state.menuHover;
    if (!h) return null;
    if (m === 1) {
        if (typeof h === 'string') {
            if (h === 'back' || h === 'back2') return null;
            return { scr: 1, key: h };
        }
        if (h.k === 'gback') return { scr: 1, key: 'gback' };
        return null;
    }
    if (h && h.k === 'gback') return { scr: m, key: 'gback' };
    if ((m === 3 || m === 9) && h && h.rol) return { scr: m, key: h.k };
    return null;
}
function isSticky(scr, key) {
    const st = state.sticky;
    return !!(st && st.scr === scr && st.key === key);
}
function backEnabled() {
    // Global BACK slot off on screens 3/9/10 (0x4115d5).
    return state.screen === 'MENU' && ![3, 9, 10].includes(state.mscreen);
}

function drawMenu() {
    ensureMapAnims();
    ensureRolAnims();
    const room = state.room;
    const img = bgImage(room ? ROOM_BG[room] : 'menu5');
    if (img) ctx.drawImage(img, 0, 0, W, H);
    else drawProceduralBg();
    if (!room && mapAnims) for (const p of mapAnims) { p.update(frameDt); p.draw(ctx); }
    if (room && state.roomPlayer) { state.roomPlayer.update(frameDt); state.roomPlayer.draw(ctx); }
    const st = state.sticky;
    if (st && st.scr === 1 && rolAnims && rolAnims[st.key]) {
        const p = rolAnims[st.key];
        p.update(frameDt); p.draw(ctx);
    }
    drawGlobals();
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
        p.rate = MENU_ROL_FPS;
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
        p.once = true; p.hold = true;
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
    if (key === 'back' || key === 'back2') { menuBack(); return; }
    const room = (MENU_HOTSPOTS[key] || {}).room;
    if (!room) return;
    // Clicking the Stage label while on the Stage screen starts the game
    // (exact start hotspot on the stage screen pending further RE).
    if (room === 'stage' && state.room === 'stage') { startGameFromConfig(); return; }
    sfx.click();
    setRoom(room);
}

function startGameFromConfig() {
    // Quick-play defaults (stage room path until the stage flow is reversed).
    sfx.click();
    sfx.playClip('chime2');
    resetSetup();
    launchGame();
}

function resetSetup() {
    state.setupFlow = {
        humans: 1, rounds: 3, lengthIdx: 3,
        names: ['YOU', 'PLAYER 2', 'PLAYER 3'],
        locationIdx: 0, nameSlot: 0, nameBuf: '',
        fromCount: false,
    };
    state.prevStack = [];
    state.helpPage = 0;
}
function cpuName(i) {
    const aiNames = ['REX', 'MAX', 'JENNY', 'KIP', 'SAM', 'MO', 'ANN', 'RIKKI'];
    return aiNames[i % aiNames.length];
}
function launchGame() {
    const sf = state.setupFlow;
    const names = [];
    for (let i = 0; i < 3; i++) names.push(sf.names[i] || cpuName(i));
    startGame({ humans: sf.humans, playerNames: names, rounds: sf.rounds, location: sf.locationIdx });
}

/* -- Seq-driven menu buttons ---------------------------------------- */
const seqBtnCache = {};
function seqBtn(id) {
    if (!seqBtnCache[id]) { const p = new SeqPlayer(id); p.init(); seqBtnCache[id] = p; }
    return seqBtnCache[id];
}
function drawSeqBtn(idleId, rolId, hovered) {
    // Menu idle art plays once on entry then holds (static menu that
    // responds on hover/press); rol loops while hovered.
    const p = seqBtn(idleId);
    p.once = true; p.hold = true;
    p.update(frameDt); p.draw(ctx);
    if (hovered && rolId) {
        const r = seqBtn(rolId);
        r.rate = MENU_ROL_FPS;
        r.update(frameDt); r.draw(ctx);
    }
}
function btnHit(list, px, py) {
    for (const b of list) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
}

/* -- Main menu (screen 3): buttons verbatim from the exe ------------- */
const MAIN_BTNS = [
    { k: 'nrm', x: 254, y: 212, w: 276, h: 39, idle: 'm0020', rol: 'm0025', act() { resetSetup(); state.mscreen = 4; } },
    { k: 'sol', x: 289, y: 256, w: 207, h: 36, idle: 'm0021', rol: 'm0026', act() { resetSetup(); state.setupFlow.humans = 1; state.mscreen = 5; } },
    { k: 'tor', x: 277, y: 298, w: 229, h: 27, idle: 'm0022', rol: 'm0027', act() { state.tourneyMsg = performance.now(); sfx.wrong(); } },
    { k: 'cnt', x: 228, y: 339, w: 347, h: 35, idle: 'm0019', rol: 'm0024', act() { setRoom(null); state.mscreen = 1; } },
    { k: 'car', x: 237, y: 371, w: 319, h: 44, idle: 'm0018', rol: 'm0023', act() { state.mscreen = 8; } },
];
function drawMain() {
    const img = bgImage('car56');
    if (img) ctx.drawImage(img, 0, 0, W, H);
    else drawProceduralBg();
    for (const b of MAIN_BTNS) drawSeqBtn(b.idle, b.rol, isSticky(3, b.k));
    if (state.tourneyMsg && performance.now() - state.tourneyMsg < 2500) {
        ctx.fillStyle = '#ff8888';
        ctx.font = 'bold 20px Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Tournament play requires saved games', W / 2, 470);
    }
    drawGlobals();
}

/* -- Global chrome: xyz bar + mx/my/mz + top-right BACK (all screens) */
const GLOB_BTNS = [
    { k: 'mx', x: 21, y: 20, w: 96, h: 23, act() { pushPrev(); state.mscreen = 10; } },
    { k: 'my', x: 40, y: 45, w: 57, h: 22, act() { pushPrev(); state.mscreen = 9; } },
    { k: 'mz', x: 43, y: 71, w: 48, h: 18, act() { toggleMute(); } },
    { k: 'gback', x: 673, y: 15, w: 87, h: 52, idle: 'm0011', rol: 'm0012', act() { menuBack(); } },
];
function pushPrev() { state.prevStack.push({ m: state.mscreen, room: state.room }); }
function drawGlobals() {
    drawSeqBtn('m0266', null, false);
    if (!backEnabled()) return;
    const hov = isSticky(state.mscreen, 'gback');
    drawSeqBtn('m0011', 'm0012', hov);
}
function menuScreenAction(b) {
    const m = state.mscreen;
    if (m === 9) {
        if (b.k === 'hback') state.helpPage = (state.helpPage + 13) % 14;
        else if (b.k === 'hnext') state.helpPage = (state.helpPage + 1) % 14;
        else if (b.k === 'hdone') menuBack();
        return;
    }
    if (m === 5 || m === 7) {
        // Arrows adjust, DONE advances.
        if (b.k === 'lenL') {
            if (m === 5) lengthAdjust(-1);
            else { state.setupFlow.locationIdx = (state.setupFlow.locationIdx + 3) % 4; sfx.click(); }
        } else if (b.k === 'lenR') {
            if (m === 5) lengthAdjust(1);
            else { state.setupFlow.locationIdx = (state.setupFlow.locationIdx + 1) % 4; sfx.click(); }
        } else if (b.k === 'lenDone') {
            if (m === 5) {
                const sf = state.setupFlow;
                sf.nameSlot = 0; sf.nameBuf = '';
                for (let i = sf.humans; i < 3; i++) sf.names[i] = cpuName(i);
                state.mscreen = 6;
            } else {
                launchGame();
            }
        }
        return;
    }
    b.act();
}
function menuBack() {
    sfx.click();
    const m = state.mscreen;
    if (m === 1) { if (state.room) setRoom(null); else state.mscreen = 3; }
    else if (m === 2) { state.mscreen = 1; setRoom(null); }
    else if (m === 4) state.mscreen = 3;
    else if (m === 5) state.mscreen = (state.setupFlow && state.setupFlow.fromCount) ? 4 : 3;
    else if (m === 6) state.mscreen = 5;
    else if (m === 7) state.mscreen = 6;
    else if (m === 8) state.mscreen = 3;
    else if (m === 9 || m === 10) {
        const prev = state.prevStack.pop();
        if (prev) { state.mscreen = prev.m; if (prev.m === 1) setRoom(prev.room || null); }
        else state.mscreen = 3;
    }
}

/* -- Setup screens 4/5/6/7 (carousel backdrops, real button art) ----- */
function carouselBg() {
    const img = bgImage('car56');
    if (img) { ctx.drawImage(img, 0, 0, W, H); return true; }
    drawProceduralBg();
    return false;
}
const COUNT_BTNS = [
    { k: 'one', x: 47, y: 218, w: 71, h: 64, idle: 'm0247', act() { state.setupFlow.humans = 1; state.setupFlow.fromCount = true; state.mscreen = 5; } },
    { k: 'two', x: 455, y: 217, w: 71, h: 64, idle: 'm0250', act() { state.setupFlow.humans = 2; state.setupFlow.fromCount = true; state.mscreen = 5; } },
    { k: 'three', x: 57, y: 354, w: 71, h: 64, idle: 'm0249', act() { state.setupFlow.humans = 3; state.setupFlow.fromCount = true; state.mscreen = 5; } },
];
function drawCount() {
    carouselBg();
    for (const b of COUNT_BTNS) drawSeqBtn(b.idle, null, false);
    drawGlobals();
}
const LEN_L = { k: 'lenL', x: 233, y: 251, w: 40, h: 52, idle: 'm0057' };
const LEN_R = { k: 'lenR', x: 533, y: 251, w: 40, h: 52, idle: 'm0058' };
const LEN_DONE = { k: 'lenDone', x: 335, y: 392, w: 133, h: 87, idle: 'm0053' };
const LEN_BTNS = [LEN_L, LEN_R, LEN_DONE];
function drawLength() {
    carouselBg();
    for (const b of LEN_BTNS) drawSeqBtn(b.idle, null, state.menuHover === b);
    const sf = state.setupFlow;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText(sf.rounds + (sf.rounds > 1 ? ' ROUNDS' : ' ROUND'), W / 2, 300);
    ctx.shadowBlur = 0;
    drawGlobals();
}
function lengthAdjust(d) {
    const sf = state.setupFlow;
    sf.rounds = Math.min(5, Math.max(3, sf.rounds + d));
    sf.lengthIdx = sf.rounds;
    sfx.click();
}
const NAME_SLOTS = [
    { x: 250, y: 247, w: 262, h: 61, idle: 'm0064' },
    { x: 250, y: 284, w: 262, h: 61, idle: 'm0065' },
    { x: 250, y: 320, w: 262, h: 61, idle: 'm0066' },
    { x: 250, y: 356, w: 262, h: 61, idle: 'm0067' },
    { x: 250, y: 393, w: 262, h: 61, idle: 'm0068' },
    { x: 250, y: 428, w: 262, h: 61, idle: 'm0069' },
    { x: 250, y: 462, w: 262, h: 61, idle: 'm0070' },
];
function drawNames() {
    carouselBg();
    const sf = state.setupFlow;
    ctx.textAlign = 'left';
    for (let i = 0; i < sf.humans; i++) {
        const s = NAME_SLOTS[i];
        drawSeqBtn(s.idle, null, false);
        const txt = i < sf.nameSlot ? sf.names[i] : (i === sf.nameSlot ? sf.nameBuf + '_' : '');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Verdana, sans-serif';
        ctx.fillText(txt, s.x + 14, s.y + 39);
    }
    ctx.fillStyle = '#8fa8c8';
    ctx.font = '13px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('type a name (max 8 letters), ENTER to confirm', W / 2, 560);
    drawGlobals();
}
function commitName() {
    const sf = state.setupFlow;
    if (sf.nameBuf.trim()) sf.names[sf.nameSlot] = sf.nameBuf.trim().toUpperCase().slice(0, 8);
    sf.nameBuf = '';
    sf.nameSlot++;
    sfx.click();
    if (sf.nameSlot >= sf.humans) state.mscreen = 7;
}
function drawLocation() {
    carouselBg();
    for (const b of LEN_BTNS) drawSeqBtn(b.idle, null, state.menuHover === b);
    const sf = state.setupFlow;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText('LOCATION ' + (sf.locationIdx + 1) + ' / 4', W / 2, 300);
    ctx.shadowBlur = 0;
    drawGlobals();
}
/* -- Screen 8: list viewer (menus BMP 7) ------------------------------ */
function drawList() {
    const img = bgImage('menu8');
    if (img) ctx.drawImage(img, 0, 0, W, H);
    else drawProceduralBg();
    drawGlobals();
}
/* -- Screen 9: help (14 pages of original help text) ------------------ */
let helpPages = null;
function ensureHelp() {
    if (helpPages) return;
    helpPages = [];
    fetch('assets/help_pages.json').then(r => r.json())
        .then(j => { helpPages = j; }).catch(() => { helpPages = []; });
}
const HELP_BACK = { k: 'hback', x: 72, y: 263, w: 93, h: 27, idle: 'm0276', rol: 'm0277' };
const HELP_NEXT = { k: 'hnext', x: 640, y: 264, w: 93, h: 26, idle: 'm0280', rol: 'm0281' };
const HELP_DONE = { k: 'hdone', x: 335, y: 392, w: 133, h: 87, idle: 'm0053' };
const HELP_BTNS = [HELP_BACK, HELP_NEXT, HELP_DONE];
function drawHelp() {
    carouselBg();
    ensureHelp();
    ctx.textAlign = 'center';
    const pg = (helpPages && helpPages[state.helpPage]) || null;
    if (pg) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px Verdana, sans-serif';
        ctx.fillText(pg.title.replace(/([A-Z])/g, ' $1').trim().toUpperCase(), W / 2, 120);
        ctx.fillStyle = '#e8f0ff';
        ctx.font = '15px Verdana, sans-serif';
        let y = 160;
        for (const ln of pg.lines) {
            ctx.fillText(ln.trim().slice(0, 72), W / 2, y);
            y += 22;
            if (y > 380) break;
        }
        ctx.fillStyle = '#8fa8c8';
        ctx.font = '13px Verdana, sans-serif';
        ctx.fillText(`PAGE ${state.helpPage + 1} / ${helpPages.length}`, W / 2, 545);
    } else {
        ctx.fillStyle = '#8fa8c8';
        ctx.font = '15px Verdana, sans-serif';
        ctx.fillText('loading help...', W / 2, 300);
    }
    for (const b of HELP_BTNS) drawSeqBtn(b.idle, b.rol, isSticky(9, b.k));
    drawGlobals();
}
/* -- Screen 10: options (mxopta frame; SOUND toggle wired) ------------ */
const OPT_SOUND = { k: 'optSound', x: 282, y: 118, w: 224, h: 35 };
function drawOptions10() {
    carouselBg();
    const p = seqBtn('m0258');
    p.once = true; p.hold = true;
    p.update(frameDt); p.draw(ctx);
    ctx.fillStyle = GameAudio.muted ? '#ff8888' : '#7dff8f';
    ctx.font = 'bold 20px Verdana, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(GameAudio.muted ? 'OFF' : 'ON', 520, 145);
    drawGlobals();
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
    // Solve mode: click an unrevealed tile to move the cursor there.
    if (state.solveMode && state.solveCells) {
        const hit = solveTileHit(px, py);
        if (hit) { sfx.click(); state.solveCells.cursor = hit; }
        return;
    }
    // Consonant/vowel picks are keyboard-typed; board tile clicks move
    // the pick cursor (tile groups select). Buttons are dead while picking.
    if (state.pickingLetter || state.buyVowelMode) {
        const hit = solveTileHit(px, py);
        if (hit) { sfx.click(); state.pickCursor = hit; }
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
        const m = state.mscreen;
        if (m === 1) {
            const hov = state.menuHover || hoverAt(px, py);
            if (hov) menuActivate(hov);
            return;
        }
        let b = null;
        if (m === 3) b = btnHit(MAIN_BTNS, px, py);
        else if (m === 4) b = btnHit(COUNT_BTNS, px, py);
        else if (m === 5) b = btnHit(LEN_BTNS, px, py);
        else if (m === 7) b = btnHit(LEN_BTNS, px, py);
        else if (m === 9) b = btnHit(HELP_BTNS, px, py);
        else if (m === 10) {
            if (px >= OPT_SOUND.x && px <= OPT_SOUND.x + OPT_SOUND.w &&
                py >= OPT_SOUND.y && py <= OPT_SOUND.y + OPT_SOUND.h) {
                toggleMute();
                return;
            }
        }
        if (b) {
            sfx.click();
            menuScreenAction(b);
            return;
        }
        const g = btnHit(GLOB_BTNS, px, py);
        if (g && !(g.k === 'gback' && !backEnabled())) {
            if (g.k === 'mz') toggleMute();
            else { sfx.click(); g.act(); }
        }
        return;
    }
    // Turn buttons (original seq art + positions).
    if (!state.solveMode && !state.pickingLetter && !state.buyVowelMode) {
        if (px >= 342 && px <= 458 && py >= 279 && py <= 395) {
            pressFx('w0837'); pressFx('w0838');
            sfx.click();
            doPlayerAction(state.currentPlayer, 'spin');
            return;
        }
        if (px >= 504 && px <= 616 && py >= 326 && py <= 438) {
            pressFx('w0833');
            sfx.click();
            doPlayerAction(state.currentPlayer, 'solve');
            return;
        }
        if (px >= 195 && px <= 307 && py >= 326 && py <= 438) {
            pressFx('w0192'); pressFx('w0193');
            sfx.click();
            doPlayerAction(state.currentPlayer, 'vowel');
            return;
        }
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
    // Name entry on setup screen 6 (max 8 letters per the help text).
    if (state.screen === 'MENU' && state.mscreen === 6 && state.setupFlow) {
        const sf = state.setupFlow;
        if (key === 'ENTER') { commitName(); return; }
        if (key === 'BACKSPACE') { sf.nameBuf = sf.nameBuf.slice(0, -1); return; }
        if (/^[A-Z0-9 ]$/.test(key) && sf.nameBuf.length < 8) sf.nameBuf += key;
        return;
    }
    const p = state.players[state.currentPlayer];
    if (state.solveMode) {
        if (key === 'ESCAPE') { state.solveMode = false; state.solveCells = null; return; }
        if (key === 'ENTER') { finishSolve(); return; }
        const sc = state.solveCells;
        if (!sc || !sc.cursor) return;
        if (/^[A-Z]$/.test(key)) {
            sc.guesses[sc.cursor.si] = key;
            solveAdvance(1);
        } else if (key === 'BACKSPACE') {
            if (sc.guesses[sc.cursor.si]) delete sc.guesses[sc.cursor.si];
            else { solveAdvance(-1); delete sc.guesses[sc.cursor.si]; }
        } else if (key === ' ' || key === 'ARROWRIGHT' || key === 'ARROWLEFT') {
            solveAdvance(key === 'ARROWLEFT' ? -1 : 1);
        }
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
        // Letter-pick modes: type to echo + resolve; arrows move the
        // cursor; space accepted (no-op); ESC cancels the pick.
        if (state.pickingLetter || state.buyVowelMode) {
            if (key === 'ESCAPE') {
                state.pickingLetter = false; state.buyVowelMode = false;
                state.pickCursor = null; state.pickEcho = null;
                return;
            }
            if (key === 'ARROWLEFT' || key === 'ARROWRIGHT') {
                pickStep(key === 'ARROWLEFT' ? -1 : 1);
                return;
            }
            if (key === ' ') return;
            if (/^[A-Z]$/.test(key)) {
                if (state.pickCursor) {
                    state.pickEcho = { si: state.pickCursor.si, letter: key, until: performance.now() + 600 };
                }
                if (state.buyVowelMode) resolveVowel(state.currentPlayer, key);
                else resolveLetter(state.currentPlayer, key);
            }
            return;
        }
        // quick actions
        if (key === ' ') { doPlayerAction(state.currentPlayer, 'spin'); }
        else if (key === 'E' && state.spinValue > 0) { doPlayerAction(state.currentPlayer, 'vowel'); }
    }
}

function finishBonusSolve() {
    const guess = stateGuess.trim();
    stateGuess = '';
    if (!guess) return;
    endBonusRound(checkSolution(guess));
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
    state.mscreen = 3;
    setRoom(null);
    resetSetup();
    setMessage('', '');
}

canvas.addEventListener('mousemove', (e) => {
    if (state.screen !== 'MENU') { state.menuHover = null; return; }
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    const m = state.mscreen;
    if (m === 3) state.menuHover = btnHit(MAIN_BTNS, px, py);
    else if (m === 4) state.menuHover = btnHit(COUNT_BTNS, px, py);
    else if (m === 5 || m === 7) state.menuHover = btnHit(LEN_BTNS, px, py);
    else if (m === 9) state.menuHover = btnHit(HELP_BTNS, px, py);
    else if (m === 1) state.menuHover = hoverAt(px, py);
    else state.menuHover = btnHit(GLOB_BTNS, px, py);
    // Sticky highlight + restart on every interior mousemove (no guard).
    const st = stickyKeyFor();
    if (st) {
        state.sticky = st;
        const p = rolPlayerFor(st.scr, st.key);
        if (p) p.restart();
    }
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