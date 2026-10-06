export const MIX = {music:.28,effects:.7,wheel:.24,ceiling:.89};
export const DUCK = {attack:.012,hold:.12,release:.15};

export function musicDuckRatio(id){
  if(['WheelClick','LetterSelect','tossup','Wof8BarTheme'].includes(id))return 1;
  if(['PuzzleWin','BonusRoundTotal','NoMoreVowels','OnlyVowelsRemain'].includes(id))return .2;
  if(['Bankrupt','Incorrect','TimesUp'].includes(id))return .25;
  if(id==='WofChant')return .3;
  if(id==='LandOnMysteryWedge')return .35;
  if(id==='PuzzleReveal')return .4;
  if(/Applause|Disappointment/.test(id))return .45;
  if(id==='LetterDing')return .65;
  return .5;
}

export class MusicDucker {
  constructor(context,output){
    this.context=context;this.gain=context.createGain();this.gain.connect(output);this.active=new Map();
    this.envelope={from:1,target:1,start:context.currentTime,timeConstant:DUCK.release};
  }
  level(time=this.context.currentTime){
    const e=this.envelope;
    return time<=e.start?e.from:e.target+(e.from-e.target)*Math.exp(-(time-e.start)/e.timeConstant);
  }
  add(source,ratio){if(ratio<1){this.active.set(source,ratio);this.update();}}
  remove(source){if(this.active.delete(source))this.update();}
  update(){
    const target=Math.min(1,...this.active.values());
    if(target===this.envelope.target)return;
    const now=this.context.currentTime,from=this.level(now),falling=target<from;
    const start=now+(falling?0:DUCK.hold),timeConstant=falling?DUCK.attack:DUCK.release;
    // Re-anchor the current envelope before replacing automation, including on
    // browsers without cancelAndHoldAtTime. Audio time also respects suspension.
    this.gain.gain.cancelScheduledValues(now);this.gain.gain.setValueAtTime(from,now);
    this.gain.gain.setTargetAtTime(target,start,timeConstant);
    this.envelope={from,target,start,timeConstant};
  }
}

export function protectedOutput(c){
  const master=c.createGain(),compressor=c.createDynamicsCompressor();
  compressor.threshold.value=-6;compressor.knee.value=0;compressor.ratio.value=20;compressor.attack.value=.003;compressor.release.value=.15;
  const limiter=c.createWaveShaper(),curve=new Float32Array(65537);
  for(let i=0;i<curve.length;i++)curve[i]=Math.max(-MIX.ceiling,Math.min(MIX.ceiling,2*i/(curve.length-1)-1));
  limiter.curve=curve;limiter.oversample='none';
  master.connect(compressor).connect(limiter).connect(c.destination);
  return {master,compressor,limiter};
}

// One output path protects overlapping ticks, reveals, library previews and music.
export class RetailAudio {
  constructor(entries){this.entries=entries;this.buffers=new Map();this.active=new Set();this.cues=[];this.muted=false;this.musicMuted=false;}
  activate(){
    if(!this.context){
      this.context=new (window.AudioContext||window.webkitAudioContext)();
      Object.assign(this,protectedOutput(this.context));
      this.musicGate=this.context.createGain();this.musicGate.connect(this.master);
      this.musicDucker=new MusicDucker(this.context,this.musicGate);
      this.setMuted(this.muted);
      this.setMusicMuted(this.musicMuted);
    }
    return this.context.resume().catch(()=>{});
  }
  setMuted(value){this.muted=value;if(this.master)this.master.gain.setValueAtTime(value?0:1,this.context.currentTime);}
  setMusicMuted(value){this.musicMuted=value;if(this.musicGate)this.musicGate.gain.setValueAtTime(value?0:1,this.context.currentTime);if(value)this.stopMusic();}
  async buffer(id){
    const entry=this.entries.find(e=>e.id===id);if(!entry)return null;
    if(!this.buffers.has(id))this.buffers.set(id,fetch(entry.url+'?v=20261006-levels').then(r=>{if(!r.ok)throw new Error('Audio asset failed: '+id);return r.arrayBuffer();}).then(b=>this.context.decodeAudioData(b)));
    return this.buffers.get(id);
  }
  async play(id,volume=1){
    if(this.muted||!this.context)return;
    volume=Math.max(0,Math.min(1,Number(volume)||0));if(!volume)return;
    const entry=this.entries.find(e=>e.id===id);if(!entry)return;
    const isMusic=['tossup','Wof8BarTheme'].includes(id);
    if(isMusic&&this.musicMuted)return;
    const buffer=await this.buffer(id);if(!buffer||this.muted||(isMusic&&this.musicMuted))return;
    const now=this.context.currentTime;
    if(id==='WheelClick'&&now-(this.lastTick??-1)<.025)return;
    if(id==='WheelClick')this.lastTick=now;
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;
    gain.gain.value=volume*(isMusic?MIX.music:id==='WheelClick'?MIX.wheel:MIX.effects);
    source.connect(gain).connect(isMusic?this.musicDucker.gain:this.master);
    if(!isMusic)this.musicDucker.add(source,musicDuckRatio(id));
    source.onended=()=>{this.musicDucker.remove(source);this.active.delete(source);source.disconnect();gain.disconnect();};
    source.start();this.active.add(source);
    this.cues.push({id,time:now});if(this.cues.length>100)this.cues.shift();
  }
  async music(id){
    this.stopMusic();const generation=this.musicGeneration;
    if(this.muted||this.musicMuted||!this.context)return;
    const buffer=await this.buffer(id);if(!buffer||this.muted||this.musicMuted||generation!==this.musicGeneration)return;
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.loop=true;
    gain.gain.value=MIX.music;source.connect(gain).connect(this.musicDucker.gain);source.start();this.musicSource=source;
    source.onended=()=>{source.disconnect();gain.disconnect();};
  }
  stopMusic(){this.musicGeneration=(this.musicGeneration??0)+1;this.musicSource?.stop();this.musicSource=null;}
}
