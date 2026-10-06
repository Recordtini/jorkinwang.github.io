export const MIX = {music:.28,effects:.7,wheel:.24,ceiling:.89};

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
      this.setMuted(this.muted);
    }
    return this.context.resume().catch(()=>{});
  }
  setMuted(value){this.muted=value;if(this.master)this.master.gain.setValueAtTime(value?0:1,this.context.currentTime);}
  setMusicMuted(value){this.musicMuted=value;if(value)this.stopMusic();}
  async buffer(id){
    const entry=this.entries.find(e=>e.id===id);if(!entry)return null;
    if(!this.buffers.has(id))this.buffers.set(id,fetch(entry.url+'?v=20261006-levels').then(r=>{if(!r.ok)throw new Error('Audio asset failed: '+id);return r.arrayBuffer();}).then(b=>this.context.decodeAudioData(b)));
    return this.buffers.get(id);
  }
  async play(id,volume=1){
    if(this.muted||!this.context)return;
    const entry=this.entries.find(e=>e.id===id);if(!entry)return;
    const isMusic=['tossup','Wof8BarTheme'].includes(id);
    if(isMusic&&this.musicMuted)return;
    const buffer=await this.buffer(id);if(!buffer||this.muted||(isMusic&&this.musicMuted))return;
    const now=this.context.currentTime;
    if(id==='WheelClick'&&now-(this.lastTick??-1)<.025)return;
    if(id==='WheelClick')this.lastTick=now;
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;
    gain.gain.value=Math.max(0,Math.min(1,volume))*(isMusic?MIX.music:id==='WheelClick'?MIX.wheel:MIX.effects);
    source.connect(gain).connect(this.master);source.start();this.active.add(source);
    source.onended=()=>{this.active.delete(source);source.disconnect();gain.disconnect();};
    this.cues.push({id,time:now});if(this.cues.length>100)this.cues.shift();
  }
  async music(id){
    this.stopMusic();const generation=this.musicGeneration;
    if(this.muted||this.musicMuted||!this.context)return;
    const buffer=await this.buffer(id);if(!buffer||this.muted||this.musicMuted||generation!==this.musicGeneration)return;
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.loop=true;
    gain.gain.value=MIX.music;source.connect(gain).connect(this.master);source.start();this.musicSource=source;
    source.onended=()=>{source.disconnect();gain.disconnect();};
  }
  stopMusic(){this.musicGeneration=(this.musicGeneration??0)+1;this.musicSource?.stop();this.musicSource=null;}
}
