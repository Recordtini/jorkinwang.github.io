import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/marco/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const url=process.env.JEOPARDY_QA_URL||'http://127.0.0.1:8092/jeopardy/';
fs.mkdirSync('jeopardy/qa',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];
async function clickClue(page,column,row){
  const point=await page.evaluate(async({column,row})=>{
    const {Vector3}=await import('../wheel/vendor/three.module.js');
    const studio=window.jeopardy3d.studio,mesh=studio.boardMeshes.find(m=>m.name==='tileboard_swfShape'),g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv;
    let best=null,distance=Infinity;
    for(let i=0;i<p.count;i+=4){
      const position=new Vector3();let u=0,v=0;
      for(let j=0;j<4;j++){position.add(new Vector3().fromBufferAttribute(p,i+j));u+=uv.getX(i+j);v+=uv.getY(i+j);}
      const d=Math.abs(u/4-(column+.5)/6)+Math.abs(v/4-(140+(row+.5)*180)/1040);
      if(d<distance){distance=d;best=position.multiplyScalar(.25);}
    }
    best=mesh.localToWorld(best).project(studio.camera);const rect=studio.canvas.getBoundingClientRect();
    return {x:rect.left+(best.x+1)/2*rect.width,y:rect.top+(1-best.y)/2*rect.height};
  },{column,row});
  await page.mouse.click(point.x,point.y);
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(url);await page.locator('#lobby').waitFor({state:'visible',timeout:120000});
  await page.screenshot({path:'jeopardy/qa/lobby.png'});
  await page.selectOption('#mode','single');await page.click('#setup button[type=submit]');
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='board');
  assert.ok(await page.evaluate(()=>window.jeopardy3d.studio.motion?.track.name==='cam_animation_intro_to_clueboard'));
  const startPose=await page.evaluate(()=>window.jeopardy3d.studio.camera.position.toArray());await page.waitForTimeout(500);
  const movedPose=await page.evaluate(()=>window.jeopardy3d.studio.camera.position.toArray());assert.notDeepEqual(startPose,movedPose,'Recovered intro camera did not animate');
  await page.waitForFunction(()=>!window.jeopardy3d.studio.motion,{timeout:10000});
  assert.equal(await page.locator('#scores').count(),0);
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.cameraName),'cam_clue_board');
  await page.screenshot({path:'jeopardy/qa/board.png'});
  // Pick a normal clue, not a randomly placed Daily Double.
  const cell=await page.evaluate(()=>{const s=window.jeopardy3d.game.state;return Array.from({length:30},(_,i)=>i).find(i=>!s.doubles.includes(i));});
  await clickClue(page,Math.floor(cell/5),cell%5);
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='reading');
  assert.equal(await page.locator('#console').evaluate(e=>e.classList.contains('takeover')),true);
  await page.waitForTimeout(350);
  await page.screenshot({path:'jeopardy/qa/clue.png'});
  await page.click('#read-ready');await page.locator('#buzzers button').click();
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.cameraName),'cam_podiums_all_players_answering');
  await page.screenshot({path:'jeopardy/qa/answer.png'});
  const correct=await page.evaluate(()=>window.jeopardy3d.game.state.choices.indexOf(window.jeopardy3d.game.clue.answer));
  await page.locator('#answers button').nth(correct).click();
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.players[0].score),(cell%5+1)*200);
  await page.click('#continue');assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.board.flatMap(c=>c.played).filter(Boolean).length),1);
  await page.click('[data-view=show]');await page.screenshot({path:'jeopardy/qa/studio.png'});
  await page.click('[data-view=players]');await page.screenshot({path:'jeopardy/qa/podiums.png'});
  await page.click('#auto');assert.equal(await page.getAttribute('#auto','aria-pressed'),'true');
  await page.click('#settings');await page.click('#music');assert.equal(await page.locator('#music').textContent(),'MUSIC OFF');await page.click('#music');
  await page.click('#new-game');await page.click('#resume');assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.players[0].score),(cell%5+1)*200);
  // Validate every normalized asset decodes through the actual browser audio API.
  const decoded=await page.evaluate(async()=>{const a=window.jeopardy3d.audio;await a.activate();const result=[];for(const entry of a.entries){const buffer=await a.buffer(entry.id);result.push({id:entry.id,duration:buffer.duration,expected:entry.duration});}return result;});
  fs.writeFileSync('jeopardy/qa/audio-decode.json',JSON.stringify(decoded,null,2));
  for(const clip of decoded)assert.ok(Math.abs(clip.duration-clip.expected)<.4,`${clip.id}: ${clip.duration} vs ${clip.expected}`);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'jeopardy/qa/mobile-board.png'});
  const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,console:document.getElementById('console').getBoundingClientRect().toJSON()}));
  assert.ok(layout.width<=layout.viewport,'Mobile horizontal overflow');assert.ok(layout.console.bottom<=844,'Console extends below viewport');
  await page.waitForFunction(()=>!window.jeopardy3d.studio.motion);
  const mobileCell=await page.evaluate(()=>{const s=window.jeopardy3d.game.state;return Array.from({length:30},(_,i)=>i).find(i=>!s.doubles.includes(i)&&!s.board[Math.floor(i/5)].played[i%5]);});
  await clickClue(page,Math.floor(mobileCell/5),mobileCell%5);
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='reading');
  await page.click('#read-ready');await page.locator('#buzzers button').click();
  assert.equal(await page.locator('#answers button').count(),4);
  await page.waitForTimeout(350);
  await page.screenshot({path:'jeopardy/qa/mobile-answer.png'});
  await page.click('#clue-options');
  const beforePause=await page.evaluate(()=>window.jeopardy3d.clock.remaining);await page.waitForTimeout(600);
  assert.ok(Math.abs(beforePause-await page.evaluate(()=>window.jeopardy3d.clock.remaining))<.15,'Options did not pause answer timer');
  await page.click('#reveal');await page.click('#continue');
  await page.waitForFunction(()=>!window.jeopardy3d.studio.motion);
  const daily=await page.evaluate(()=>window.jeopardy3d.game.state.doubles[0]);
  await clickClue(page,Math.floor(daily/5),daily%5);await page.locator('#wager-form').waitFor({state:'visible'});
  await page.fill('#wager','100');await page.click('#wager-form button');await page.click('#read-ready');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.phase),'answer');
  await page.click('#clue-options');await page.click('#reveal');await page.click('#continue');
  // Fixture skips 60 clues; wagers and Final response still use real UI controls.
  await page.evaluate(()=>window.jeopardy3d.game.startFinal());
  await page.fill('#wager','0');await page.click('#wager-form button');await page.click('#read-ready');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.clock.total),30);
  await page.screenshot({path:'jeopardy/qa/mobile-final.png'});
  const finalCorrect=await page.evaluate(()=>window.jeopardy3d.game.state.choices.indexOf(window.jeopardy3d.game.clue.answer));
  await page.locator('#answers button').nth(finalCorrect).click();await page.click('#continue');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.phase),'finished');
  await page.click('#continue');await page.click('#setup button[type=submit]');
  assert.equal(await page.getAttribute('#auto','aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.motion?.track.name),'cam_animation_intro_to_clueboard');
  assert.deepEqual(errors,[]);console.log('Desktop/mobile 3D picks, answers, pause, Daily Double, Final, saved show, cameras and 33 audio decodes passed.');
}finally{await browser.close();}
