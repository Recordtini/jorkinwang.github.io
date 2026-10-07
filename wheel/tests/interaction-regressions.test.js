import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {samplePower,noticeFrame,wheelLandingAngle,wheelValues} from '../presentation.js';
import {WheelGame} from '../game.js';
import {animationClamped,clipTime} from '../animations.js';
const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url)));

test('meter samples only the native lLoop segment with fixed player-color atlases',async()=>{
  const data=await load('assets/presentation/power-meter.json');
  assert.deepEqual(data.frames,Array.from({length:47},(_,i)=>73+i));
  assert.equal(data.players.length,3);assert.equal(new Set(data.players).size,3);
  assert.equal(Math.max(...data.levels),100);
  assert.ok(Math.min(...data.levels)>=10);
  assert.deepEqual(samplePower(data,-100),samplePower(data,0));
  assert.equal(samplePower(data,47*1000/30+.01).index,0);
  assert.equal(samplePower(data,28*1000/30+.01).level,100);
  for(const url of data.players)assert.ok((await readFile(new URL('../'+url,import.meta.url))).length>1000);
});

test('notices show, hold and play the native hide timeline exactly once',async()=>{
  for(const entry of Object.values(await load('assets/presentation/notices.json'))){
    assert.deepEqual(entry.frames,Array.from({length:30},(_,i)=>9+i));
    assert.equal(entry.showFrames,14);assert.equal(noticeFrame(entry,0),0);
    assert.equal(noticeFrame(entry,1000),13);
    assert.equal(noticeFrame(entry,14*1000/30+entry.holdMs+.01),14);
    assert.equal(noticeFrame(entry,30*1000/30+entry.holdMs+.01),null);
  }
});

test('circle UVs and landing angle place each native cash wedge at every player pointer',()=>{
  const geometry=new THREE.CircleGeometry(1,96),uv=geometry.getAttribute('uv'),position=geometry.getAttribute('position');
  // Vertex 25 is the image top with flipY=true, not the image bottom.
  const top=new THREE.Vector3().fromBufferAttribute(position,25);
  assert.ok(top.y>.99);assert.ok(uv.getY(25)>.99);
  const tau=Math.PI*2;
  for(const pointer of [-.93,-.36,.23])for(let i=0;i<24;i++){
    const angle=i*tau/24;
    const point=new THREE.Vector3(Math.sin(angle),Math.cos(angle),0);
    point.applyAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    point.applyAxisAngle(new THREE.Vector3(0,1,0),wheelLandingAngle(i,pointer));
    const error=Math.atan2(Math.sin(Math.atan2(point.z,point.x)-pointer),Math.cos(Math.atan2(point.z,point.x)-pointer));
    assert.ok(Math.abs(error)<1e-10,`sector ${i} pointer ${pointer}`);
  }
  geometry.dispose();
});

test('Jackpot-round $500 landing stays $500 per consonant',()=>{
  const puzzle={id:1,bonus:false,answer:'HELLO',category:'THING',rows:['              ',' HELLO        ','              ','              ']};
  const g=new WheelGame([puzzle],{random:()=>.5});g.start(['Local'],'single');g.state.round=2;
  assert.equal(wheelValues(2)[9],500);g.beginSpin();g.finishSpin(9);
  assert.match(g.state.message,/\$500 per letter/);g.guess('L');assert.equal(g.player.cash,1000);
  assert.equal(g.state.jackpotEligible,false);
});

test('original Bink alpha is packaged separately from RGB, never discarded',async()=>{
  const videos=await load('assets/presentation/screens/videos.json');
  assert.equal(videos.fireworks.alpha,true);assert.match(videos.fireworks.url,/-alpha\.mp4$/);
  for(const entry of Object.values(videos))assert.ok((await readFile(new URL('../'+entry.url,import.meta.url))).length>1000);
});

test('native board celebrations loop while other end-round actors stay clamped',async()=>{
  const data=await load('assets/presentation/animations.json');
  for(const entry of data.categories.end_round){
    const board=entry.actor.startsWith('puzzleboard_');
    assert.equal(animationClamped('end_round',entry),!board);
    if(board){
      const clip=data.clips[entry.actor][entry.clip],length=clip.stop-clip.start;
      assert.equal(clip.cycle,0);
      const time=clipTime(clip,length*20+.2,animationClamped('end_round',entry));
      assert.ok(time<clip.stop);assert.ok(time>clip.start);
    }
  }
  assert.equal(animationClamped('begin_round',{actor:'puzzleboard_inner_frame',clamp:false}),true);
  assert.equal(animationClamped('end_round',{actor:'puzzleboard_inner_frame',clamp:true}),true);
});
