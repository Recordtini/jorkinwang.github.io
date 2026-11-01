// Compare the channel decisions against captured calls from the original EXE.
const fs=require('fs');process.chdir(__dirname);const assert=require('assert/strict');
(async()=>{
 const source=fs.readFileSync('audio.js','utf8');
 const {channelBusy,selectChannel}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const fixture=JSON.parse(fs.readFileSync('engine/evidence/audio-playback.json','utf8'));
 for(const c of fixture.cases){
  const channels=Array.from({length:16},(_,i)=>c.occupied.includes(100+i)?{endsAt:2}:null);
  if(c.case.startsWith('floor')){const index=selectChannel(channels.slice(0,10),1);const started=c.calls.find(x=>x[0]==='_AIL_start_sample_4');assert.equal(index,started?started[1][0]-100:-1,c.case);}
  if(c.case.startsWith('die'))assert.equal(Number(channelBusy(channels[14],1)),c.result,c.case);
  if(c.case==='wall-replace')assert.equal(selectChannel(channels,1,14),c.calls.find(x=>x[0]==='_AIL_end_sample_4')[1][0]-100);
 }
 assert.equal(channelBusy({endsAt:1},1),false,'finished sound must be idle before onended callback');
 assert.equal(selectChannel([{endsAt:1},{endsAt:3}],2),0,'reclaim expired shared channel');
 console.log('6 original playback cases and 2 delayed-callback checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
