export class RouletteHaptics {
  private enabled = true;
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  tick() { if (this.enabled && navigator.vibrate) navigator.vibrate(5); }
  finish(win: boolean) { if (this.enabled && navigator.vibrate) navigator.vibrate(win ? [30, 40, 60] : 15); }
}
