export class RouletteAudio {
  private context?: AudioContext;
  private enabled = true;
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  unlock() { if (!this.enabled) return; try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume(); } catch { /* audio is optional */ } }
  tick(final = false) { this.beep(final ? 420 : 180, final ? 0.08 : 0.025); }
  win() { this.beep(660, 0.12); window.setTimeout(() => this.beep(880, 0.16), 70); }
  neutral() { this.beep(220, 0.08); }
  private beep(frequency: number, duration: number) { if (!this.enabled || !this.context) return; try { const oscillator = this.context.createOscillator(); const gain = this.context.createGain(); oscillator.frequency.value = frequency; oscillator.type = 'sine'; gain.gain.setValueAtTime(0.0001, this.context.currentTime); gain.gain.exponentialRampToValueAtTime(0.08, this.context.currentTime + 0.005); gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration); oscillator.connect(gain).connect(this.context.destination); oscillator.start(); oscillator.stop(this.context.currentTime + duration + 0.01); } catch { /* audio is optional */ } }
}
