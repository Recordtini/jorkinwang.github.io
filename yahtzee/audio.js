// Retail channel policy: 0040a180, 0040a220, 0040a260 and 0040a360.
// Use the audio clock: onended callbacks can lag while the browser is busy.
export function channelBusy(channel,now){return !!channel&&now<channel.endsAt;}
export function selectChannel(channels,now,index){return index===undefined?channels.findIndex(c=>!channelBusy(c,now)):index;}
