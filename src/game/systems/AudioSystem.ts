/**
 * Synthesised Web Audio: no asset downloads, instant start, tiny footprint.
 * The AudioContext is only created after a user gesture (autoplay rules).
 */
const PENTA = [0, 2, 4, 7, 9];

interface TrackDef {
  bpm: number;
  root: number;
  progression: number[][];
  bass: number[];
  arp: number[];
  wave: OscillatorType;
}

const TRACKS: Record<string, TrackDef> = {
  track_1: { bpm: 96, root: 45, progression: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], bass: [0, -1, 0, 0, 7, -1, 0, 5], arp: [0, 1, 2, 1, 2, 1, 0, 2], wave: 'triangle' },
  track_2: { bpm: 84, root: 50, progression: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], bass: [0, -1, -1, 0, -1, -1, 7, -1], arp: [2, 1, 0, 1, 2, 1, 0, 1], wave: 'sine' },
  track_3: { bpm: 128, root: 43, progression: [[0, 3, 7], [1, 5, 8], [-2, 2, 5], [-4, 0, 3]], bass: [0, 0, 12, 0, 0, 10, 0, 7], arp: [0, 2, 1, 2, 0, 2, 1, 2], wave: 'sawtooth' },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSystem {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private noiseBuf?: AudioBuffer;
  private lastHit = 0;
  private musicTimer?: number;
  private nextNoteTime = 0;
  private step = 0;
  private track = 'track_1';
  private sfxOn = true;
  private musicOn = true;
  private sfxVol = 0.8;
  private musicVol = 0.45;
  private ambient = false;

  /** Call from a user gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.sfxGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.musicOn) this.startMusic();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  configure(o: { sfx: boolean; music: boolean; sfxVolume: number; musicVolume: number; track: string }): void {
    this.sfxOn = o.sfx;
    this.sfxVol = o.sfxVolume;
    this.musicVol = o.musicVolume;
    const trackChanged = o.track !== this.track;
    this.track = TRACKS[o.track] ? o.track : 'track_1';
    const wasOn = this.musicOn;
    this.musicOn = o.music;
    this.applyVolumes();
    if (!this.ctx) return;
    if (this.musicOn && (!wasOn || trackChanged)) this.startMusic();
    if (!this.musicOn) this.stopMusic();
  }

  /** Quieter, sparser music while in menus. */
  setAmbient(on: boolean): void {
    this.ambient = on;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxGain || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.sfxOn ? this.sfxVol : 0, t, 0.02);
    this.musicGain.gain.setTargetAtTime(this.musicOn ? this.musicVol * (this.ambient ? 0.55 : 0.4) : 0, t, 0.3);
  }

  // ── Primitive voices ────────────────────────────────────────────────────

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number; attack?: number; dest?: AudioNode } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = opts.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    const vol = opts.vol ?? 0.2;
    const atk = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(opts.dest ?? this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, opts: { vol?: number; freq?: number; q?: number; type?: BiquadFilterType; at?: number; sweep?: number; dest?: AudioNode } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || !this.noiseBuf) return;
    const t = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(opts.dest ?? this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private get ready(): boolean {
    return !!this.ctx && this.sfxOn;
  }

  // ── Game sounds ─────────────────────────────────────────────────────────

  click(): void {
    if (!this.ready) return;
    this.tone(900, 0.06, { type: 'triangle', vol: 0.12 });
  }

  launch(): void {
    if (!this.ready) return;
    this.tone(220, 0.22, { type: 'triangle', vol: 0.18, slide: 640 });
    this.noise(0.25, { vol: 0.12, freq: 600, sweep: 3000, type: 'bandpass', q: 2 });
  }

  /** Rising pentatonic pitch with combo, Peggle-style. */
  hit(combo: number, kind: 'standard' | 'charged' | 'shield' | 'soft' = 'standard'): void {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit < 0.028) return;
    this.lastHit = now;
    const idx = Math.min(combo, 30);
    const note = 72 + Math.floor(idx / 5) * 12 * 0.5 + PENTA[idx % 5];
    const f = midi(Math.min(note, 104));
    if (kind === 'soft') {
      this.tone(f * 0.5, 0.08, { type: 'sine', vol: 0.06 });
      return;
    }
    this.tone(f, 0.16, { type: 'sine', vol: kind === 'charged' ? 0.16 : 0.11 });
    this.tone(f * 2, 0.07, { type: 'triangle', vol: 0.04 });
    if (kind === 'charged') this.tone(f * 1.5, 0.2, { type: 'triangle', vol: 0.06, at: now + 0.03 });
    if (kind === 'shield') this.noise(0.05, { vol: 0.08, freq: 5000, type: 'highpass' });
  }

  crack(): void {
    if (!this.ready) return;
    this.noise(0.08, { vol: 0.14, freq: 4000, type: 'highpass' });
    this.tone(1600, 0.05, { type: 'square', vol: 0.03 });
  }

  mult(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1318, 0.12, { type: 'square', vol: 0.06 });
    this.tone(1976, 0.18, { type: 'square', vol: 0.05, at: t + 0.05 });
  }

  bomb(): void {
    if (!this.ready) return;
    this.noise(0.5, { vol: 0.45, freq: 1800, sweep: 120 });
    this.tone(110, 0.4, { type: 'sine', vol: 0.4, slide: 32 });
  }

  portal(): void {
    if (!this.ready) return;
    this.tone(380, 0.28, { type: 'sine', vol: 0.12, slide: 1500 });
    this.tone(760, 0.22, { type: 'triangle', vol: 0.05, slide: 2600 });
  }

  boost(): void {
    if (!this.ready) return;
    this.tone(180, 0.12, { type: 'square', vol: 0.06, slide: 420 });
  }

  split(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(660, 0.1, { type: 'triangle', vol: 0.1 });
    this.tone(990, 0.12, { type: 'triangle', vol: 0.09, at: t + 0.04 });
  }

  reactorHit(): void {
    if (!this.ready) return;
    this.tone(330, 0.18, { type: 'triangle', vol: 0.12 });
    this.tone(495, 0.18, { type: 'sine', vol: 0.08 });
  }

  reactor(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((n, i) => this.tone(midi(60 + n), 0.6, { type: 'triangle', vol: 0.12, at: t + i * 0.05, attack: 0.02 }));
    this.noise(0.6, { vol: 0.15, freq: 300, sweep: 6000, type: 'bandpass', q: 1.5 });
  }

  credits(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1568, 0.07, { type: 'square', vol: 0.05 });
    this.tone(2093, 0.12, { type: 'square', vol: 0.05, at: t + 0.06 });
  }

  chain(): void {
    if (!this.ready) return;
    this.noise(0.09, { vol: 0.09, freq: 3000, type: 'bandpass', q: 6 });
  }

  stageClear(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((n, i) => this.tone(midi(67 + n), 0.35, { type: 'triangle', vol: 0.14, at: t + i * 0.08 }));
  }

  upgrade(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 7, 12, 19].forEach((n, i) => this.tone(midi(72 + n), 0.25, { type: 'sine', vol: 0.12, at: t + i * 0.06 }));
  }

  runOver(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    [12, 7, 3, 0].forEach((n, i) => this.tone(midi(57 + n), 0.45, { type: 'triangle', vol: 0.13, at: t + i * 0.16 }));
  }

  victory(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(60 + n), 0.4, { type: 'triangle', vol: 0.13, at: t + i * 0.1 }));
  }

  achievement(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(midi(84), 0.2, { type: 'sine', vol: 0.12 });
    this.tone(midi(91), 0.35, { type: 'sine', vol: 0.12, at: t + 0.1 });
  }

  deny(): void {
    if (!this.ready) return;
    this.tone(160, 0.15, { type: 'square', vol: 0.06 });
  }

  // ── Music ───────────────────────────────────────────────────────────────

  private startMusic(): void {
    if (!this.ctx) return;
    this.stopMusic();
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  private stopMusic(): void {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.musicOn) return;
    const tr = TRACKS[this.track];
    const stepDur = 60 / tr.bpm / 2;
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const t = this.nextNoteTime;
      const bar = Math.floor(this.step / 16) % tr.progression.length;
      const chord = tr.progression[bar];
      const s = this.step % 16;
      // Pad at bar start
      if (s === 0) {
        for (const n of chord) this.tone(midi(tr.root + 12 + n), stepDur * 15, { type: 'sine', vol: 0.05, at: t, attack: 0.6, dest: this.musicGain });
      }
      const b = tr.bass[s % tr.bass.length];
      if (b >= 0 && s % 2 === 0) this.tone(midi(tr.root + chord[0] + b), stepDur * 1.6, { type: 'triangle', vol: 0.12, at: t, dest: this.musicGain });
      if (!this.ambient || s % 4 === 0) {
        const a = chord[tr.arp[s % tr.arp.length] % chord.length];
        this.tone(midi(tr.root + 24 + a), stepDur * 0.9, { type: tr.wave, vol: tr.wave === 'sawtooth' ? 0.018 : 0.035, at: t, dest: this.musicGain });
      }
      if (tr.bpm > 110 && s % 4 === 2) this.noise(0.04, { vol: 0.04, freq: 8000, type: 'highpass', at: t, dest: this.musicGain });
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }
}
