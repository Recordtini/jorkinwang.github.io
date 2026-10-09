function sample(track,frame){
  const index=Math.max(0,Math.min(track.frames.length-1,frame-1)),a=track.frames[Math.floor(index)],b=track.frames[Math.ceil(index)],u=index%1;
  return {x:a.x+(b.x-a.x)*u,alpha:a.alpha+(b.alpha-a.alpha)*u};
}
export class CategoryIntro{
  constructor(studio,canvas,data,images){
    this.studio=studio;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.data=data;this.images=images;this.active=false;
    canvas.width=1920;canvas.height=1080;
  }
  start(state,onReveal,onComplete){
    this.state=state;this.onReveal=onReveal;this.onComplete=onComplete;this.active=true;this.stage='waiting';this.time=0;this.column=0;this.revealed=0;
    this.canvas.hidden=true;this.studio.inputLocked=true;document.getElementById('skip-categories').hidden=false;
  }
  stop(complete=false){
    const callback=this.onComplete;this.onComplete=null;this.active=false;this.canvas.hidden=true;this.studio.inputLocked=false;
    document.getElementById('skip-categories').hidden=true;
    if(complete)callback?.();
  }
  tick(dt){
    if(!this.active)return;
    if(this.stage==='waiting'){
      if(this.studio.motion)return;
      this.stage='fade';this.time=0;this.canvas.hidden=false;
    }
    this.time+=dt;
    const {fps,screen,graphic,callbacks}=this.data;
    const duration=this.stage==='fade'?(callbacks.fadeIn-screen.labels.lFadeIn+1)/fps:this.stage==='slide'?(callbacks.playIn-screen.labels.lPlayIn+1)/fps:(callbacks.text-graphic.labels.lFadeIn+1)/fps;
    if(this.time>=duration){
      this.time-=duration;
      if(this.stage!=='text'){
        this.stage='text';this.revealed=this.column+1;this.onReveal(this.column);this.studio.update(this.state);
      }else if(this.column<5){this.column++;this.stage='slide';}
      else{this.stop(true);return;}
    }
    this.ctx.clearRect(0,0,1920,1080);
    if(this.stage==='slide'){
      const outgoing=sample(screen,screen.labels.lPlayOut+this.time*fps);
      this.drawCard(this.column-1,outgoing.x,1,0);
      const incoming=sample(screen,screen.labels.lPlayIn+this.time*fps);
      this.drawCard(this.column,incoming.x,1,1);
    }else if(this.stage==='fade')this.drawCard(this.column,0,sample(screen,screen.labels.lFadeIn+this.time*fps).alpha,1);
    else this.drawCard(this.column,0,1,sample(graphic,graphic.labels.lFadeIn+this.time*fps).alpha);
  }
  drawCard(column,x,alpha,graphicAlpha){
    const c=this.ctx;c.save();c.translate(x*1920,0);c.globalAlpha=alpha;
    c.drawImage(this.images.background,0,0,1920,1080);
    const words=this.state.board[column].name.toUpperCase().split(/\s+/);let lines=[],size=148;
    do{
      c.font=`${size}px "Jeopardy Category"`;lines=[''];
      for(const word of words){const i=lines.length-1,text=lines[i]?lines[i]+' '+word:word;if(c.measureText(text).width>1208&&lines[i])lines.push(word);else lines[i]=text;}
      if(lines.length*size*1.18<=584)break;size-=4;
    }while(size>28);
    c.fillStyle='#fcfafa';c.textAlign='center';c.textBaseline='middle';c.shadowColor='#000';c.shadowOffsetX=c.shadowOffsetY=17;
    lines.forEach((line,i)=>c.fillText(line,960,540+(i-(lines.length-1)/2)*size*1.18,1208));
    c.shadowOffsetX=c.shadowOffsetY=0;c.globalAlpha=alpha*graphicAlpha;
    c.drawImage(this.images[this.state.round===2?'double':'single'],263.1,148.05,1393.8,783.9);
    c.globalAlpha=alpha;c.drawImage(this.images.border,0,0,1920,1080);c.restore();
  }
}
