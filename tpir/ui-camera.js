// Shared PC UI camera interpolation, 0x65a530 and endpoint 0x65a950.
// Constants are the executable's doubles, including embedded float values.
export function cameraPose({start, target, duration, elapsed, mode}) {
  if (elapsed >= duration) return [...target];
  const t = elapsed / duration;
  let progress;
  if (mode === 0) progress = t;
  else if (mode === 1) progress = 1.2389999628067017 - 1.5 * Math.pow(2.2, (t + .10999999940395355) * -2.0999999046325684);
  else if (mode === 2) progress = Math.pow(2.2, (t - .4189999997615814) * 2.4000000953674316) * .4000000059604645 - .20000000298023224;
  else return [0, 0, 0];
  if (mode !== 0) progress = Math.max(0, Math.min(1, progress));
  return start.map((v, i) => (target[i] - v) * progress + v);
}
