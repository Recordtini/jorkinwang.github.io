import test from 'node:test';
import assert from 'node:assert/strict';
import {spinPlan,spinAngle,wheelLanding,wheelPointer,wrapAngle,TAU,cpuSpinPower,BONUS_PRIZES,bonusPrize,cpuProfile,validCPUProfile,cpuLetter,cpuAction,revealedFraction,CPU_SOLVE_DELAY} from '../retail-rules.js';
import {wheelLandingAngle,automaticView,displayLetters} from '../presentation.js';
import {WheelGame} from '../game.js';
const puzzles=[{id:0,bonus:false,category:'PHRASE',answer:'HELLO WORLD',rows:['              ',' HELLO WORLD  ','              ','              ']},{id:1,bonus:true,category:'THING',answer:'RAIN BARREL',rows:['              ','    RAIN      ','   BARREL     ','              ']}];
const close=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function game(){const g=new WheelGame(puzzles,{random:()=>.5});g.start([{name:'A',slot:0,ai:false},{name:'CPU',slot:2,ai:true}],'custom');return g;}

test('retail power blend and SCX travel replace random target snapping',()=>{
  assert.equal(CPU_SOLVE_DELAY,2000);
  const low=spinPlan(10,0,undefined,()=>0),high=spinPlan(100,0,undefined,()=>.99999);
  close(low.range,.09);close(low.duration,4270,.001);close(low.turns,1.235);
  close(high.range,1);close(high.duration,7000,.001);close(high.turns,2.6);
  const mid=spinPlan(55,0,undefined,()=>.5);close(mid.range,.545);close(mid.duration,5635,.001);close(mid.turns,1.9175);
  close(spinAngle(mid,0),0);close(spinAngle(mid,mid.duration/2),mid.to*15/16);close(spinAngle(mid,mid.duration+100),mid.to);
  assert.ok(spinAngle(mid,100)>spinAngle(mid,mid.duration-100)-spinAngle(mid,mid.duration-200));
});
test('stage overrides and float clamping apply to both wheel types',()=>{
  const settings={MinTime:2,MaxTime:3,MinRange:1,MaxRange:2,Slop:0};
  const plan=spinPlan(50,TAU*10+1,settings,()=>.9);
  close(plan.duration,2500);close(plan.turns,1.5);close(plan.from,1);
  assert.equal(spinPlan(999,0,settings).power,100);assert.equal(spinPlan(-20,0,settings).power,10);
  assert.equal(cpuSpinPower(()=>0),10);assert.equal(cpuSpinPower(()=>.99999),100);
});
test('continuous physical landing matches every art wedge and all 72 spokes at three flippers',()=>{
  for(let slot=0;slot<3;slot++)for(let index=0;index<24;index++)for(const third of [-1,0,1]){
    const angle=wheelLandingAngle(index,wheelPointer(slot),third);
    assert.deepEqual(wheelLanding(angle,slot),{index,third,spoke:(index*3+third+72)%72});
    assert.equal(wheelLanding(angle+TAU*9,slot).index,index);
    assert.equal(wheelLanding(angle-TAU*9,slot).third,third);
  }
});
test('game payouts are derived from continuous rotation and preserve successive spin angles',()=>{
  const g=game();g.state.turn=1;
  const index=g.beginSpin(84),plan=g.state.spinPlan;
  assert.equal(index,wheelLanding(plan.to,2).index);assert.equal(g.state.landingThird,wheelLanding(plan.to,2).third);
  g.finishSpin(index);close(g.state.wheelAngle,wrapAngle(plan.to));
  g.state.phase='action';const angle=g.state.wheelAngle;g.beginSpin(25);close(g.state.spinPlan.from,angle);
});
test('bonus prize table is 48 weighted entries, independent of physical spin',()=>{
  assert.equal(BONUS_PRIZES.length,48);assert.equal(BONUS_PRIZES.filter(p=>p===25000).length,36);
  for(const p of [30000,35000,40000,45000,50000,100000])assert.equal(BONUS_PRIZES.filter(v=>v===p).length,2);
  for(let i=0;i<48;i++)assert.equal(bonusPrize(()=>(i+.5)/48),BONUS_PRIZES[i]);
  assert.equal(bonusPrize(()=>47.5/48,true),1000000);assert.equal(bonusPrize(()=>.001,true),25000);
  const g=game();g.startFinal(0);const prize=g.state.bonusPrize;
  assert.equal(g.beginPower(),true);assert.equal(automaticView(g.state),'bonus');assert.deepEqual(displayLetters(g.state),[]);
  assert.equal(g.beginSpin(73),null);
  assert.equal(g.beginBonusSpin(73),true);g.finishBonusSpin();assert.equal(g.state.bonusPrize,prize);
  close(g.state.bonusAngle,wrapAngle(g.state.bonusPlan.to));assert.equal(g.state.phase,'bonus-select');
});
test('native difficulty profiles retain letter bands, hard fixed I, and source thresholds',()=>{
  const bands={easy:[[0,9],[10,20]],medium:[[0,6],[7,13],[14,20]],hard:[[0,4],[5,9],[10,14],[15,20]]},original='RTNSLCDPMHGBFYWKVXZJQ';
  for(const difficulty of Object.keys(bands)){
    let seed=123456;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
    const p=cpuProfile(difficulty,random);assert.ok(validCPUProfile(p));
    for(const [a,b] of bands[difficulty])assert.equal([...p.consonants.slice(a,b+1)].sort().join(''),[...original.slice(a,b+1)].sort().join(''));
    if(difficulty==='hard')assert.equal(p.vowels[2],'I');
    close(p.buyVowel,p.solve*.4);close(p.freeSpin,p.solve*.5);close(p.wildCard,p.solve*.8);close(p.mystery,p.solve*.75);
  }
  close(cpuProfile('easy',()=>0).solve,.7);close(cpuProfile('medium',()=>0).solve,.6);close(cpuProfile('hard',()=>0).solve,.5);
  assert.equal(validCPUProfile({...cpuProfile(),vowels:'AAAAA'}),false);
});
test('CPU knowledge chance only skips absent consonants, never biases bonus letters or vowels',()=>{
  const g=game(),p={...cpuProfile('hard',()=>0),consonants:'RTNSLCDPMHGBFYWKVXZJQ',vowels:'EAIOU'};
  g.state.phase='consonant';assert.equal(cpuLetter(g.state,p,['T','N','L'],()=>.99),'T');assert.equal(cpuLetter(g.state,p,['T','N','L'],()=>0),'L');
  g.state.phase='vowel';assert.equal(cpuLetter(g.state,p,['A','I','O'],()=>0),'A');
  g.state.phase='bonus-select';g.state.bonusChoices=[];assert.equal(cpuLetter(g.state,p,['T','N','L','A'],()=>0),'T');
  g.state.bonusChoices=['C','D','M'];assert.equal(cpuLetter(g.state,p,['A','I','O'],()=>0),'A');
});
test('CPU buys at $250 and solves at its reveal threshold, counting tile occurrences',()=>{
  const g=game(),p={...cpuProfile('hard',()=>0),solve:.7,buyVowel:.3};
  assert.equal(cpuAction(g.state,p),'spin');g.state.used=['L'];g.player.cash=250;
  close(revealedFraction(g.state),.3);assert.equal(cpuAction(g.state,p),'vowel');
  g.player.cash=249;assert.equal(cpuAction(g.state,p),'spin');
  g.state.used=['H','E','L','O'];assert.equal(cpuAction(g.state,p),'solve');
  g.state.stageType='tossup';g.state.tossupOrder=[1,2,3,4,5];g.state.revealedTiles=[1,3];assert.equal(revealedFraction(g.state),.4);
});
test('saved CPU personality and completed wheel orientation survive reload; interrupted plans do not',()=>{
  const g=game(),profile=g.state.players[1].cpu;g.state.wheelAngle=1.234;
  g.beginSpin(60);const h=game();assert.equal(h.restore(g.save()),true);assert.deepEqual(h.state.players[1].cpu,profile);
  close(h.state.wheelAngle,1.234);assert.equal(h.state.phase,'action');assert.equal(h.state.spinPlan,undefined);
  g.startFinal(0);g.beginPower();assert.equal(h.restore(g.save()),true);assert.equal(h.state.phase,'bonus-spin');
});
