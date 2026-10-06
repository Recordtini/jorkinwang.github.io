// Ported ordering/timing from puzzleboard.gfx: doShowWhitePanels,
// doFindLetters, doShowFoundLetters, and handlePuzzleSolved.
export function displayLetters(state) {
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
  const solved = ['round-over','finished'].includes(state.phase);
  const tiles = fresh.map((p,i)=>({...p,at:solved?0:timing.mTimeAfterBlue+(i+1)*timing.mTimeBetweenLetters,kind:'letter'}));
  return {opening:false,used,tiles,duration:tiles.length?(solved?300:tiles.at(-1).at+200):0};
}

export function automaticView(state, event) {
  if (state.phase === 'spinning') return 'wheel';
  if (['bonus-spin','spinning-bonus'].includes(state.phase)) return 'bonus';
  if (['consonant','vowel','bonus-select','bonus-solve','round-over','finished','mystery'].includes(state.phase)) return 'board';
  if (['letter','bonus-letters','bonus-ready','start','round','restore'].includes(event)) return 'board';
  return 'show';
}

// Source wheel clockwise from the top Lose A Turn wedge. Index and texture
// orientation share this definition, so a visual landing matches the payout.
export const RETAIL_WHEEL = ['LOSE A TURN',800,350,450,700,300,600,2500,600,500,300,500,800,550,400,300,900,500,300,900,'BANKRUPT',600,400,300];
export function wheelValues(round=1) {
  const values=[...RETAIL_WHEEL];
  if(round===2||round===3){values[6]='BANKRUPT';values[7]=3500;}
  if(round===2)values[10]='JACKPOT';
  if(round===3){values[11]='MYSTERY';values[23]='MYSTERY';}
  if(round>=4)values[7]=5000;
  return values;
}
