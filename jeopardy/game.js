import {cpuBias,categoryKnowledge,planCpuClue,validCpuProfile,validCpuPlan} from './cpu.js?v=20261009-native-cpu';
export const cash=n=>`${n<0?'-':''}$${Math.abs(n).toLocaleString('en-US')}`;
export function clueReadingSeconds(question){
  const words=String(question??'').trim().split(/\s+/).filter(Boolean).length;
  // Browser reading estimate, not a recovered retail host-delivery timer.
  return Math.max(1.5,.5+words/6);
}
// Human-friendly browser pacing, not recovered retail CPU reaction times.
export function cpuBuzzDelayMs(difficulty,random=Math.random){
  const minimum={easy:6000,medium:5000,hard:4000}[difficulty]??5000;
  return minimum+random()*2000;
}
export function cpuAnswerDelayMs(difficulty,random=Math.random){
  const minimum={easy:3500,medium:3000,hard:2500}[difficulty]??3000;
  return minimum+random()*1500;
}
export const timerLightCount=(remaining,total)=>total>0?Math.max(0,Math.min(5,Math.ceil(5*remaining/total))):0;
// Row-major percentages transcribed from the user's two supplied TV heatmaps.
export const dailyDoubleWeights={
  1:[
    [.02,0,0,0,.02,.02],
    [1.77,1.08,1.45,1.10,1.37,.79],
    [5.16,3.19,4.45,4.55,4.33,3.24],
    [7.77,5.03,6.80,6.86,5.70,4.20],
    [6.58,3.90,5.72,6.27,5.26,3.39]
  ],
  2:[
    [.04,.03,.04,.03,.03,.03],
    [2.23,1.24,1.80,1.59,1.77,1.26],
    [6.06,3.77,5.22,5.01,4.89,3.65],
    [7.71,5.09,7.26,6.48,6.95,4.75],
    [4.72,2.69,4.35,4.21,3.93,3.20]
  ]
};
export function placeDailyDoubles(round,random=Math.random){
  const cells=dailyDoubleWeights[round].flatMap((row,r)=>row.map((weight,c)=>({index:c*5+r,weight}))),chosen=[];
  for(let n=0;n<round;n++){
    let target=random()*cells.reduce((sum,cell)=>sum+cell.weight,0),i=0;
    for(;i<cells.length-1;i++){if(target<cells[i].weight)break;target-=cells[i].weight;}
    chosen.push(cells[i].index);cells.splice(i,1);
  }
  return chosen;
}
export function shuffled(items,random=Math.random){
  const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;
}
export class JeopardyGame{
  constructor(content,{random=Math.random,onChange=()=>{}}={}){this.content=content;this.random=random;this.onChange=onChange;this.state=null;}
  emit(event='update'){this.onChange(this.state,event);}
  get player(){return this.state.players[this.state.turn];}
  get clue(){return this.state.active?.clue;}
  start(players,options={}){
    if(!players.length||players.length>3||players.every(p=>p.ai)||new Set(players.map(p=>p.slot)).size!==players.length||players.some(p=>!Number.isInteger(p.slot)||p.slot<0||p.slot>2))throw Error('Choose one to three podiums and at least one local player.');
    this.state={version:1,players:players.map(p=>({name:String(p.name||'Player').slice(0,18),slot:p.slot,ai:!!p.ai,score:0})).sort((a,b)=>a.slot-b.slot),round:1,turn:0,chooser:0,phase:'board',difficulty:options.difficulty??'medium',usedCategories:[],final:null,active:null,message:'Choose a category and dollar value.'};
    this.newBoard();this.emit('start');
  }
  newBoard(){
    const s=this.state,pool=this.content.filter(c=>c.clues.length>=5&&!s.usedCategories.includes(c.id));
    if(pool.length<6)throw Error('Not enough original categories for a full board.');
    s.board=shuffled(pool,this.random).slice(0,6).map(c=>({id:c.id,name:c.name,clues:c.clues.slice(0,5),played:[false,false,false,false,false]}));
    s.usedCategories.push(...s.board.map(c=>c.id));
    s.doubles=placeDailyDoubles(s.round,this.random);s.active=null;s.phase='board';
    this.prepareCpuBoard();
  }
  prepareCpuBoard({missingOnly=false}={}){
    const s=this.state;
    for(const player of s.players)if(player.ai){
      if(missingOnly&&player.cpu)continue;
      const bias=player.cpu?.bias??cpuBias(this.random);
      const knowledge=[];
      const plans=s.board.map((_,column)=>{
        const k=categoryKnowledge(s.difficulty,bias,this.random);knowledge.push(k);
        return Array.from({length:5},(_,row)=>planCpuClue(k,row,s.difficulty,{special:s.doubles.includes(column*5+row),random:this.random}));
      });
      player.cpu={bias,knowledge,plans};
    }
  }
  prepareCpuFinal(){
    const s=this.state;
    s.final.cpuPlans=s.players.map(player=>player.ai?planCpuClue(categoryKnowledge(s.difficulty,player.cpu.bias,this.random),4,s.difficulty,{special:true,random:this.random}):null);
  }
  cpuPlan(player=this.state.turn){
    const s=this.state;if(!s.players[player]?.ai||!s.active)return null;
    return s.round===3?s.final.cpuPlans[player]:s.players[player].cpu.plans[s.active.column][s.active.row];
  }
  cpuBuzzDelay(player){
    const plan=this.cpuPlan(player);
    return plan?.reflex>0?cpuBuzzDelayMs(this.state.difficulty,()=>Math.min(1,plan.reflex)):null;
  }
  cpuChoice(player=this.state.turn){
    const plan=this.cpuPlan(player);if(!plan)return -1;
    return this.state.choices.indexOf(this.clue.options[plan.answerIndex]);
  }
  select(column,row){
    const s=this.state;if(s.phase!=='board'||!Number.isInteger(column)||!Number.isInteger(row)||!s.board[column]||row<0||row>4||s.board[column].played[row])return false;
    s.turn=s.chooser;s.result=null;const category=s.board[column];category.played[row]=true;
    s.active={column,row,category:category.name,clue:category.clues[row],value:(row+1)*200*s.round,double:s.doubles.includes(column*5+row),locked:[]};
    s.phase=s.active.double?'wager':'reading';s.message=s.active.double?'Daily Double! Choose your wager.':'Read the clue. The buzzers will open after the reveal.';
    this.emit(s.active.double?'daily-double':'clue');return true;
  }
  maxWager(){return this.state.phase==='final-wager'?Math.max(0,this.player.score):Math.max(this.player.score,this.state.round*1000);}
  trueDailyDouble(){return this.state.phase==='wager'&&this.player.score>0?this.wager(this.player.score):false;}
  wager(amount){
    const s=this.state;if(!['wager','final-wager'].includes(s.phase)||!Number.isInteger(amount)||amount<0||amount>this.maxWager()||(s.phase==='wager'&&amount<1))return false;
    if(s.phase==='final-wager'){
      s.final.wagers[s.turn]=amount;
      const next=s.final.eligible.find(i=>s.final.wagers[i]===null);
      if(next!==undefined){s.turn=next;s.message=`${this.player.name}, enter your secret Final Jeopardy wager.`;this.emit();}
      else{s.active={category:s.final.category.name,clue:s.final.category.clues[0],value:0,double:false,locked:[]};s.phase='final-reading';s.message='Final Jeopardy. Read the clue before answering.';this.emit('clue');}
    }else{s.active.value=amount;s.phase='reading';s.message='Daily Double: only the selecting player responds.';this.emit('clue');}
    return true;
  }
  openBuzzers(){
    const s=this.state;if(s.phase==='final-reading'){s.turn=s.final.eligible.find(i=>s.final.answers[i]===null);this.openAnswer('final-answer');return true;}
    if(s.phase!=='reading')return false;
    if(s.active.double)this.openAnswer();else{s.phase='buzz';s.message='Buzz in!';this.emit('buzz-open');}return true;
  }
  buzz(player){
    const s=this.state;if(s.phase!=='buzz'||!Number.isInteger(player)||!s.players[player]||s.active.locked.includes(player))return false;
    s.turn=player;this.openAnswer();return true;
  }
  openAnswer(phase='answer'){
    this.state.result=null;this.state.choices=shuffled(this.clue.options,this.random);this.state.phase=phase;
    this.state.message=`${this.player.name}: ${this.clue.prefix}...`;this.emit('answer');
  }
  answer(index,timedOut=false){
    const s=this.state;if(!['answer','final-answer'].includes(s.phase)||!Number.isInteger(index)||!s.choices[index])return false;
    const correct=s.choices[index]===this.clue.answer;
    if(s.phase==='final-answer'){
      s.final.answers[s.turn]=correct;s.phase='final-pass';s.message='Response locked. Pass to the next contestant.';this.emit('locked');return true;
    }
    this.player.score+=correct?s.active.value:-s.active.value;
    s.result={correct,player:s.turn,amount:s.active.value,response:timedOut?null:s.choices[index],timedOut};
    if(correct){s.chooser=s.turn;s.phase='result';s.message=`Correct. ${this.clue.prefix} ${this.clue.answer}.`;}
    else{
      s.active.locked.push(s.turn);s.phase=s.active.double||s.active.locked.length===s.players.length?'result':'rebound';
      s.message=s.phase==='result'?`The correct response: ${this.clue.prefix} ${this.clue.answer}.`:'Incorrect. The remaining contestants may buzz in.';
    }
    this.emit(correct?'correct':'incorrect');return correct;
  }
  timeout(){
    const s=this.state;
    if(s.phase==='buzz'){s.phase='result';s.message=`The correct response: ${this.clue.prefix} ${this.clue.answer}.`;this.emit('timeout');return true;}
    if(s.phase==='answer'){const wrong=s.choices.findIndex(c=>c!==this.clue.answer);this.answer(wrong,true);return true;}
    if(s.phase==='final-answer'){s.final.answers[s.turn]=false;s.phase='final-pass';s.message='Time expired. Pass to the next contestant.';this.emit('locked');return true;}return false;
  }
  next(){
    const s=this.state;
    if(s.phase==='rebound'){s.phase='buzz';s.message='Remaining contestants: buzz in.';this.emit('buzz-open');return;}
    if(s.phase==='result'){
      s.active=null;s.result=null;s.turn=s.chooser;
      s.phase=s.board.every(c=>c.played.every(Boolean))?'round-end':'board';s.message=s.phase==='round-end'?'The board is complete. Continue to the next round.':'Choose the next clue.';this.emit('board');return;
    }
    if(s.phase==='round-end'){
      if(s.round===1){s.round=2;s.chooser=s.players.reduce((best,p,i)=>p.score<s.players[best].score?i:best,0);s.turn=s.chooser;this.newBoard();s.message='Double Jeopardy! The lowest score selects first.';this.emit('round');}
      else this.startFinal();return;
    }
    if(s.phase==='final-pass'){
      const next=s.final.eligible.find(i=>s.final.answers[i]===null);
      if(next!==undefined){s.turn=next;this.openAnswer('final-answer');}
      else{
        for(const i of s.final.eligible)s.players[i].score+=(s.final.answers[i]?1:-1)*s.final.wagers[i];
        s.phase='finished';s.message=`Final response: ${this.clue.prefix} ${this.clue.answer}.`;this.emit('finish');
      }
    }
  }
  startFinal(){
    const s=this.state,eligible=s.players.map((p,i)=>p.score>0?i:null).filter(i=>i!==null);
    if(!eligible.length){s.phase='finished';s.message='No contestants have a positive score for Final Jeopardy.';this.emit('finish');return;}
    const pool=this.content.filter(c=>c.clues.length===1);if(!pool.length)throw Error('No original Final Jeopardy categories.');
    s.round=3;s.final={category:pool[Math.floor(this.random()*pool.length)],eligible,wagers:s.players.map(()=>null),answers:s.players.map(()=>null)};
    this.prepareCpuFinal();
    s.turn=eligible[0];s.phase='final-wager';s.message=`${this.player.name}, enter your secret Final Jeopardy wager.`;this.emit('final');
  }
  reveal(){
    const s=this.state;if(!s.active||!['reading','buzz','answer','rebound','wager','final-answer','final-reading','final-pass'].includes(s.phase))return false;
    s.result=null;s.phase=s.round===3?'finished':'result';s.message=`Revealed: ${this.clue.prefix} ${this.clue.answer}. No additional points awarded.`;this.emit('reveal');return true;
  }
  save(){return JSON.stringify(this.state);}
  restore(text){
    try{
      const s=JSON.parse(text);if(s.version!==1||!Array.isArray(s.players)||s.players.length<1||s.players.length>3||s.players.every(p=>p.ai)||s.players.some(p=>!Number.isInteger(p.slot)||p.slot<0||p.slot>2||!Number.isFinite(p.score))||!Array.isArray(s.board)||s.board.length!==6||!s.board.every(c=>this.content.some(p=>p.id===c.id)&&c.played?.length===5))return false;
      if(new Set(s.players.map(p=>p.slot)).size!==s.players.length||![1,2,3].includes(s.round)||!s.players[s.chooser]||!s.board.every(c=>c.played.every(p=>typeof p==='boolean')&&this.content.find(p=>p.id===c.id).clues.length>=5))return false;
      if(!['board','wager','reading','buzz','answer','result','rebound','round-end','final-wager','final-reading','final-answer','final-pass','finished'].includes(s.phase)||!s.players[s.turn])return false;
      if(!Array.isArray(s.usedCategories)||!Array.isArray(s.doubles)||s.doubles.some(i=>!Number.isInteger(i)||i<0||i>=30))return false;
      if(s.round===3&&(!s.final||!Array.isArray(s.final.eligible)||s.final.eligible.some(i=>!s.players[i])||s.final.wagers.length!==s.players.length||s.final.answers.length!==s.players.length))return false;
      if(s.players.some(p=>p.ai&&p.cpu!==undefined&&!validCpuProfile(p.cpu)))return false;
      if(s.final?.cpuPlans!==undefined&&(!Array.isArray(s.final.cpuPlans)||s.final.cpuPlans.length!==s.players.length||s.final.cpuPlans.some((plan,i)=>s.players[i].ai?!validCpuPlan(plan):plan!==null)))return false;
      for(const c of s.board){const source=this.content.find(p=>p.id===c.id);c.clues=source.clues.slice(0,5);c.name=source.name;}
      if(s.final)s.final.category=this.content.find(c=>c.id===s.final.category.id&&c.clues.length===1);
      if(s.active){s.active.clue=s.round===3?s.final.category.clues[0]:s.board[s.active.column].clues[s.active.row];}
      if(s.phase==='answer')s.phase='reading';if(s.phase==='final-answer')s.phase='final-reading';
      this.state=s;
      // Migrate old saves once; new saves retain planned passes and answers.
      if(s.players.some(p=>p.ai&&!p.cpu))this.prepareCpuBoard({missingOnly:true});
      if(s.final&&!s.final.cpuPlans)this.prepareCpuFinal();
      this.emit('restore');return true;
    }catch{return false;}
  }
}
