import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JeopardyGame,cash,clueReadingSeconds,dailyDoubleWeights,placeDailyDoubles,timerLightCount,cpuBuzzDelayMs,cpuAnswerDelayMs} from './game.js';
const content=JSON.parse(fs.readFileSync(new URL('./assets/content.json',import.meta.url)));
const players=[{name:'Local',slot:0},{name:'CPU',slot:1,ai:true},{name:'Friend',slot:2}];
function game(lineup=players){const g=new JeopardyGame(content,{random:()=>.4});g.start(lineup);return g;}
function clue(g,double=false){g.state.doubles=double?[0]:[];g.select(0,0);if(double)g.wager(500);g.openBuzzers();if(!double)g.buzz(0);}
function correct(g){return g.state.choices.indexOf(g.clue.answer);}
function finishBoard(g){for(const c of g.state.board)c.played.fill(true);g.state.phase='result';g.next();}
test('Original catalog accounts for all clues and response fields',()=>{
  assert.equal(content.length,533);assert.equal(content.reduce((n,c)=>n+c.clues.length,0),2501);
  assert.equal(content.filter(c=>c.clues.length===1).length,41);
  for(const c of content)for(const clue of c.clues){assert.equal(clue.options.length,4);assert.ok(clue.options.includes(clue.answer));assert.ok(clue.question);}
});
test('Lineups retain physical slots and reject all-CPU/duplicate slots',()=>{
  assert.equal(game([{slot:2,name:'Only'}]).player.slot,2);
  assert.throws(()=>game([{slot:0,ai:true}]));assert.throws(()=>game([{slot:0},{slot:0}]));assert.throws(()=>game([]));
});
test('Fresh boards contain six unique source categories and 30 clues',()=>{
  const g=game();assert.equal(new Set(g.state.board.map(c=>c.id)).size,6);assert.equal(g.state.doubles.length,1);
  assert.ok(g.state.board.every(c=>c.clues.length===5&&!c.played.some(Boolean)));
});
test('Buzzers stay locked during reading and cannot be stolen during answering',()=>{
  const g=game();g.state.doubles=[];g.select(0,0);assert.equal(g.buzz(0),false);g.openBuzzers();assert.equal(g.buzz(1),true);assert.equal(g.buzz(0),false);
});
test('Reading time grows with clue length, preserving a short-clue minimum',()=>{
  assert.equal(clueReadingSeconds('One word'),1.5);
  assert.equal(clueReadingSeconds(''),1.5);
  assert.equal(clueReadingSeconds(' \n One   word\t'),1.5);
  assert.equal(clueReadingSeconds(Array(15).fill('word').join(' ')),3);
  assert.equal(clueReadingSeconds(Array(27).fill('word').join(' ')),5);
  assert.ok(clueReadingSeconds(Array(60).fill('word').join(' '))>clueReadingSeconds(Array(40).fill('word').join(' ')),'Long clues hit a fixed timer cap');
});

test('CPU reaction windows give humans a head start at every difficulty',()=>{
  for(const [difficulty,minimum] of [['easy',6000],['medium',5000],['hard',4000],['unknown',5000]]){
    assert.equal(cpuBuzzDelayMs(difficulty,()=>0),minimum);
    assert.equal(cpuBuzzDelayMs(difficulty,()=>1),minimum+2000);
    assert.ok(cpuBuzzDelayMs(difficulty,()=>1)<10000,'CPU buzz happens after the round timeout');
  }
});
test('CPU thinks and highlights more slowly but can still finish within the answer clock',()=>{
  for(const [difficulty,minimum] of [['easy',3500],['medium',3000],['hard',2500],['unknown',3000]]){
    assert.equal(cpuAnswerDelayMs(difficulty,()=>0),minimum);
    assert.equal(cpuAnswerDelayMs(difficulty,()=>1),minimum+1500);
    assert.ok(cpuAnswerDelayMs(difficulty,()=>1)+3*350+1000<10000);
  }
});
test('Daily Double roulette follows each supplied heatmap cell and never repeats a clue',()=>{
  for(const round of [1,2]){
    const weights=dailyDoubleWeights[round],total=weights.flat().reduce((a,b)=>a+b,0);let cumulative=0;
    for(let row=0;row<5;row++)for(let column=0;column<6;column++){
      const weight=weights[row][column];if(weight>0){
        const picks=placeDailyDoubles(round,()=> (cumulative+weight/2)/total);
        assert.equal(picks[0],column*5+row);assert.equal(new Set(picks).size,round);
      }
      cumulative+=weight;
    }
    const counts=Array(30).fill(0);let seed=12345;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    for(let i=0;i<100000;i++){
      const picks=placeDailyDoubles(round,random);assert.equal(picks.length,round);assert.equal(new Set(picks).size,round);counts[picks[0]]++;
    }
    for(let row=0;row<5;row++)for(let column=0;column<6;column++)assert.ok(Math.abs(counts[column*5+row]/1000-weights[row][column]/total*100)<.25,`Round ${round} cell ${column},${row} distribution drifted`);
  }
  assert.deepEqual(dailyDoubleWeights[1][0],[.02,0,0,0,.02,.02]);
  assert.deepEqual(dailyDoubleWeights[2][3],[7.71,5.09,7.26,6.48,6.95,4.75]);
});
test('Five paired timer-light steps extinguish from the edges at each interval',()=>{
  for(const total of [10,30])for(let step=0;step<=5;step++)assert.equal(timerLightCount(total*(5-step)/5,total),5-step);
  assert.equal(timerLightCount(-1,10),0);assert.equal(timerLightCount(20,10),5);assert.equal(timerLightCount(1,0),0);
});
test('Category introduction and board fonts retain recovered Flash definitions',()=>{
  const intro=JSON.parse(fs.readFileSync(new URL('./assets/presentation/gui/category-timeline.json',import.meta.url)));
  assert.equal(intro.fps,30);assert.equal(intro.screen.labels.lPlayIn,11);assert.equal(intro.screen.labels.lPlayOut,121);
  assert.equal(intro.screen.frames[35].x,0);assert.equal(intro.screen.frames.at(-1).x,-1);
  assert.equal(intro.graphic.labels.lFadeIn,25);assert.equal(intro.graphic.frames[38].alpha,0);
  const fonts=fs.readFileSync(new URL('./fonts.css',import.meta.url),'utf8');
  assert.match(fonts,/font-family:'Jeopardy Score';src:url\('assets\/presentation\/tileboard\/15_Swiss911 UCm BT\.woff'/);
  assert.match(fonts,/font-family:'Jeopardy Category';src:url\('assets\/presentation\/tileboard\/37_Swiss921 BT\.woff'/);
  const timer=JSON.parse(fs.readFileSync(new URL('./assets/presentation/podiums/timer-layout.json',import.meta.url)));
  assert.equal(timer.lights.length,9);assert.equal(timer.lights.filter(light=>light.level===0).length,1,'Native shared center light changed');
});
test('Correct response awards value and gives board control to its respondent',()=>{
  const g=game();g.state.doubles=[];g.select(0,4);g.openBuzzers();g.buzz(2);g.answer(correct(g));assert.equal(g.state.players[2].score,1000);assert.equal(g.state.chooser,2);g.next();assert.equal(g.state.phase,'board');assert.equal(g.state.turn,2);assert.equal(g.select(0,4),false);
});
test('Wrong responses subtract value and lock that contestant out of rebounds',()=>{
  const g=game();clue(g);g.answer(g.state.choices.findIndex(o=>o!==g.clue.answer));assert.equal(g.player.score,-200);assert.equal(g.state.phase,'rebound');g.next();assert.equal(g.buzz(0),false);assert.equal(g.buzz(1),true);g.answer(correct(g));assert.equal(g.player.score,200);
});
test('All wrong responses return to board with original chooser',()=>{
  const g=game();clue(g);for(let i=0;i<3;i++){if(i)g.buzz(i);g.timeout();if(i<2)g.next();}assert.equal(g.state.phase,'result');g.next();assert.equal(g.state.chooser,0);assert.ok(g.state.players.every(p=>p.score===-200));
});
test('Unanswered clue times out without penalizing contestants',()=>{
  const g=game();g.state.doubles=[];g.select(0,0);g.openBuzzers();g.timeout();assert.ok(g.state.players.every(p=>p.score===0));assert.equal(g.state.phase,'result');
});
test('Daily Double bounds, sole respondent and score arithmetic',()=>{
  const g=game();g.state.doubles=[0];g.select(0,0);assert.equal(g.maxWager(),1000);assert.equal(g.wager(1001),false);assert.equal(g.wager(0),false);assert.equal(g.wager(5.5),false);assert.equal(g.wager(500),true);g.openBuzzers();assert.equal(g.state.phase,'answer');assert.equal(g.buzz(1),false);g.answer(correct(g));assert.equal(g.player.score,500);
});
test('Daily Double accepts a one-dollar wager, including from a negative score',()=>{
  const g=game();g.player.score=-200;g.state.doubles=[0];g.select(0,0);assert.equal(g.wager(1),true);g.openBuzzers();g.answer(correct(g));assert.equal(g.player.score,-199);
});
test('True Daily Double wagers the full positive score, not the house minimum',()=>{
  for(const score of [1,200,1500]){
    const g=game();assert.equal(g.trueDailyDouble(),false);g.player.score=score;g.state.doubles=[0];g.select(0,0);
    assert.equal(g.trueDailyDouble(),true);assert.equal(g.state.phase,'reading');assert.equal(g.state.active.value,score);
    assert.equal(g.trueDailyDouble(),false);g.openBuzzers();g.answer(correct(g));assert.equal(g.player.score,score*2);
  }
  for(const score of [0,-200]){
    const g=game();g.player.score=score;g.state.doubles=[0];g.select(0,0);
    assert.equal(g.trueDailyDouble(),false);assert.equal(g.state.phase,'wager');assert.equal(g.wager(1),true);
  }
  const g=game();g.player.score=1500;g.state.doubles=[0];g.select(0,0);g.trueDailyDouble();g.openBuzzers();g.timeout();assert.equal(g.player.score,0);
  g.player.score=1000;g.startFinal();assert.equal(g.trueDailyDouble(),false);
});
test('CPU result retains the actual selected response, not just the correct answer',()=>{
  const g=game();g.state.doubles=[];g.select(0,0);g.openBuzzers();g.buzz(1);
  const wrong=g.state.choices.findIndex(c=>c!==g.clue.answer),chosen=g.state.choices[wrong];g.answer(wrong);
  assert.equal(g.state.result.player,1);assert.equal(g.state.result.response,chosen);assert.equal(g.state.result.correct,false);
  g.next();g.buzz(0);g.answer(correct(g));assert.equal(g.state.result.response,g.clue.answer);g.next();assert.equal(g.state.result,null);
});
test('Timeout results never invent an NPC-selected wrong response',()=>{
  const g=game();clue(g);g.timeout();assert.equal(g.state.result.response,null);assert.equal(g.state.result.timedOut,true);
});
test('Daily Double incorrect/timeout does not open a rebound',()=>{
  const g=game();clue(g,true);g.timeout();assert.equal(g.player.score,-500);assert.equal(g.state.phase,'result');
});
test('Double Jeopardy doubles values, has two doubles and starts with lowest score',()=>{
  const g=game(),ids=g.state.board.map(c=>c.id);g.state.players[1].score=-500;finishBoard(g);g.next();assert.equal(g.state.round,2);assert.equal(g.state.chooser,1);assert.equal(g.state.doubles.length,2);assert.ok(g.state.board.every(c=>!ids.includes(c.id)));g.state.doubles=[];g.select(1,4);assert.equal(g.state.active.value,2000);
});
test('Final Jeopardy excludes nonpositive scores and caps wagers',()=>{
  const g=game();g.state.players[0].score=200;g.state.players[1].score=-100;g.state.players[2].score=0;g.startFinal();assert.deepEqual(g.state.final.eligible,[0]);assert.equal(g.wager(201),false);assert.equal(g.wager(-1),false);assert.equal(g.wager(0),true);
});
test('Final answers are locked privately and scores settle only once',()=>{
  const g=game();g.state.players.forEach(p=>p.score=1000);g.startFinal();g.wager(500);g.wager(300);g.wager(200);g.openBuzzers();g.answer(correct(g));assert.equal(g.state.players[0].score,1000);g.next();g.timeout();g.next();g.answer(correct(g));g.next();assert.deepEqual(g.state.players.map(p=>p.score),[1500,700,1200]);g.next();assert.deepEqual(g.state.players.map(p=>p.score),[1500,700,1200]);
});
test('No positive scores finishes without inventing a Final clue',()=>{const g=game();g.startFinal();assert.equal(g.state.phase,'finished');});
test('Studio reveal never grants additional points',()=>{const g=game();clue(g);g.reveal();assert.ok(g.state.players.every(p=>p.score===0));assert.equal(g.state.phase,'result');});
test('Saved games rehydrate retail clue content',()=>{
  const g=game();clue(g);const saved=JSON.parse(g.save());saved.active.clue.answer='Tampered';saved.board[0].clues=[];const restored=game();assert.ok(restored.restore(JSON.stringify(saved)));assert.equal(restored.state.phase,'reading');assert.notEqual(restored.clue.answer,'Tampered');assert.equal(restored.restore('{}'),false);
});
test('Interrupted Final resumes the first unanswered contestant, not an earlier one',()=>{
  const g=game();g.state.players.forEach(p=>p.score=1000);g.startFinal();g.wager(500);g.wager(300);g.wager(200);g.openBuzzers();g.answer(correct(g));g.next();const restored=game();assert.ok(restored.restore(g.save()));restored.openBuzzers();assert.equal(restored.state.turn,1);
});
test('Malformed and duplicate saved lineups are rejected',()=>{
  const g=game(),saved=JSON.parse(g.save());saved.players[1].slot=0;assert.equal(g.restore(JSON.stringify(saved)),false);saved.players[1].slot=1;saved.board[0].played[0]='false';assert.equal(g.restore(JSON.stringify(saved)),false);
});
test('Currency formats signed values consistently',()=>{assert.equal(cash(-1000),'-$1,000');assert.equal(cash(0),'$0');});
test('Source model, fonts, background and normalized sounds ship locally',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('./assets/manifest.json',import.meta.url))),scene=JSON.parse(fs.readFileSync(new URL('./assets/scene.json',import.meta.url)));
  assert.equal(scene.axis,'native_y_up');assert.equal(scene.cameras.length,31);
  const b=fs.readFileSync(new URL('./assets/stage5.glb',import.meta.url));assert.equal(b.toString('ascii',0,4),'glTF');const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));assert.equal(gltf.meshes.length,157);assert.equal(gltf.images.length,80);
  for(const audio of manifest.audio)assert.ok(fs.statSync(new URL(audio.url,import.meta.url)).size>0);
  for(const file of ['assets/presentation/cluecard/2_Korinna.woff','assets/presentation/cluecard/clue-background.svg','assets/presentation/cluecard/user-clue-background.png','assets/presentation/tileboard/tile-bevel.svg','assets/presentation/podiums/4_Zipty Do.woff'])assert.ok(fs.existsSync(new URL(file,import.meta.url)));
});
test('Recovered camera tracks retain native start poses and finite timing',()=>{
  const scene=JSON.parse(fs.readFileSync(new URL('./assets/scene.json',import.meta.url)));
  const {animations}=JSON.parse(fs.readFileSync(new URL('./assets/camera-animations.json',import.meta.url)));
  assert.equal(animations.length,22);
  for(const track of animations){
    const camera=scene.cameras.find(c=>c.name===track.name);assert.ok(camera,track.name);
    assert.ok(track.duration>0&&track.frames.length>1);
    assert.equal(track.frames[0].time,0);assert.ok(Math.abs(track.frames.at(-1).time-track.duration)<.0001);
    for(let axis=0;axis<3;axis++)assert.ok(Math.abs(track.frames[0].position[axis]-camera.position[axis])<.001,track.name);
    track.frames.forEach((frame,i)=>{
      assert.ok([...frame.position,...frame.forward,...frame.up,frame.time].every(Number.isFinite));
      if(i)assert.ok(frame.time>track.frames[i-1].time);
    });
  }
});
test('All three authored floors retain their gloss texture and original shading UV channels',()=>{
  const b=fs.readFileSync(new URL('./assets/stage5.glb',import.meta.url)),gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  for(const name of ['floor_topShape','floor_midShape','floor_bottomShape']){
    const node=gltf.nodes.find(n=>n.name===name);assert.ok(node,name);
    for(const primitive of gltf.meshes[node.mesh].primitives){
      const material=gltf.materials[primitive.material],position=gltf.accessors[primitive.attributes.POSITION];
      assert.equal(material.extras.nif_gloss_texture,'floor_Gloss.tga');
      const darkUV=material.extras.nif_uv_sets.dark;assert.equal(darkUV,name==='floor_bottomShape'?0:1);
      assert.ok(primitive.attributes[`TEXCOORD_${darkUV}`]!==undefined);assert.equal(material.occlusionTexture.texCoord,darkUV);
      assert.ok(position.max[1]-position.min[1]<.1,'Floor is not planar in native coordinates');assert.equal(material.alphaMode,'OPAQUE');
    }
  }
});
