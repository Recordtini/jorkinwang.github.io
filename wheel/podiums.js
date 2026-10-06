// Native podiums.gfx presentation: original atlas UVs, glyphs and 30fps keys.
export function podiumScore(value){
  if(value<=0)return '';
  let text='$'+Math.trunc(value);
  if(text.length>4)text=text.slice(0,-3)+','+text.slice(-3);
  return text.slice(0,9);
}

export function podiumDigits(value,widths){
  const text=podiumScore(value),width=[...text].reduce((sum,c)=>sum+(widths[c]??0),0);
  let x=(widths[text[0]]??0)/2+(300-width-text.length*8)/2;
  return [...text].map(character=>{
    const digit={character,x:x-(character===','?7:0)};
    x+=(widths[character]??0)+8;
    return digit;
  });
}

export function digitFrame(mode,elapsed,index=0){
  if(mode==='out'){
    const f=elapsed-1-index*2;
    return f<0?10:f>=18?3:94+f;
  }
  if(mode==='in'){
    const f=elapsed-20-index*2;
    return f<0?3:f>=18?10:129+f;
  }
  if(mode==='final'){
    const f=elapsed-7-index*5;
    return f<0?10:f>=25?10:20+f;
  }
  return 10;
}

export function podiumEffect(event){return event==='bankrupt'?'bankrupt':event==='lose-turn'?'lose':null;}

export class PodiumDisplay {
  constructor(context,data,images){
    this.context=context;this.data=data;this.images=images;this.reset();
  }
  reset(){this.scores=[0,0,0];this.transitions=[null,null,null];this.active=null;this.nextActive=null;this.effect=null;this.turnStart=0;this.dirty=true;}
  update(state,event,time){
    if(!state){this.reset();this.draw(time);return 0;}
    const previousSlot=this.active,scores=this.scores.slice(),quick=['start','restore'].includes(event);
    if(quick)this.reset();
    const effect=podiumEffect(event),slot=state.players[state.turn].slot;
    let duration=0;
    for(let i=0;i<3;i++){
      const player=state.players.find(p=>p.slot===i),cash=(['tossup','tiebreaker'].includes(state.stageType)||state.phase==='finished'?player?.bank:player?.cash)??0;
      if(!quick&&cash!==scores[i]){
        this.transitions[i]={old:scores[i],value:cash,start:time,mode:'score'};
        duration=Math.max(duration,this.data.scoreFrames*1000/this.data.fps);
      }
      this.scores[i]=cash;
    }
    if(event==='win'&&['round-over','finished'].includes(state.phase)){
      this.transitions[slot]={value:this.scores[slot],start:time,mode:'final'};
      duration=Math.max(duration,this.data.finalFrames*1000/this.data.fps);
    }
    if(effect&&previousSlot!==null){
      this.effect={name:effect,slot:previousSlot,start:time};
      duration=Math.max(duration,this.data[effect].frames.length*1000/this.data.fps);
    }
    this.nextActive=['round-over','finished','tossup','tossup-over'].includes(state.phase)?null:slot;
    const active=this.effect?null:this.nextActive;
    if(this.active!==active){this.active=active;this.turnStart=time;}
    this.dirty=true;this.draw(time);
    return duration;
  }
  tile(name,index,x=0,y=0){
    const atlas=this.data[name];
    this.context.drawImage(this.images[name],index%atlas.columns*atlas.width,
      Math.floor(index/atlas.columns)*atlas.height,atlas.width,atlas.height,x,y,atlas.width,atlas.height);
  }
  digits(value,mode,elapsed){
    const p=this.context,atlas=this.data.glyphs;
    podiumDigits(value,this.data.widths).forEach(({character,x},i)=>{
      const key=this.data.digitKeys[digitFrame(mode,elapsed,i)-1];
      if(!key?.visible||key.alpha<=0)return;
      const index=this.data.characters.indexOf(character);
      p.save();p.translate(x,48);p.scale(1,1.0006104);p.transform(...key.matrix);p.globalAlpha=key.alpha;
      p.drawImage(this.images.glyphs,index%atlas.columns*atlas.width,Math.floor(index/atlas.columns)*atlas.height,
        atlas.width,atlas.height,...this.data.glyphOrigin,atlas.width,atlas.height);p.restore();
    });
  }
  draw(time){
    const frame=Math.floor(time*this.data.fps/1000);
    if(!this.dirty&&frame===this.frame)return false;
    if(!this.dirty&&this.active===null&&!this.effect&&!this.transitions.some(Boolean))return false;
    this.frame=frame;this.dirty=false;
    const p=this.context;p.clearRect(0,0,this.data.width,this.data.height);p.drawImage(this.images.body,0,0);
    let effect=this.effect;
    if(effect&&Math.floor((time-effect.start)*this.data.fps/1000)>=this.data[effect.name].frames.length){
      this.effect=effect=null;this.active=this.nextActive;this.turnStart=time;
    }
    for(let slot=0;slot<3;slot++){
      p.save();p.translate(this.data.slots[slot],0);p.beginPath();p.rect(0,0,300,225);p.clip();
      this.tile('backgrounds',slot);
      let transition=this.transitions[slot];
      const elapsed=transition?Math.floor((time-transition.start)*this.data.fps/1000):0;
      if(transition&&elapsed>=(transition.mode==='final'?this.data.finalFrames:this.data.scoreFrames)){
        this.transitions[slot]=transition=null;
      }
      if(transition?.mode==='score'){
        this.digits(transition.old,'out',elapsed);this.digits(transition.value,'in',elapsed);
      }else this.digits(this.scores[slot],transition?'final':'show',elapsed);
      if(effect?.slot===slot)this.tile(effect.name,Math.floor((time-effect.start)*this.data.fps/1000));
      if(this.active===slot)this.tile('turn',Math.floor((time-this.turnStart)*this.data.fps/1000)%this.data.turn.frames.length);
      p.restore();
    }
    return true;
  }
}
