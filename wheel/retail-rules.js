// Recovered from NPUA80137's PPU executable. Addresses and caveats:
// RETAIL-RULES.md. Angles here adapt native degrees to the exported wheel art.
export const TAU = Math.PI * 2;
export const SPIN_SETTINGS = Object.freeze({MinTime:4,MaxTime:7,MinRange:1.1,MaxRange:2.6,Slop:.1});
export const CPU_SOLVE_DELAY = 2000;
export const FLIPPERS = [[6.755,-1.713],[7.18,-1.153],[7.214,-.427]];
export const wrapAngle = angle => ((angle % TAU) + TAU) % TAU;
export function wheelPointer(slot) {
  const [x,z]=FLIPPERS[slot];
  return Math.atan2(z+.713909,x-6.012678);
}
export function wheelLanding(angle,slot=0) {
  const coordinate=(angle+Math.PI/2+wheelPointer(slot))*72/TAU;
  const spoke=((Math.floor(coordinate+.5)%72)+72)%72;
  const index=Math.floor((spoke+1)/3)%24;
  const third=((spoke-index*3+73)%72)-1;
  return {spoke,index,third};
}
export function spinPlan(power,from=0,settings=SPIN_SETTINGS,random=Math.random) {
  const s=Object.fromEntries(Object.entries(SPIN_SETTINGS).map(([key,value])=>[key,Number(settings[key]??value)]));
  const level=Math.max(10,Math.min(100,Number.isFinite(Number(power))?Math.trunc(Number(power)):55));
  const f=Math.fround,slop=f(s.Slop);
  // Retail sends the blended range in a five-decimal network command.
  const range=f(Number(Math.max(.01,Math.min(1,f(f(f(level/100)*f(1-slop))+random()*slop))).toFixed(5)));
  const duration=f(f(range*f(f(s.MaxTime)-f(s.MinTime)))+f(s.MinTime))*1000;
  const turns=f(f(range*f(f(s.MaxRange)-f(s.MinRange)))+f(s.MinRange));
  return {power:level,range,duration,turns,from:wrapAngle(from),to:wrapAngle(from)+turns*TAU};
}
export function spinAngle(plan,elapsed) {
  const t=Math.max(0,Math.min(1,elapsed/plan.duration));
  return plan.from+(plan.to-plan.from)*(1-(1-t)**4);
}
export function cpuSpinPower(random=Math.random) {return 10+Math.floor(random()*91);}

export const BONUS_PRIZES = Object.freeze([30000,35000,40000,45000,50000,100000]
  .flatMap(prize=>[25000,25000,25000,25000,25000,25000,prize,prize]));
export function bonusPrize(random=Math.random,million=false) {
  const prize=BONUS_PRIZES[Math.floor(random()*48)];
  return million&&prize===100000?1000000:prize;
}

const ORDERS={vowels:'EAIOU',consonants:'RTNSLCDPMHGBFYWKVXZJQ'};
const BANDS={
  easy:{vowels:[[0,4]],consonants:[[0,9],[10,20]],base:.7,spread:.3,knowledge:.1},
  medium:{vowels:[[0,2],[3,4]],consonants:[[0,6],[7,13],[14,20]],base:.6,spread:.4,knowledge:.2},
  hard:{vowels:[[0,1],[3,4]],consonants:[[0,4],[5,9],[10,14],[15,20]],base:.5,spread:.4,knowledge:.3},
};
export function cpuProfile(difficulty='medium',random=Math.random) {
  const bands=BANDS[difficulty]??BANDS.medium,profile={};
  for(const kind of ['vowels','consonants']){
    const letters=[...ORDERS[kind]];
    for(const [start,end] of bands[kind])for(let pass=0;pass<3;pass++)for(let i=start;i<=end;i++){
      const j=start+Math.floor(random()*(end-start+1));
      [letters[i],letters[j]]=[letters[j],letters[i]];
    }
    profile[kind]=letters.join('');
  }
  const f=Math.fround,solve=f(f(bands.base)+random()*f(bands.spread));
  return {...profile,solve,knowledge:bands.knowledge,buyVowel:f(solve*f(.4)),freeSpin:f(solve*f(.5)),wildCard:f(solve*f(.8)),mystery:f(solve*f(.75))};
}
export function validCPUProfile(profile) {
  return profile&&Object.entries(ORDERS).every(([kind,order])=>typeof profile[kind]==='string'&&[...profile[kind]].sort().join('')===[...order].sort().join(''))
    &&['solve','knowledge','buyVowel','freeSpin','wildCard','mystery'].every(key=>Number.isFinite(profile[key])&&profile[key]>=0&&profile[key]<=1);
}
export function revealedFraction(state) {
  if(['tossup','tiebreaker'].includes(state.stageType))return state.tossupOrder.length?state.revealedTiles.length/state.tossupOrder.length:1;
  const letters=[...state.puzzle.answer.toUpperCase()].filter(l=>/^[A-Z]$/.test(l));
  return letters.length?letters.filter(l=>state.used.includes(l)).length/letters.length:1;
}
export function cpuLetter(state,profile,available,random=Math.random) {
  const vowel=state.phase==='vowel'||state.phase==='bonus-select'&&state.bonusChoices.filter(l=>!/[AEIOU]/.test(l)).length>=(state.bonusConsonants??3);
  const ordered=[...profile[vowel?'vowels':'consonants']].filter(l=>available.includes(l));
  if(!vowel&&state.phase!=='bonus-select'&&random()<profile.knowledge){
    const known=ordered.find(l=>state.puzzle.answer.toUpperCase().includes(l));
    if(known)return known;
  }
  return ordered[0];
}
export function cpuAction(state,profile) {
  const ratio=revealedFraction(state);
  if(ratio>=profile.solve)return 'solve';
  const vowels=[...state.puzzle.answer.toUpperCase()].some(l=>/[AEIOU]/.test(l)&&!state.used.includes(l));
  const consonants=[...state.puzzle.answer.toUpperCase()].some(l=>/[B-DF-HJ-NP-TV-Z]/.test(l)&&!state.used.includes(l));
  // Retail first checks whether buying is permitted, then compares reveal progress.
  if(vowels&&state.players[state.turn].cash>=250&&(!consonants||ratio>=profile.buyVowel))return 'vowel';
  if(!consonants)return 'solve'; // Browser safety fallback when no affordable action remains.
  return 'spin';
}
