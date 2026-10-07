import test from 'node:test';
import assert from 'node:assert/strict';
import {MusicDucker,RetailAudio,MIX,musicDuckRatio} from '../audio.js';

function context(){
  const param=()=>({value:1,calls:[],cancelScheduledValues(...v){this.calls.push(['cancel',...v]);},setValueAtTime(...v){this.calls.push(['set',...v]);},setTargetAtTime(...v){this.calls.push(['target',...v]);}});
  const node=extra=>({outputs:[],connect(output){this.outputs.push(output);return output;},disconnect(){this.disconnected=true;},...extra});
  return {currentTime:0,destination:node(),sources:[],resume:async()=>{},
    createGain:()=>node({gain:param()}),createDynamicsCompressor:()=>node(Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,param()]))),
    createWaveShaper:()=>node(),createBufferSource(){const s=node({start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}});this.sources.push(s);return s;}};
}

async function mixer(){
  const c=context(),old=globalThis.window;
  const a=new RetailAudio(['PuzzleWin','LetterDing','WheelClick','LetterSelect','LetterVowel','LetterConsonant','tossup','Wof8BarTheme'].map(id=>({id})));
  try{globalThis.window={AudioContext:class {constructor(){return c;}}};await a.activate();}finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
  a.buffer=async()=>({duration:1});return {a,c};
}

test('important results duck more deeply than reveals; ticks and selection do not pump music',()=>{
  for(const id of ['PuzzleWin','BonusRoundTotal','NoMoreVowels','OnlyVowelsRemain'])assert.equal(musicDuckRatio(id),.2);
  assert.ok(musicDuckRatio('LetterDing')>musicDuckRatio('PuzzleWin'));
  for(const id of ['WheelClick','LetterSelect','tossup','Wof8BarTheme'])assert.equal(musicDuckRatio(id),1);
});

test('music attacks quickly and releases smoothly after a short hold',()=>{
  const c=context(),d=new MusicDucker(c,c.destination),cue={};d.add(cue,.2);
  assert.equal(d.level(),1);c.currentTime=.06;assert.ok(d.level()<.21);
  c.currentTime=1;d.remove(cue);const low=d.level();
  assert.equal(d.level(1.1),low);assert.ok(d.level(1.4)>.85);assert.ok(d.level(2)>.997);
  assert.equal(d.active.size,0);
});

test('overlapping cues keep the strongest duck until every equal-priority cue ends',()=>{
  const c=context(),d=new MusicDucker(c,c.destination),a={},b={},weak={};
  d.add(a,.2);d.add(b,.2);d.add(weak,.65);c.currentTime=1;d.remove(a);
  assert.equal(d.envelope.target,.2);d.remove(b);assert.equal(d.envelope.target,.65);
  assert.ok(d.level(2)<.651);c.currentTime=2;d.remove(weak);assert.equal(d.envelope.target,1);
});

test('a cue arriving during recovery starts from the current gain without a jump',()=>{
  const c=context(),d=new MusicDucker(c,c.destination),a={},b={};d.add(a,.2);c.currentTime=1;d.remove(a);
  c.currentTime=1.3;const before=d.level();d.add(b,.25);assert.equal(d.level(),before);
  assert.ok(d.level(1.36)<.26);assert.equal(d.envelope.target,.25);
});

test('ducking is driven by audio time rather than wall-clock timers',()=>{
  const c=context(),d=new MusicDucker(c,c.destination),cue={};d.add(cue,.2);c.currentTime=.03;
  const frozen=d.level();for(let i=0;i<100;i++)assert.equal(d.level(),frozen);
  c.currentTime=.1;assert.ok(d.level()<frozen);
});

test('actual mixer ducks only the music bus and releases when the effect ends',async()=>{
  const {a,c}=await mixer();await a.music('Wof8BarTheme');const music=c.sources[0];
  assert.equal(music.outputs[0].gain.value,MIX.music);assert.equal(music.outputs[0].outputs[0],a.musicDucker.gain);
  await a.play('PuzzleWin');const fx=c.sources[1];assert.equal(fx.outputs[0].outputs[0],a.master);
  assert.equal(a.musicDucker.envelope.target,.2);assert.equal(a.musicSource,music);
  c.currentTime=1;fx.onended();assert.equal(a.musicDucker.envelope.target,1);assert.equal(a.active.size,0);
});

test('music mute is independent, including library previews, and preserves active ducks',async()=>{
  const {a,c}=await mixer();await a.play('PuzzleWin');await a.music('tossup');
  a.setMusicMuted(true);assert.equal(a.musicGate.gain.calls.at(-1)[1],0);assert.equal(a.musicSource,null);
  assert.equal(a.musicDucker.envelope.target,.2);a.setMusicMuted(false);await a.music('tossup');
  assert.equal(a.musicGate.gain.calls.at(-1)[1],1);assert.equal(a.musicDucker.envelope.target,.2);
  await a.play('Wof8BarTheme');assert.equal(c.sources.at(-1).outputs[0].outputs[0],a.musicDucker.gain);
});

test('muted and zero-volume effects cannot trigger a duck; wheel ticks never lower music',async()=>{
  const {a}=await mixer();a.setMuted(true);await a.play('PuzzleWin');assert.equal(a.musicDucker.active.size,0);
  a.setMuted(false);await a.play('PuzzleWin',0);assert.equal(a.musicDucker.active.size,0);
  await a.play('WheelClick');await a.play('LetterSelect');assert.equal(a.musicDucker.active.size,0);
  assert.equal(a.musicDucker.envelope.target,1);
});

test('all letter-selection cues are blocked before fetching or decoding during gameplay',async()=>{
  const {a,c}=await mixer();let decodes=0;a.buffer=async()=>{decodes++;return {duration:1};};
  for(const id of ['LetterSelect','LetterVowel','LetterConsonant'])await a.play(id);
  assert.equal(decodes,0);assert.equal(c.sources.length,0);assert.deepEqual(a.cues,[]);
  assert.equal(a.musicDucker.active.size,0);
  await a.play('LetterDing');assert.equal(decodes,1);assert.deepEqual(a.cues.map(cue=>cue.id),['LetterDing']);
});

test('suppressed selection sounds remain available only through explicit library previews',async()=>{
  const {a,c}=await mixer();
  for(const id of ['LetterSelect','LetterVowel','LetterConsonant'])await a.preview(id,.5);
  assert.deepEqual(a.cues.map(cue=>cue.id),['LetterSelect','LetterVowel','LetterConsonant']);
  assert.equal(c.sources.length,3);assert.ok(c.sources.every(source=>source.started));
});
