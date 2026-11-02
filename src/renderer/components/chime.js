// Soft chime generated with Web Audio (no audio files). Chime.play('done' | 'needs' | 'focus').
(() => {
  let ctx = null;

  function play(kind) {
    const S = window.mochi.theme.sounds;
    const notes = S.notes[kind];
    if (!notes) return;
    try {
      ctx = ctx || new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime + 0.02;
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = n.f;
        const start = t0 + n.at;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(S.volume, start + 0.02); // soft attack
        gain.gain.exponentialRampToValueAtTime(0.0001, start + n.len); // long fade
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + n.len + 0.05);
      }
    } catch {
      // audio unavailable: stay silent
    }
  }

  window.Chime = { play };
})();
