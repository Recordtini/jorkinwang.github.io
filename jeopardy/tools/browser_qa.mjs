import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/marco/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const {PNG}=require('pngjs');
const url=process.env.JEOPARDY_QA_URL||'http://127.0.0.1:8092/jeopardy/';
fs.mkdirSync('jeopardy/qa',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];
async function cluePoint(page,column,row){
  return page.evaluate(async({column,row})=>{
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
}
async function clickClue(page,column,row){const point=await cluePoint(page,column,row);await page.mouse.click(point.x,point.y);}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  page.on('console',m=>{if(/shader error|GL_INVALID|feedback loop/i.test(m.text()))errors.push(m.text());});
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
  const tileSample=()=>page.evaluate(({column,row})=>Array.from(window.jeopardy3d.studio.board.ctx.getImageData(column*240+35,140+row*180+35,1,1).data),{column:Math.floor(cell/5),row:cell%5});
  const beforeHover=await tileSample(),point=await cluePoint(page,Math.floor(cell/5),cell%5);await page.mouse.move(point.x,point.y);
  assert.deepEqual(await page.evaluate(()=>window.jeopardy3d.studio.hover),{column:Math.floor(cell/5),row:cell%5});
  const afterHover=await tileSample();assert.ok(afterHover[0]>beforeHover[0]&&afterHover[1]>beforeHover[1],'Hover did not brighten tile background');
  await page.screenshot({path:'jeopardy/qa/board-hover.png'});await page.mouse.move(0,0);
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.hover),null);
  await clickClue(page,Math.floor(cell/5),cell%5);
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='reading');
  assert.equal(await page.locator('#console').evaluate(e=>e.classList.contains('takeover')),true);
  await page.waitForTimeout(350);
  await page.screenshot({path:'jeopardy/qa/clue.png'});
  assert.equal(await page.locator('#read-ready').count(),0);
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='buzz',{timeout:15000});await page.locator('#buzzers button').click();
  assert.equal(await page.locator('#clue-panel').isVisible(),true);
  assert.ok(await page.locator('#clue-panel').evaluate(e=>e.getBoundingClientRect().top<100),'Answering clue is not at the top');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.cameraName),'cam_podiums_all_players_answering');
  await page.screenshot({path:'jeopardy/qa/answer.png'});
  const correct=await page.evaluate(()=>window.jeopardy3d.game.state.choices.indexOf(window.jeopardy3d.game.clue.answer));
  await page.locator('#answers button').nth(correct).click();
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.players[0].score),(cell%5+1)*200);
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.cameraName),'cam_podiums_all_players_answering');
  assert.equal(await page.locator('#clue-panel').isVisible(),false);
  await page.screenshot({path:'jeopardy/qa/result.png'});
  assert.equal(await page.locator('#continue').isVisible(),true);
  await page.waitForTimeout(3200);
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.phase),'result','Manual result advanced without Continue');
  assert.equal(await page.evaluate(()=>document.getElementById('console').classList.contains('board-beat')),false);
  await page.click('#continue');
  await page.waitForFunction(()=>document.getElementById('console').classList.contains('board-beat'));
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.cameraName),'cam_clue_board');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.phase),'result');
  await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.phase),'result');
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='board');assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.board.flatMap(c=>c.played).filter(Boolean).length),1);
  await page.click('[data-view=show]');await page.screenshot({path:'jeopardy/qa/studio.png'});
  await page.click('[data-view=players]');await page.screenshot({path:'jeopardy/qa/podiums.png'});
  await page.click('#auto');assert.equal(await page.getAttribute('#auto','aria-pressed'),'true');
  assert.equal(await page.locator('#options #music').count(),0);
  await page.click('#music');assert.equal(await page.locator('#music').textContent(),'MUSIC OFF');await page.click('#music');await page.click('#settings');
  await page.click('#new-game');await page.click('#resume');assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.players[0].score),(cell%5+1)*200);
  const reflectionInfo=await page.evaluate(()=>window.jeopardy3d.studio.reflections.planes.map(p=>({name:p.mesh.name,height:p.uniforms.studioReflectionMatrix.value.elements.every(Number.isFinite),strength:p.strength,opaque:!p.mesh.material.transparent})));
  assert.equal(reflectionInfo.length,3);assert.ok(reflectionInfo.every(p=>p.height&&p.strength>0&&p.opaque));
  // Freeze wall time so even slow software-GPU draws detect temporal throttling.
  const reflectionFrames=await page.evaluate(()=>{
    const s=window.jeopardy3d.studio,descriptor=Object.getOwnPropertyDescriptor(performance,'now'),now=performance.now(),frames=[];
    const snapshot=()=>s.reflections.planes.map(p=>({name:p.mesh.name,matrix:p.uniforms.studioReflectionMatrix.value.toArray()}));
    Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
    try{
      s.play('cam_animation_intro_to_clueboard');
      for(let frame=0;frame<6;frame++){
        s.animateCamera(1/60);s.renderer.render(s.scene,s.camera);
        frames.push({pose:s.camera.position.toArray(),planes:snapshot()});
      }
      s.reflections.setEnabled(false);const disabled=snapshot();
      s.cut('show');s.camera.position.x+=20;s.renderer.render(s.scene,s.camera);
      frames.push({disabled,planes:snapshot()});
      s.reflections.setEnabled(true);s.renderer.render(s.scene,s.camera);
      frames.push({resumed:true,planes:snapshot()});
      s.cut('show');s.renderer.render(s.scene,s.camera);
      frames.push({cut:true,planes:snapshot()});
    }finally{
      if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
      s.reflections.setEnabled(true);s.cut('show');
    }
    return frames;
  });
  for(let frame=1;frame<6;frame++){
    assert.notDeepEqual(reflectionFrames[frame].pose,reflectionFrames[frame-1].pose);
    for(let plane=0;plane<3;plane++)assert.notDeepEqual(reflectionFrames[frame].planes[plane].matrix,reflectionFrames[frame-1].planes[plane].matrix,`${reflectionFrames[frame].planes[plane].name}: capture reused the previous camera frame`);
  }
  assert.deepEqual(reflectionFrames[6].planes,reflectionFrames[6].disabled,'Disabled reflections still captured');
  for(let plane=0;plane<3;plane++){
    assert.notDeepEqual(reflectionFrames[7].planes[plane].matrix,reflectionFrames[6].planes[plane].matrix,'Re-enabled reflection reused an old camera pose');
    assert.notDeepEqual(reflectionFrames[8].planes[plane].matrix,reflectionFrames[7].planes[plane].matrix,'Camera cut reused an old reflection');
  }
  fs.writeFileSync('jeopardy/qa/reflection-frames.json',JSON.stringify(reflectionFrames,null,2));
  await page.click('[data-view=show]');await page.waitForTimeout(250);
  await page.screenshot({path:'jeopardy/qa/reflections-on.png'});
  await page.click('#settings');await page.uncheck('#reflections');await page.click('#options .close');
  await page.screenshot({path:'jeopardy/qa/reflections-off.png'});
  const reflected=PNG.sync.read(fs.readFileSync('jeopardy/qa/reflections-on.png')),matte=PNG.sync.read(fs.readFileSync('jeopardy/qa/reflections-off.png'));
  let difference=0,samples=0;
  for(let y=Math.floor(reflected.height*.55);y<reflected.height;y++)for(let x=0;x<reflected.width;x++)for(let c=0;c<3;c++){const i=(y*reflected.width+x)*4+c;difference+=Math.abs(reflected.data[i]-matte.data[i]);samples++;}
  assert.ok(difference/samples>5,'Floor reflection toggle produced no meaningful rendered difference');
  await page.click('#settings');await page.check('#reflections');await page.click('#options .close');
  await page.click('#auto');
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
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='buzz',{timeout:15000});await page.locator('#buzzers button').click();
  assert.equal(await page.locator('#answers button').count(),4);
  await page.waitForTimeout(350);
  await page.screenshot({path:'jeopardy/qa/mobile-answer.png'});
  await page.click('#clue-options');
  const beforePause=await page.evaluate(()=>window.jeopardy3d.clock.remaining);await page.waitForTimeout(600);
  assert.ok(Math.abs(beforePause-await page.evaluate(()=>window.jeopardy3d.clock.remaining))<.15,'Options did not pause answer timer');
  await page.click('#reveal');await page.click('#continue');
  await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='board');
  await page.waitForFunction(()=>!window.jeopardy3d.studio.motion);
  const daily=await page.evaluate(()=>window.jeopardy3d.game.state.doubles[0]);
  await clickClue(page,Math.floor(daily/5),daily%5);await page.locator('#wager-form').waitFor({state:'visible'});
  assert.equal(await page.locator('#response-category').textContent(),await page.evaluate(()=>window.jeopardy3d.game.state.active.category));
  assert.ok((await page.locator('#wager-score').textContent()).includes(`SCORE $${(cell%5+1)*200}`));
  assert.equal(await page.getAttribute('#wager','min'),'1');
  assert.equal(await page.locator('#console').evaluate(e=>getComputedStyle(e).backgroundRepeat),'no-repeat');
  assert.equal(await page.locator('#answers').isVisible(),false,'Empty answer panel covers Daily Double');
  await page.screenshot({path:'jeopardy/qa/mobile-daily-double.png'});
  await page.fill('#wager','1');await page.click('#wager-form button');await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='answer',{timeout:15000});
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.phase),'answer');
  await page.click('#clue-options');await page.click('#reveal');await page.click('#continue');await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='board');
  // Fixture skips 60 clues; wagers and Final response still use real UI controls.
  await page.evaluate(()=>window.jeopardy3d.game.startFinal());
  await page.fill('#wager','0');await page.click('#wager-form button');await page.waitForFunction(()=>window.jeopardy3d.game.state.phase==='final-answer',{timeout:15000});
  assert.equal(await page.evaluate(()=>window.jeopardy3d.clock.total),30);
  await page.screenshot({path:'jeopardy/qa/mobile-final.png'});
  const finalCorrect=await page.evaluate(()=>window.jeopardy3d.game.state.choices.indexOf(window.jeopardy3d.game.clue.answer));
  await page.locator('#answers button').nth(finalCorrect).click();await page.click('#continue');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.game.state.phase),'finished');
  await page.click('#continue');await page.click('#setup button[type=submit]');
  assert.equal(await page.getAttribute('#auto','aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>window.jeopardy3d.studio.motion?.track.name),'cam_animation_intro_to_clueboard');
  await page.click('#settings');await page.click('#new-game');await page.selectOption('#mode','solo');await page.click('#setup button[type=submit]');
  await page.waitForFunction(()=>!window.jeopardy3d.studio.motion);
  // Force only the buzzer winner; the real CPU scheduler chooses and highlights its response.
  await page.evaluate(()=>{
    window.qaRandom=Math.random;Math.random=()=>.99;
    const g=window.jeopardy3d.game;g.state.doubles=[];g.select(0,0);g.openBuzzers();g.buzz(1);
    window.qaHighlightSteps=[];
    new MutationObserver(()=>{const i=[...document.querySelectorAll('#answers button')].findIndex(b=>b.classList.contains('cpu-selected'));if(i>=0&&!window.qaHighlightSteps.includes(i))window.qaHighlightSteps.push(i);}).observe(document.getElementById('answers'),{subtree:true,attributes:true,attributeFilter:['class']});
  });
  await page.waitForSelector('#answers .cpu-selected');
  const highlighted=await page.locator('#answers .cpu-selected').textContent();assert.ok(/^[ABCD]\./.test(highlighted));
  await page.screenshot({path:'jeopardy/qa/cpu-answer.png'});
  await page.waitForFunction(()=>window.jeopardy3d.game.state.result?.player===1,{timeout:8000});
  const steps=await page.evaluate(()=>window.qaHighlightSteps);assert.ok(steps.length>=3,'CPU did not walk down multiple choices');assert.deepEqual(steps,Array.from({length:steps.length},(_,i)=>i));
  await page.evaluate(()=>{Math.random=window.qaRandom;});
  assert.ok((await page.locator('#response-text').textContent()).includes(await page.evaluate(()=>window.jeopardy3d.game.state.result.response)));
  await page.screenshot({path:'jeopardy/qa/cpu-result.png'});
  await page.waitForTimeout(3200);assert.ok(['result','rebound'].includes(await page.evaluate(()=>window.jeopardy3d.game.state.phase)),'CPU result did not wait for Continue');
  await page.click('#clue-options');await page.check('#auto-results');await page.click('#options .close');
  await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>document.getElementById('console').classList.contains('board-beat')),false,'Three-second timer cut too early');
  await page.waitForFunction(()=>document.getElementById('console').classList.contains('board-beat'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('jeopardy-auto-results')),'true');
  await page.reload();await page.locator('#lobby').waitFor({state:'visible',timeout:120000});assert.equal(await page.locator('#auto-results').isChecked(),true);
  assert.deepEqual(errors,[]);console.log('Desktop/mobile gameplay, manual Continue, saved three-second timer, frame-synchronized captures on three floor levels, CPU highlights and 33 audio decodes passed.');
}finally{await browser.close();}
