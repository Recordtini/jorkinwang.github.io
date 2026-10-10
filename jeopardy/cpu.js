// NPUA80227: player bias 0x3f1d0, category knowledge 0x3f108,
// per-clue answer/reflex planning 0x3f390. See README for timing differences.
const clamp=n=>Math.max(0,Math.min(1,n));
export const cpuBias=(random=Math.random)=>random()*.5-.25;
export function categoryKnowledge(difficulty,bias,random=Math.random){
  const [offset,scale]={easy:[0,.5],medium:[.15,.6],hard:[.3,.7]}[difficulty]??[.15,.6];
  return clamp(offset+scale*(random()+bias));
}
export function planCpuClue(knowledge,row,difficulty,{special=false,random=Math.random}={}){
  const top=.6+knowledge*.29999995,bottom=.15+knowledge*.6;
  const confidence=top+(special?1:row*.25)*(bottom-top);
  const first=random(),second=random();
  // Retail consumes this draw even for a correct answer. RandInt(1,3)
  // is upper-exclusive: the wrong answer is source response 1 or 2.
  const wrongIndex=1+Math.min(1,Math.floor(random()*2));
  const answerIndex=first<confidence?0:wrongIndex;
  const extra=random(),average=(first+second)*.5;
  let reflex=0;
  if(special)reflex=.5;
  else if(confidence>average){
    const raw=1-2*(confidence-average);
    reflex=raw<.2?.1+.1*extra:raw;
    if(difficulty==='hard')reflex=reflex**3+.07;
    else if(difficulty!=='easy')reflex=reflex**2+.12;
  }
  return {answerIndex,reflex,confidence};
}
export const validCpuPlan=plan=>!!plan&&Number.isInteger(plan.answerIndex)&&plan.answerIndex>=0&&plan.answerIndex<=2&&Number.isFinite(plan.reflex)&&plan.reflex>=0&&plan.reflex<=1.12&&Number.isFinite(plan.confidence)&&plan.confidence>=0&&plan.confidence<=1;
export const validCpuProfile=profile=>!!profile&&Number.isFinite(profile.bias)&&profile.bias>=-.25&&profile.bias<=.25&&Array.isArray(profile.knowledge)&&profile.knowledge.length===6&&profile.knowledge.every(k=>Number.isFinite(k)&&k>=0&&k<=1)&&Array.isArray(profile.plans)&&profile.plans.length===6&&profile.plans.every(column=>Array.isArray(column)&&column.length===5&&column.every(validCpuPlan));
