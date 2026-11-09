// Screen 033 positions its four 80x80 digit widgets in a shared container.
// Retail callback 0x59a8f0 changes the upper/lower half by +1/-1 modulo 10.
export function changeClockDigit(bid, x, y, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const { x: left, y: top, w, h } = boxes[i];
    if (x >= left && x < left + w && y >= top && y < top + h) {
      bid[i] = (bid[i] + (y < top + h / 2 ? 1 : 9)) % 10;
      return i;
    }
  }
  return -1;
}
