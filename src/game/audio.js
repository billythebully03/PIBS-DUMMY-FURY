// Процедурный звук: удары, шаги, интерфейс. Всё синтезируется на лету.
export const Snd = {
  ac: null,
  on: true,
  nb: null,

  init() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return;
    }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      const n = this.ac.sampleRate;
      this.nb = this.ac.createBuffer(1, n, n);
      const d = this.nb.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ac = null;
    }
  },

  noise(dur, f0, f1, q, gain, type, delay) {
    if (!this.on || !this.ac) return;
    const ac = this.ac;
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource();
    s.buffer = this.nb;
    s.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    s.start(t);
    s.stop(t + dur + 0.05);
  },

  tone(f0, f1, dur, gain, type, delay) {
    if (!this.on || !this.ac) return;
    const ac = this.ac;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  hit(p) {
    p = p || 1;
    this.noise(0.14, 2200, 260, 0.8, 0.55 * p, 'lowpass');
    this.tone(160, 42, 0.18, 0.8 * p);
    this.noise(0.05, 4000, 1500, 2, 0.2 * p, 'highpass');
  },
  whoosh() {
    this.noise(0.2, 500, 2400, 1.2, 0.18, 'bandpass');
  },
  thud() {
    this.tone(90, 35, 0.22, 0.7);
    this.noise(0.18, 500, 80, 0.7, 0.4, 'lowpass');
  },
  stomp() {
    this.tone(70, 25, 0.5, 1);
    this.noise(0.5, 900, 60, 0.6, 0.6, 'lowpass');
  },
  ram() {
    this.noise(0.45, 300, 1800, 0.8, 0.3);
    this.tone(80, 200, 0.4, 0.25, 'sawtooth');
  },
  ui() {
    this.tone(520, 820, 0.08, 0.18, 'square');
  },
  ko() {
    this.tone(120, 30, 1, 0.9);
    this.noise(0.8, 1500, 80, 0.5, 0.6, 'lowpass');
  },
  spawn() {
    this.noise(0.3, 6000, 300, 0.6, 0.25, 'bandpass');
    this.tone(900, 100, 0.4, 0.2, 'sawtooth');
  },
  fight() {
    this.tone(220, 440, 0.25, 0.3, 'sawtooth');
    this.tone(330, 660, 0.25, 0.2, 'square', 0.12);
  },
};
