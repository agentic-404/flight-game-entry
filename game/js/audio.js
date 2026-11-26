// Ridge Runner — sound, synthesised with WebAudio. No audio files, no
// network: an engine hum that follows throttle and speed, a chime for a
// ring, a thud for a crash and an arpeggio for a landing. Everything is
// wrapped so a browser without audio still plays silently.
export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let engineFilter = null;
  let muted = false;

  function ensure() {
    if (ctx || muted) return;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) {
        muted = true;
        return;
      }
      ctx = new AC();
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 110;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      osc1.connect(engineFilter);
      osc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      osc1.start();
      osc2.start();
      engine = { osc1, osc2 };
    } catch {
      muted = true;
    }
  }

  function blip(freqA, freqB, when, dur) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqA, when);
      osc.frequency.exponentialRampToValueAtTime(freqB, when + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.25, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    } catch {
      // Sound is garnish; a failure never stops the game.
    }
  }

  return {
    /** Call from any user gesture: browsers unlock audio only then. */
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    /** Engine hum follows throttle (loudness) and speed (pitch). */
    setEngine(throttle, speed, running) {
      if (!ctx || !engine || muted) return;
      try {
        const t = ctx.currentTime;
        engineGain.gain.setTargetAtTime(running ? 0.02 + throttle * 0.06 : 0, t, 0.1);
        engine.osc1.frequency.setTargetAtTime(50 + speed * 1.1, t, 0.1);
        engine.osc2.frequency.setTargetAtTime(100 + speed * 2.2, t, 0.1);
        engineFilter.frequency.setTargetAtTime(320 + throttle * 700, t, 0.1);
      } catch {
        // Ignore.
      }
    },
    ring() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      blip(880, 880, t, 0.12);
      blip(1318, 1318, t + 0.11, 0.18);
    },
    scrape() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      blip(220, 110, t, 0.2);
    },
    landing() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      [523, 659, 784].forEach((f, i) => blip(f, f, t + i * 0.12, 0.3));
    },
    crash() {
      if (!ctx || muted) return;
      try {
        const t = ctx.currentTime;
        const dur = 0.5;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        noise.connect(gain);
        gain.connect(ctx.destination);
        noise.start(t);
        blip(120, 38, t, 0.45);
      } catch {
        // Ignore.
      }
    },
  };
}
