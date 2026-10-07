// NiFloatData interpolation follows NifSkope's cubic Hermite convention:
// previous.Backward and next.Forward are segment tangents, not units/second.
export function sampleScalar(group,time,fallback=0){
  const keys=group?.keys;if(!keys?.length)return fallback;
  if(time<=keys[0].time)return keys[0].value;
  if(time>=keys.at(-1).time)return keys.at(-1).value;
  const next=keys.findIndex(k=>k.time>time),a=keys[next-1],b=keys[next];
  const x=(time-a.time)/(b.time-a.time);
  if(group.interpolation===5)return a.value;
  if(group.interpolation===2){const x2=x*x,x3=x2*x;return a.value*(2*x3-3*x2+1)+b.value*(-2*x3+3*x2)+(a.backward??0)*(x3-2*x2+x)+(b.forward??0)*(x3-x2);}
  return a.value+(b.value-a.value)*x;
}

export function clipTime(clip,elapsed,clamp=false){
  const length=clip.stop-clip.start,t=Math.max(0,elapsed)*clip.frequency;
  if(!length)return clip.start;
  if(clamp||clip.cycle===2)return Math.min(clip.stop,clip.start+t);
  if(clip.cycle===1){const p=t%(2*length);return clip.start+(p>length?2*length-p:p);}
  return clip.start+t%length;
}

export function animationCategory(state,event){
  if(event==='start')return 'begin_game';
  if(event==='restore')return 'idle';
  if(event==='round')return 'begin_round';
  if(event==='spin')return state.round===5?'bonus_spin':'big_spin';
  if(['win','tossup-win'].includes(event))return state.phase==='finished'?'end_game':'end_round';
  if(['land','bankrupt','lose-turn','tossup-end'].includes(event))return 'idle';
  return null;
}

export function animationClamped(category,entry){
  const boardCelebration=entry.actor.startsWith('puzzleboard_')&&['end_round','end_game'].includes(category);
  return entry.clamp===true||(!['idle','big_spin','bonus_spin'].includes(category)&&!boardCelebration);
}

// OpenGL's native T(center) R S T(translation) T(-center), in row-major order.
export function textureMatrix({center=[0,0],translation=[0,0],scale=[1,1],rotation=0}){
  const [cx,cy]=center,[u,v]=translation,[sx,sy]=scale,c=Math.cos(rotation),s=Math.sin(rotation);
  return [c*sx,-s*sy,cx+c*sx*(u-cx)-s*sy*(v-cy),s*sx,c*sy,cy+s*sx*(u-cx)+c*sy*(v-cy),0,0,1];
}
