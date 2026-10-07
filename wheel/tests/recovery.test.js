import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WheelGame} from '../game.js';
import {sampleScalar,clipTime,textureMatrix,animationCategory} from '../animations.js';
import {solveTiles,tileRevealed,letterAvailability,automaticView,wheelValues,nativeCameraForView} from '../presentation.js';
import {MIX} from '../audio.js';
const puzzles=[{id:1,bonus:false,category:'PHRASE',answer:'HELLO WORLD',rows:['              ',' HELLO WORLD  ','              ','              ']},{id:2,bonus:true,category:'THING',answer:'RAIN BARREL',rows:['              ',' RAIN BARREL  ','              ','              ']}];
const make=(options={})=>{const g=new WheelGame(puzzles,{random:()=>.5});g.start([{name:'Local',ai:false,slot:0},{name:'CPU',ai:true,slot:2}],'custom',options);g.collectibleSectors={Million:12,WildCard:4,FreeSpin:18};return g;};

test('cash payouts match the 24 clockwise spaces in the original wheel art',()=>{
  // Read from wheel.gfx lRound1, including both cyan $1,000 spaces.
  const round1=['LOSE A TURN',800,350,450,700,300,600,2500,600,500,300,1000,800,550,400,300,900,1000,300,900,'BANKRUPT',600,400,300];
  assert.deepEqual(wheelValues(1),round1);
  for(const r of [2,3,4]){assert.equal(wheelValues(r)[17],1000);assert.equal(wheelValues(r)[11],r===3?'MYSTERY':1000);}
  const g=make();g.state.round=3;g.state.mysteryTaken=true;
  assert.equal(g.wedges()[11].value,1000);assert.equal(g.wedges()[23].value,300);
});

test('bonus landing cuts to the recovered detail camera, not the approach shot',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../assets/presentation/cameras.json',import.meta.url)));
  assert.equal(nativeCameraForView('bonus',0,false),'cam6_bonus_wheel_front');
  assert.equal(nativeCameraForView('bonus',0,true),'cam5_bonuswheel_detail');
  for(const slot of [0,1,2]){
    assert.equal(nativeCameraForView('wheel',slot,true),`cam5_wheel_detail_player${slot}_animation_push`);
    assert.ok(catalog.cameras.some(c=>c.name===nativeCameraForView('wheel',slot,true)));
  }
  assert.ok(catalog.cameras.some(c=>c.name===nativeCameraForView('bonus',0,true)));
});

test('power arms without choosing a wedge; second press commits a bounded strength',()=>{
  const g=make();assert.equal(g.beginPower(),true);assert.equal(g.state.phase,'power');assert.equal(automaticView(g.state),'wheel');assert.equal(g.buyVowel(),false);assert.equal(g.solve('HELLO WORLD'),false);
  const h=make();assert.equal(h.restore(g.save()),true);assert.equal(h.state.phase,'action');
  assert.equal(g.beginSpin(84),12);assert.equal(g.state.spinPower,84);assert.equal(g.beginSpin(),null);
});
test('vowel exhaustion uses remaining puzzle letters, not all five used buttons',()=>{
  const g=make();g.state.used=['E'];g.player.cash=1000;assert.equal(g.buyVowel(),true);g.guess('O');
  assert.equal(letterAvailability(g.state).notice,'mcNoMoreVowels');assert.equal(g.buyVowel(),false);assert.match(g.state.message,/No more vowels/);
  g.state.used=['H','L','W','R','D'];assert.equal(letterAvailability(g.state).notice,'mcNoMoreConsonants');assert.equal(g.beginPower(),false);assert.equal(g.beginSpin(),null);assert.equal(g.buyVowel(),true);
  g.state.used=[...'HELLOWRD'];assert.equal(letterAvailability(g.state).notice,null);
});
test('jackpot grows once per spin and requires an immediate solve',()=>{
  const g=make();g.state.round=2;g.beginSpin();g.finishSpin(1);assert.equal(g.state.jackpot,5800);g.guess('L');assert.equal(g.state.jackpot,5800);
  g.beginSpin();g.finishSpin(10);g.guess('H');assert.equal(g.state.jackpotEligible,true);g.buyVowel();assert.equal(g.state.jackpotEligible,false);
});
test('all sounds have measured normalized output and true-peak headroom',async()=>{
  const report=JSON.parse(await readFile(new URL('../assets/audio/levels.json',import.meta.url)));
  assert.equal(Object.keys(report).length,36);assert.ok(MIX.ceiling<.9);assert.ok(MIX.music<MIX.effects);
  for(const [id,entry] of Object.entries(report)){assert.ok(entry.output.input_tp<=-1,id);assert.ok(entry.output.input_i<=-19,id);assert.match(entry.sourceSha256,/^[a-f0-9]{64}$/);}
});
test('baked panel maps use the compact UV flag and original opacity',async()=>{
  const m=JSON.parse(await readFile(new URL('../assets/presentation/materials.json',import.meta.url)));
  const panel=m['wof_la/screenblade_fat_leftShape0'];assert.equal(panel.textures.base.uvSet,0);assert.equal(panel.textures.dark.uvSet,1);assert.ok(Math.abs(panel.alpha-.9)<1e-5);
  const p=JSON.parse(await readFile(new URL('../assets/presentation/power-meter.json',import.meta.url)));assert.equal(p.frames.length,47);assert.ok(Math.min(...p.levels)>=10);assert.equal(Math.max(...p.levels),100);
  for(const url of [panel.textures.dark.url,p.url,'assets/presentation/mcNoMoreVowels.png','assets/presentation/mcNoMoreConsonants.png'])assert.ok((await readFile(new URL('../'+url,import.meta.url))).length>1000);
});

test('toss-ups reveal individual tiles, not all occurrences of a letter',()=>{
  const g=make({tossups:true});assert.equal(g.state.phase,'tossup');assert.equal(g.state.tossupAward,1000);
  g.state.tossupOrder=[18,19,...g.state.tossupOrder.filter(i=>i!==18&&i!==19)];g.revealTossup();
  assert.equal(tileRevealed(g.state,18,'L'),true);assert.equal(tileRevealed(g.state,19,'L'),false);
  assert.equal(solveTiles(g.state).find(t=>t.index===18).editable,false);assert.equal(solveTiles(g.state).find(t=>t.index===19).editable,true);
  assert.equal(g.buzz(0),true);const before=g.state.revealedTiles.length;g.revealTossup();assert.equal(g.state.revealedTiles.length,before);
});
test('incorrect toss-up locks only that player; correct buzzer wins bank and starting turn',()=>{
  const g=make({tossups:true});g.buzz(0);g.solve('WRONG');assert.equal(g.buzz(0),false);assert.equal(g.buzz(1),true);
  g.solve('HELLO WORLD');assert.equal(g.player.bank,1000);g.nextRound();assert.equal(g.state.tossupNumber,2);
  g.buzz(1);g.solve('HELLO WORLD');g.nextRound();assert.equal(g.state.stageType,'regular');assert.equal(g.state.turn,1);assert.equal(g.player.bank,3000);
});
test('complete four-round flow inserts the third toss-up and honors bonus toggle',()=>{
  const g=make({tossups:true,bonus:false});for(let i=0;i<2;i++){g.buzz(0);g.solve('HELLO WORLD');g.nextRound();}
  for(let i=0;i<3;i++){g.solve('HELLO WORLD');g.nextRound();}
  assert.equal(g.state.tossupNumber,3);g.buzz(1);g.solve('HELLO WORLD');g.nextRound();assert.equal(g.state.round,4);assert.equal(g.state.turn,1);
  g.solve('HELLO WORLD');g.nextRound();assert.equal(g.state.stageType,'tiebreaker');g.buzz(0);g.solve('HELLO WORLD');g.nextRound();assert.equal(g.state.phase,'finished');
});
test('custom round count and tie-breaker lead to the correct bonus contestant',()=>{
  const g=make({rounds:1,tossups:true});g.endTossup();g.nextRound();g.endTossup();g.nextRound();g.solve('HELLO WORLD');g.state.players[1].bank=1000;g.nextRound();
  assert.equal(g.state.stageType,'tiebreaker');g.buzz(1);g.solve('HELLO WORLD');g.nextRound();assert.equal(g.state.round,5);assert.equal(g.state.turn,1);
});
test('native collectible sectors award tokens once after a successful consonant',()=>{
  const g=make({collectibles:true});assert.equal(g.wedges()[4].value,'WILD CARD');g.beginSpin();g.finishSpin(4);g.guess('L');
  assert.equal(g.player.wildCard,true);assert.equal(g.state.availableCollectibles.WildCard,false);assert.equal(g.wedges()[4].value,700);
  assert.equal(g.useWildCard(),true);assert.equal(g.player.wildCard,false);assert.equal(g.state.phase,'consonant');g.guess('H');assert.equal(g.player.cash,2000);
});
test('Free Spin prompt can preserve a turn or save the token for later',()=>{
  const g=make();g.player.freeSpin=true;g.solve('WRONG');assert.equal(g.state.phase,'free-spin');assert.equal(g.state.turn,0);
  g.useFreeSpin(true);assert.equal(g.state.turn,0);assert.equal(g.player.freeSpin,false);
  g.player.freeSpin=true;g.solve('WRONG');g.useFreeSpin(false);assert.equal(g.state.turn,1);assert.equal(g.state.players[0].freeSpin,true);
});
test('Million strip has Bankrupt side thirds and cannot survive a later bankruptcy',()=>{
  const g=make({collectibles:true});g.beginSpin();g.state.landingThird=-1;assert.equal(g.landingValue(12),'BANKRUPT');
  g.finishSpin(12);assert.equal(g.state.turn,1);g.beginSpin();g.state.landingThird=0;g.finishSpin(12);g.guess('L');assert.equal(g.player.million,true);
  g.beginSpin();g.finishSpin(20);assert.equal(g.state.players[1].million,false);
});
test('Wild Card allows four bonus consonants; million replaces the high bonus prize',()=>{
  const g=make();g.player.million=true;g.player.wildCard=true;g.random=()=>.99;g.startFinal(0);assert.equal(g.state.bonusPrize,1000000);
  g.beginBonusSpin();g.finishBonusSpin();assert.equal(g.state.phase,'bonus-wildcard');g.useWildCard();
  for(const l of ['C','D','M','H','A'])assert.equal(g.guess(l),true);assert.equal(g.state.phase,'bonus-solve');assert.equal(g.state.bonusChoices.length,5);
});
test('toss-up restoration retains tile order and resets an interrupted buzz safely',()=>{
  const g=make({tossups:true});g.revealTossup();g.buzz(0);const h=make();assert.equal(h.restore(g.save()),true);assert.equal(h.state.phase,'tossup');assert.equal(h.state.revealedTiles.length,1);
  const save=JSON.parse(g.save());save.state.revealedTiles=[99];assert.equal(h.restore(JSON.stringify(save)),false);
});
test('source Hermite keys use segment tangents; clamp, loop, and ping-pong match NIF',()=>{
  assert.equal(sampleScalar({interpolation:2,keys:[{time:0,value:0,backward:1},{time:2,value:1,forward:1}]},.5),.25);
  assert.equal(sampleScalar({interpolation:1,keys:[{time:0,value:0},{time:2,value:1}]},1),.5);
  assert.equal(clipTime({start:0,stop:2,frequency:1,cycle:0},3),1);assert.equal(clipTime({start:0,stop:2,frequency:1,cycle:1},3),1);assert.equal(clipTime({start:0,stop:2,frequency:1,cycle:0},3,true),2);
  assert.deepEqual(textureMatrix({translation:[.3,.5]}),[1,-0,.3,0,1,.5,0,0,1]);
  assert.equal(animationCategory({round:5},'spin'),'bonus_spin');
});
test('all 30 native prop clips and 328 controller links are cataloged with provenance',async()=>{
  const data=JSON.parse(await readFile(new URL('../assets/presentation/animations.json',import.meta.url)));
  const clips=Object.values(data.clips).flatMap(Object.values);assert.equal(clips.length,30);assert.equal(clips.reduce((n,c)=>n+c.tracks.length,0),328);
  assert.ok(data.categories.begin_game.length>0);assert.ok(data.categories.bonus_spin.some(e=>e.actor==='wheel_bonus_rig'&&e.clamp));
  for(const clip of clips){assert.match(clip.decodedSha256,/^[a-f0-9]{64}$/);assert.ok(clip.tracks.every(t=>!t.unsupported));}
});
