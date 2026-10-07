// Ported ordering/timing from puzzleboard.gfx: doShowWhitePanels,
// doFindLetters, doShowFoundLetters, and handlePuzzleSolved.
export function displayLetters(state) {
  if(['tossup','tiebreaker'].includes(state.stageType))return [];
  if (state.round !== 5) return [...state.used];
  if (['bonus-spin','spinning-bonus'].includes(state.phase)) return [];
  if (state.phase === 'bonus-select') return state.used.filter(l => !state.bonusChoices.includes(l));
  return [...state.used];
}

export function boardTransition(previous, state, event, timing) {
  const used = displayLetters(state);
  const opening = !previous || previous.id !== state.puzzle.id || ['start','round'].includes(event);
  const panels = state.puzzle.rows.flatMap((row,r) => [...row].map((letter,c) => ({r,c,letter,index:r*14+c}))).filter(p=>p.letter!==' ');
  const changes = panels.filter(p=>!/[A-Z]/.test(p.letter) || used.includes(p.letter));
  if (opening) {
    const ordered = panels.toSorted((a,b)=>a.c-b.c || a.r-b.r);
    const delay = event === 'restore' ? 0 : 1100;
    const tiles = ordered.map((p,i)=>({...p,at:delay+i*timing.mTimeBetweenClearLetters,kind:'open'}));
    return {opening:true,used,tiles,duration:delay+ordered.length*timing.mTimeBetweenClearLetters+240};
  }
  const fresh = changes.filter(p=>/[A-Z]/.test(p.letter)&&!previous.used.includes(p.letter));
  const solved = ['round-over','finished','tossup-over'].includes(state.phase);
  const tiles = fresh.map((p,i)=>({...p,at:solved?0:timing.mTimeAfterBlue+(i+1)*timing.mTimeBetweenLetters,kind:'letter'}));
  return {opening:false,used,tiles,duration:tiles.length?(solved?300:tiles.at(-1).at+200):0};
}

export function automaticView(state, event) {
  if(['tossup','tossup-solve','tossup-over','bonus-wildcard','free-spin'].includes(state.phase))return 'board';
  if (['power','spinning'].includes(state.phase)) return 'wheel';
  if (['bonus-spin','spinning-bonus'].includes(state.phase)) return 'bonus';
  if (['consonant','vowel','bonus-select','bonus-solve','round-over','finished','mystery'].includes(state.phase)) return 'board';
  if (['letter','bonus-letters','bonus-ready','start','round','restore'].includes(event)) return 'board';
  return 'show';
}

export function cameraAutomation(current,event){
  return ['start','restore'].includes(event)?true:current;
}

export function nativeCameraForView(view,slot=0,endpoint=false){
  if(view==='wheel')return `cam5_wheel_detail_player${slot}_animation_push`;
  if(view==='bonus')return 'cam5_bonuswheel_detail';
  if(view==='show')return 'cam2_all_players_zoomed_out';
  return null;
}

export function solveTiles(state) {
  return state.puzzle.rows.flatMap((row,r)=>[...row].map((letter,c)=>{
    const editable=/[A-Z]/i.test(letter)&&!tileRevealed(state,r*14+c,letter);
    return {index:r*14+c,row:r,column:c,editable,text:editable?'':letter};
  }));
}

export function tileRevealed(state,index,letter){
  if(['tossup','tiebreaker'].includes(state.stageType))return state.revealedTiles?.includes(index)??false;
  return state.used.includes(letter.toUpperCase());
}

// Retail checks the remaining white panels, not whether every vowel button was used.
export function letterAvailability(state){
  const remaining=[...state.puzzle.answer.toUpperCase()].filter(l=>/[A-Z]/.test(l)&&!state.used.includes(l));
  const vowels=remaining.some(l=>'AEIOU'.includes(l)),consonants=remaining.some(l=>!'AEIOU'.includes(l));
  return {vowels,consonants,notice:!remaining.length?null:!vowels?'mcNoMoreVowels':!consonants?'mcNoMoreConsonants':null};
}

export function fillSolution(state, entries) {
  const tiles=solveTiles(state);
  if(tiles.some(t=>t.editable&&!/^[A-Z]$/.test(entries[t.index]??'')))return null;
  return Array.from({length:4},(_,r)=>tiles.slice(r*14,r*14+14).map(t=>t.editable?entries[t.index]:t.text).join('').trim()).filter(Boolean).join(' ');
}

export function samplePower(data,elapsed){
  const index=Math.floor(Math.max(0,elapsed)*data.fps/1000)%data.frames.length;
  return {index,level:data.levels[index]};
}

export function powerMeterFrame(data,index){
  const [left,top,right,bottom]=data.displayBounds??[0,0,data.width,data.height];
  return {x:index%data.columns*data.width+left,y:Math.floor(index/data.columns)*data.height+top,width:right-left,height:bottom-top};
}

export function stageCullMatches(name,target){
  const normalize=value=>value.split('|').at(-1).replace(/[\[\].: /]/g,'').toLowerCase().replace(/shape(?=\d*$)/,'');
  const node=normalize(name),branch=normalize(target);
  // Flattened GLBs retain branch prefixes but drop the original parent nodes.
  return node===branch||node.startsWith(branch+'_')||(node.startsWith(branch)&&/^\d+$/.test(node.slice(branch.length)));
}

export function categoryFrame(atlas,elapsed){
  return Math.min(atlas.frames.length-1,Math.floor(Math.max(0,elapsed)*atlas.fps/1000));
}

export function stageMovieSurface(model,name,material){
  return model==='wof_no'&&name==='Front_screenShape1'&&material?.textures.base?.source==='tex__screen_logo.dds';
}

export function floorOverlayOrder(bounds,floor,transparent){
  if(!transparent||bounds.max.y-bounds.min.y>.02)return 0;
  const height=bounds.min.y-floor.max.y;
  const contained=bounds.min.x>=floor.min.x-.05&&bounds.max.x<=floor.max.x+.05&&bounds.min.z>=floor.min.z-.05&&bounds.max.z<=floor.max.z+.05;
  return height>=-.01&&height<=.25&&contained?2:0;
}

export function noticeFrame(entry,elapsed){
  const show=entry.showFrames??entry.frames.length,hold=entry.holdMs??2200;
  const showMs=show*1000/entry.fps;
  if(elapsed<showMs)return Math.floor(Math.max(0,elapsed)*entry.fps/1000);
  if(elapsed<showMs+hold)return show-1;
  const index=show+Math.floor((elapsed-showMs-hold)*entry.fps/1000);
  return index<entry.frames.length?index:null;
}

export function wheelLandingAngle(index,pointer,third=0){
  return (index+third/3)*Math.PI*2/24-Math.PI/2-pointer;
}

// NiAlphaProperty uses bit 0 for blending, bit 9 for alpha testing. Merely
// having an alpha property (or an image alpha channel) does not enable blending.
export function materialAlpha(source) {
  const flags=source?.alphaFlags??0;
  return {blend:!!(flags&1),test:!!(flags&512),func:(flags>>10)&7,
    threshold:(source?.alphaThreshold??0)/255,src:(flags>>1)&15,dst:(flags>>5)&15};
}

export function nativeDepthState(source){
  const z=source.zBufferFlags,draw=source.stencilFlags===null||source.stencilFlags===undefined?1:(source.stencilFlags>>10)&3;
  return {test:z===null||z===undefined?true:!!(z&1),write:z===null||z===undefined?true:!!(z&2),
    func:z===null||z===undefined?3:(z>>2)&7,side:draw===2?1:draw===3?2:0};
}

// Source wheel clockwise from the top Lose A Turn wedge. Index and texture
// orientation share this definition, so a visual landing matches the payout.
export const RETAIL_WHEEL = ['LOSE A TURN',800,350,450,700,300,600,2500,600,500,300,1000,800,550,400,300,900,1000,300,900,'BANKRUPT',600,400,300];
export function wheelValues(round=1) {
  const values=[...RETAIL_WHEEL];
  if(round===2||round===3){values[6]='BANKRUPT';values[7]=3500;}
  if(round===2)values[10]='JACKPOT';
  if(round===3){values[11]='MYSTERY';values[23]='MYSTERY';}
  if(round>=4)values[7]=5000;
  return values;
}
