// Clock Game hides its prize presenter on a correct bid (0x4adbd5),
// then shows it for the next product presentation (0x4ae624).
export class ClockPrizeView {
  constructor() { this.product = -1; this.visible = false; this.phase = 0; this.item = 0; }
  present(index) { this.product = index; this.visible = true; }
  update(phase, item) {
    if (item !== this.item || (phase === 3 && this.phase !== 3)) {
      this.product = -1; this.visible = false;
    } else if (this.phase === 0 && phase === 1 && this.product < 0) {
      // Skipping the opening can bypass the first product's narration callback.
      this.present(item);
    }
    this.phase = phase; this.item = item;
  }
}
