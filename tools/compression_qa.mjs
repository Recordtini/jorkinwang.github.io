// Acceptance checks against the generated site, not the uncompressed checkout.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire('C:/Users/marco/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const base=process.env.PAGES_QA_URL||'http://127.0.0.1:8092/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']});
const errors=[],result={stages:[],movies:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  page.on('console',m=>{if(/shader error|GL_INVALID|feedback loop/i.test(m.text()))errors.push(m.text());});
  const report=await (await page.request.get(new URL('asset-compression.json',base).href)).json();
  assert.equal(report.quality,85);assert.equal(report.excluded_videos.length,18);
  await page.goto(new URL('wheel/',base).href);
  await page.waitForFunction(()=>!!window.wheel3d,null,{timeout:90000});
  assert.equal(await page.locator('.retail-logo').evaluate(image=>image.complete&&image.naturalWidth>0),true);
  assert.match(await page.locator('.retail-logo').getAttribute('src'),/\.webp$/);
  await page.selectOption('#mode','single');await page.click('#quick-play');
  await page.waitForFunction(()=>!document.querySelector('#spin').disabled,null,{timeout:30000});
  await page.click('#settings');
  const stages=await page.locator('#change-stage option').evaluateAll(options=>options.map(o=>o.value));
  for(const id of stages){
    await page.selectOption('#change-stage',id);
    await page.waitForFunction(id=>window.wheel3d.studio.stage===id,id,{timeout:30000});
    result.stages.push(id);
  }
  assert.equal(result.stages.length,11); // The common/base model is loaded separately.
  await page.locator('#studio-dialog .close').click();
  result.movies=await page.evaluate(async()=>{
    const studio=window.wheel3d.studio,checks=[];
    for(const [name,entry] of Object.entries(studio.videoData)){
      studio.playScreen(name);const video=studio.screenVideos.get(name).video;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error(`${name}: frame timeout`)),15000);
        video.addEventListener('error',()=>{clearTimeout(timer);reject(Error(`${name}: decode failed`));},{once:true});
        video.requestVideoFrameCallback(()=>{clearTimeout(timer);resolve();});
      });
      checks.push({name,url:video.currentSrc.split('/').at(-1),width:video.videoWidth,height:video.videoHeight,expectedWidth:entry.width*2,expectedHeight:entry.height});
      studio.restScreen();
    }
    return checks;
  });
  assert.equal(result.movies.length,18);
  for(const movie of result.movies){assert.match(movie.url,/-alpha\.mp4$/);assert.equal(movie.width,movie.expectedWidth);assert.equal(movie.height,movie.expectedHeight);}
  await page.click('#settings');await page.selectOption('#change-stage','la');
  await page.waitForFunction(()=>window.wheel3d.studio.stage==='la');
  await page.locator('#studio-dialog .close').click();await page.click('[data-view=show]');
  fs.mkdirSync('wheel/qa',{recursive:true});
  await page.screenshot({path:'wheel/qa/compressed-studio-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'wheel/qa/compressed-studio-mobile.png'});
  // Other site sections remain in the optimized deployment.
  for(const path of ['dicks.html','ps2.html','outputs/gamespot_ps2_reviews.json','rccar/']){
    const response=await page.request.get(new URL(path,base).href);assert.equal(response.status(),200,path);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('wheel/qa/compression-runtime.json',JSON.stringify({report,...result,errors},null,2));
  console.log('PASS compressed WebP studio: base + 11 sets, 18 video frames, desktop/mobile and other site sections; no missing assets or shader errors');
}finally{await browser.close();}
