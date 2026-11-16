// PC GWContainer::projection, x86 0x65ddd0. Controlled native comparisons:
// tools/test_ui_container.mjs. This does not select a runtime camera.
// The retail final multiply remains on the x87 stack before truncation.
// Rounding that product to a JS double first can turn 399.999... into 400
// (Golden Road's authored view). Preserve the dyadic operands until truncation.
const bits = new DataView(new ArrayBuffer(8));
function dyadic(value) {
  bits.setFloat64(0, value);
  const raw = bits.getBigUint64(0), exponent = Number(raw >> 52n & 2047n);
  const mantissa = raw & ((1n << 52n) - 1n);
  return [(raw >> 63n ? -1n : 1n) * (exponent ? mantissa + (1n << 52n) : mantissa), (exponent || 1) - 1075];
}
function truncateScaledSum(a, b, scale) {
  const [am, ae] = dyadic(a), [bm, be] = dyadic(b), [sm, se] = dyadic(scale);
  const exponent = Math.min(ae, be);
  let product = ((am << BigInt(ae - exponent)) + (bm << BigInt(be - exponent))) * sm;
  const shift = exponent + se;
  // BigInt division truncates toward zero, as the PC integer conversion does.
  product = shift < 0 ? product / (1n << BigInt(-shift)) : product << BigInt(shift);
  return Number(BigInt.asIntN(32, product));
}
export function projectContainer({offset, depth, scale, camera, world_width, viewport}, fov = Math.fround(Math.PI / 3)) {
  depth = Math.fround(depth);
  const sx = Math.fround(scale[0]), sy = Math.fround(scale[1]);
  if (depth === 0) return {offset: [...offset], scale: [sx, sy], transformed: sx !== 1 || sy !== 1};
  const world = world_width === 1280 ? 960 : world_width;
  const [width, height] = viewport;
  const tangent = Math.fround(Math.tan(Math.fround(fov * .5)));
  const dz = depth - camera[2];
  const denominator = 2 * dz * world * tangent || 1e-5;
  const factor = (width === 854 ? 640 : width) / denominator;
  const half = Math.trunc(Math.trunc(width * world / height) / 2);
  const x = camera[0] * world / 1000 - world * dz * tangent;
  const y = (camera[1] - .5) * half * (width === 854 ? .8 : 1) - dz * half * Math.fround(Math.tan(22));
  return {
    offset: [truncateScaledSum(offset[0], x, factor),
             truncateScaledSum(offset[1], -y, factor)],
    scale: [Math.fround(sx * factor), Math.fround(sy * factor)],
    transformed: true,
  };
}

// 0x65e4c0, zero rotation variant. The native pivot early
// return is intentional; this helper does not stand in for widget hit tests.
export function unprojectContainer(point, projection, position = [0, 0], pivot = [0, 0]) {
  const screenPivot = projection.offset.map((v, i) => position[i] + pivot[i] - v);
  if (point[0] === screenPivot[0] && point[1] === screenPivot[1]) return [...point];
  return point.map((v, i) => {
    const local = v - screenPivot[i];
    if (!projection.transformed) return v + projection.offset[i] - position[i];
    const [mantissa, exponent] = dyadic(projection.scale[i]);
    const numerator = BigInt(local) << BigInt(Math.max(0, -exponent));
    const denominator = mantissa << BigInt(Math.max(0, exponent));
    return Number(BigInt.asIntN(32, numerator / denominator)) + pivot[i];
  });
}

// Canvas order [a,b,c,d,e,f], from retail draw block 0x6df8af..0x6dfa49.
export function containerMatrix(projection, position = [0, 0], pivot = [0, 0]) {
  const [sx, sy] = projection.scale;
  return [sx, 0, 0, sy,
    Math.fround(position[0] + pivot[0] * (1 - sx) - projection.offset[0]),
    Math.fround(position[1] + pivot[1] * (1 - sy) - projection.offset[1])];
}
