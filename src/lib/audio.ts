// Created only after a user gesture, never during server rendering.
export class TimerAudio {
  private context: AudioContext | undefined;
  prepare() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Visual alerts are always available. */ }
  }
  chime(final = false) {
    const context = this.context;
    if (!context) return;
    try {
      (final ? [523.25, 659.25, 783.99] : [659.25, 783.99]).forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const time = context.currentTime + index * 0.17;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.16, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.65);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.7);
      });
    } catch { /* Unsupported audio must never interrupt the countdown. */ }
  }
  dispose() { void this.context?.close().catch(() => {}); this.context = undefined; }
}