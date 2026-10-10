// Sintetiza os efeitos sonoros (WAV 16-bit mono 22.05 kHz). Sem material de terceiros.
//   npm run gen:sfx
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SR = 22050;
const out = resolve(import.meta.dirname, '../assets/sfx');
mkdirSync(out, { recursive: true });

let seed = 1234567;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const TAU = Math.PI * 2;
const buf = (sec) => new Float32Array(Math.floor(sec * SR));

function lowpass(x, cutoff, sr = SR) {
  const a = 1 - Math.exp((-TAU * cutoff) / sr);
  let y = 0;
  const o = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = y += a * (x[i] - y);
  return o;
}
const highpass = (x, cutoff, sr = SR) => {
  const l = lowpass(x, cutoff, sr);
  return x.map((v, i) => v - l[i]);
};
const noise = (sec, sr = SR) => new Float32Array(Math.floor(sec * sr)).map(() => rnd());
const env = (n, i, att, rel) => Math.min(1, i / (att * SR)) * Math.min(1, (n - i) / (rel * SR));
/** dente de serra a partir da fase em ciclos */
const saw = (cyc) => 2 * (cyc - Math.floor(cyc)) - 1;
/** loop sem emenda: os últimos `ext` amostras entram em crossfade com o começo */
function loopify(x, n) {
  const ext = x.length - n, o = x.slice(0, n);
  for (let i = 0; i < ext; i++) o[i] = x[i] * (i / ext) + x[n + i] * (1 - i / ext);
  return o;
}
/** faíscas elétricas (estalos de aura): rajadas curtas de ruído agudo, densidade crescente com `dens(p)` */
function sparks(x, count, dens, amp) {
  const n = x.length;
  for (let k = 0; k < count; k++) {
    const p = dens((k + 0.5 + 0.5 * rnd()) / count);
    const i0 = Math.floor(p * (n - 1200)), len = 120 + Math.floor(Math.abs(rnd()) * 500);
    let prev = 0;
    for (let j = 0; j < len && i0 + j < n; j++) {
      const v = rnd();
      x[i0 + j] += (v - prev) * amp * (0.4 + 0.6 * p) * Math.exp(-j / (len * 0.3));
      prev = v;
    }
  }
}

function write(name, x, gain = 0.9, sr = SR) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const pcm = Buffer.alloc(x.length * 2 + 44);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + x.length * 2, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sr, 24); pcm.writeUInt32LE(sr * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.round((x[i] / (peak || 1)) * gain * 32767), 44 + i * 2);
  writeFileSync(resolve(out, name + '.wav'), pcm);
  console.log(name, (pcm.length / 1024).toFixed(0) + 'KB');
}

// drone ambiente (loop de 8 s, sem ruído — o "vento" soava como chiado no alto-falante do celular):
// acorde grave e místico com leve batimento; todas as frequências têm ciclos inteiros no loop
{
  const n = 8 * SR, x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const swell = 0.85 + 0.15 * Math.sin(TAU * t / 8);
    x[i] = swell * (
      0.42 * Math.sin(TAU * 55 * t) + 0.28 * Math.sin(TAU * 55.25 * t) +
      0.22 * Math.sin(TAU * 82.5 * t + 1) + 0.12 * Math.sin(TAU * 110 * t) +
      0.06 * Math.sin(TAU * 165 * t + 2) * (0.5 + 0.5 * Math.sin(TAU * t / 4))
    );
  }
  write('drone', x, 0.5);
}
// aura de ki (loop 4 s, durante a invocação): zumbido grave vibrando, a terra tremendo e estalos
// elétricos — o "vwoooom" de quem está liberando energia. Frequências com ciclos inteiros no loop.
{
  const n = 4 * SR, ext = Math.floor(0.5 * SR), L = (n + ext) / SR;
  const quake = lowpass(lowpass(noise(L), 110), 110);
  const x = new Float32Array(n + ext);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const flutter = 0.6 + 0.4 * Math.sin(TAU * 22 * t);
    const buzz = saw(t * 55) * 0.5 + saw(t * 55.5) * 0.35 + Math.sin(TAU * 110 * t) * 0.3;
    x[i] = buzz * flutter * (0.85 + 0.15 * Math.sin(TAU * 0.5 * t)) + quake[i] * 2.2;
  }
  const y = lowpass(lowpass(x, 1100), 2400);
  sparks(y, 34, (p) => p, 0.5);
  write('rumble', loopify(y, n), 0.9);
}
// carga de ki: a aura sobe de tom e de intensidade, com um assobio agudo crescendo e faíscas cada
// vez mais densas, até o estouro (o impacto entra logo depois)
{
  const x = buf(3.6), n = x.length;
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = i / n;
    ph += (55 * Math.pow(4, p)) / SR;
    ph2 += (TAU * 280 * Math.pow(9, p * p)) / SR;
    const flutter = 0.55 + 0.45 * Math.sin(TAU * (16 + 34 * p) * t);
    const aura = (saw(ph) * 0.6 + saw(ph * 1.007) * 0.4 + Math.sin(TAU * ph * 2) * 0.3) * flutter;
    x[i] = (aura + 0.35 * Math.sin(ph2) * p * p) * (0.2 + 0.8 * p) * env(n, i, 0.08, 0.04);
  }
  const y = lowpass(x, 3500);
  sparks(y, 90, (p) => Math.pow(p, 0.6), 0.9);
  write('charge', y);
}
// trovão do céu escuro: estalo elétrico ("zap" descendente) seguido do ribombar
{
  const x = buf(3.8), n = lowpass(noise(3.8), 700), n2 = lowpass(noise(3.8), 120), hi = highpass(noise(3.8), 2500);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    ph += (TAU * (300 + 4200 * Math.exp(-t * 28))) / SR;
    const zap = (Math.sin(ph) * 0.5 + hi[i]) * Math.exp(-t * 18);
    const roll = (0.7 * n[i] + 1.4 * n2[i]) * Math.exp(-t * 1.1) * (1 + 0.5 * Math.sin(t * 9)) * Math.min(1, t / 0.04);
    x[i] = zap * 0.9 + roll;
  }
  write('thunder', x);
}
// impacto de energia: deslocamento de ar subindo ("fwoo"), estalo seco e um "BOOM" grave que ecoa
{
  const L = 2.6, pre = 0.22, x = buf(L);
  const nz = noise(L), deb = lowpass(noise(L), 380);
  let ph = 0, y = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    if (t < pre) {
      const u = t / pre, c = 300 + 5000 * u * u;
      y += (1 - Math.exp((-TAU * c) / SR)) * (nz[i] - y);
      x[i] = y * u * u * 0.8;
    } else {
      const u = t - pre;
      ph += (TAU * (34 + 110 * Math.exp(-u * 14))) / SR;
      x[i] = Math.sin(ph) * Math.exp(-u * 2.6) * 1.3 + nz[i] * Math.exp(-u * 45) + deb[i] * Math.exp(-u * 3) * 1.6;
    }
  }
  write('impact', x);
}
// rugido de Shenlong: pulsos graves com formantes e swell
{
  const x = buf(4.6);
  let ph = 0;
  const n = lowpass(noise(4.6), 900);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, p = t / 4.6;
    const f = 62 - 16 * p + 5 * Math.sin(TAU * 5 * t);
    ph += (TAU * f) / SR;
    let s = 0;
    for (let h = 1; h <= 9; h++) s += Math.sin(ph * h) / h * (h === 3 || h === 6 ? 1.6 : 1);
    const e = Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.05)), 0.8);
    x[i] = (s * 0.6 + n[i] * 0.9 * (0.6 + 0.4 * Math.sin(TAU * 9 * t))) * e;
  }
  write('roar', x);
}
// brilho mágico (desejo concedido / esfera coletada): glissando rápido de sininhos subindo e um
// acorde de sinos cintilando
{
  const x = buf(2.6);
  const bell = (t0, f, amp, dec) => {
    for (let i = Math.floor(t0 * SR); i < x.length; i++) {
      const t = i / SR - t0;
      const e = Math.min(1, t / 0.003) * Math.exp(-t * dec) * amp;
      x[i] += e * (Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 4) + 0.2 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 8));
    }
  };
  const penta = [0, 2, 4, 7, 9];
  for (let k = 0; k < 14; k++) bell(k * 0.032, 880 * Math.pow(2, (penta[k % 5] + 12 * Math.floor(k / 5)) / 12), 0.22, 9);
  [1046.5, 1318.5, 1568.0, 2093.0].forEach((f, k) => bell(0.45 + k * 0.02, f, 0.35, 2.2));
  for (let i = 0; i < x.length; i++) x[i] *= 1 + 0.25 * Math.sin(TAU * 7 * (i / SR)) * Math.min(1, i / SR / 0.6);
  write('chime', x, 0.7);
}
// "shun" (invocação reconhecida): o som de quem some e reaparece num instante — zíper de tom
// descendo bem rápido sobre um sopro de ar
{
  const x = buf(0.65);
  let ph = 0, y = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    ph += (TAU * (380 + 2800 * Math.exp(-t * 16))) / SR;
    const tone = (Math.sin(ph) + 0.35 * Math.sin(2 * ph)) * Math.min(1, t / 0.004) * Math.exp(-t * 9);
    const c = 500 + 7000 * Math.exp(-t * 9);
    y += (1 - Math.exp((-TAU * c) / SR)) * (rnd() - y);
    x[i] = 0.6 * tone + 0.55 * y * Math.min(1, t / 0.008) * Math.exp(-t * 7);
  }
  write('ping', x, 0.65);
}
// "escutando" (sentir o ki): um "tiing" metálico curto e límpido
{
  const x = buf(0.8);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, v = 1 + 0.004 * Math.sin(TAU * 6 * t);
    const e = Math.min(1, t / 0.003);
    x[i] = e * (Math.sin(TAU * 1760 * v * t) * Math.exp(-t * 5) + 0.5 * Math.sin(TAU * 2637 * v * t) * Math.exp(-t * 7) + 0.25 * Math.sin(TAU * 4410 * t) * Math.exp(-t * 14));
  }
  write('listen', x, 0.45);
}

// Radar do Dragão: "pi" eletrônico agudo (onda quase quadrada, 1ª+3ª harmônicas), queda leve de tom e eco curto
{
  const n = Math.floor(0.42 * SR), x = new Float32Array(n);
  const blip = (t0, f0, dur) => {
    let ph = 0;
    for (let i = Math.floor(t0 * SR); i < Math.min(n, Math.floor((t0 + dur) * SR)); i++) {
      const u = (i / SR - t0) / dur;
      ph += (TAU * f0 * (1 - 0.06 * u)) / SR;
      const e = Math.min(1, u * dur / 0.004) * Math.min(1, (1 - u) * dur / 0.012);
      x[i] += e * (Math.sin(ph) + 0.28 * Math.sin(3 * ph));
    }
  };
  blip(0, 2480, 0.075);
  // eco eletrônico (como o bipe que "ressoa" no aparelho)
  for (let i = n - 1; i >= 0; i--) {
    const d1 = i - Math.floor(0.11 * SR), d2 = i - Math.floor(0.22 * SR);
    if (d1 >= 0) x[i] += 0.32 * x[d1];
    if (d2 >= 0) x[i] += 0.12 * x[d2];
  }
  write('radar', x, 0.75);
}
// ligar o radar: clique do botão + varredura ascendente "bwiip"
{
  const n = Math.floor(0.36 * SR), x = new Float32Array(n);
  const click = lowpass(noise(0.012), 3500);
  for (let i = 0; i < click.length; i++) x[i] += click[i] * 1.4 * (1 - i / click.length);
  let ph = 0;
  for (let i = Math.floor(0.05 * SR); i < n; i++) {
    const u = (i / SR - 0.05) / 0.31;
    ph += (TAU * (700 + 2100 * u * u)) / SR;
    x[i] += 0.55 * Math.min(1, u * 20) * (1 - u) * (Math.sin(ph) + 0.2 * Math.sin(3 * ph));
  }
  write('radarOn', x, 0.7);
}
// as 7 esferas reunidas: arpejo brilhante ascendente (uma nota por esfera) + brilho
{
  const n = Math.floor(3.2 * SR), x = new Float32Array(n);
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0, 2093.0];
  notes.forEach((f, k) => {
    const t0 = k * 0.16;
    for (let i = Math.floor(t0 * SR); i < n; i++) {
      const t = i / SR - t0;
      const e = Math.min(1, t / 0.005) * Math.exp(-t * (k === 6 ? 1.1 : 2.4));
      x[i] += e * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2.01 * t) + 0.12 * Math.sin(TAU * f * 3.02 * t));
    }
  });
  const sh = lowpass(noise(3.2), 6000);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] += 0.05 * sh[i] * Math.min(1, t / 0.8) * Math.exp(-Math.max(0, t - 1.2) * 1.5); }
  // por baixo, a energia das esferas crescendo (aura vibrando que sobe e se abre no fim)
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = Math.min(1, t / 1.3);
    ph += (110 * Math.pow(2, p * 1.5)) / SR;
    const flutter = 0.6 + 0.4 * Math.sin(TAU * (12 + 18 * p) * t);
    x[i] += 0.28 * (saw(ph) * 0.5 + Math.sin(TAU * ph)) * flutter * Math.min(1, t / 0.4) * Math.exp(-Math.max(0, t - 1.3) * 2.2);
  }
  write('gather', lowpass(x, 7000), 0.7);
}

// ── Abertura (composição original): rock de anime heroico, 152 bpm, Lá maior, ~19 s em loop ──
// Intro com a carga de energia subindo e virada de tons; guitarra distorcida em power chords, baixo,
// bateria e uma melodia de "metais" sintetizada (I–V–vi–IV); termina num acorde aberto com prato.
{
  const R = 32000, BPM = 152, BEAT = 60 / BPM, BAR = 4 * BEAT;
  const n = Math.ceil((11 * BAR + 1.6) * R);
  const gtr = new Float32Array(n), bass = new Float32Array(n), drm = new Float32Array(n), lead = new Float32Array(n), fx = new Float32Array(n);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const T = (bar, beat = 0) => bar * BAR + beat * BEAT;
  const tone = (out, t0, dur, f, amp, { att = 0.005, rel = 0.06, dec = 0, vib = 0, wave = 'saw' } = {}) => {
    const i0 = Math.floor(t0 * R), i1 = Math.min(n, Math.floor((t0 + dur + rel) * R));
    let cyc = Math.abs(rnd());
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / R;
      cyc += (f * (1 + vib * Math.sin(TAU * 5.6 * t) * Math.min(1, t / 0.3))) / R;
      const s = wave === 'saw' ? saw(cyc) : wave === 'sq' ? (saw(cyc) > 0 ? 0.8 : -0.8) : Math.sin(TAU * cyc);
      const e = Math.min(1, t / att) * (t > dur ? Math.max(0, 1 - (t - dur) / rel) : 1) * (dec ? Math.exp(-t * dec) : 1);
      out[i] += s * e * amp;
    }
  };
  const hit = (t0, len, fn) => {
    const i0 = Math.floor(t0 * R);
    for (let i = i0; i < Math.min(n, i0 + Math.floor(len * R)); i++) drm[i] += fn((i - i0) / R);
  };
  let kp = 0;
  const kick = (t0) => { kp = 0; hit(t0, 0.35, (t) => { kp += (TAU * (45 + 130 * Math.exp(-t * 32))) / R; return Math.sin(kp) * Math.exp(-t * 9) * 1.1; }); };
  const snare = (t0, a = 1) => hit(t0, 0.25, (t) => a * (rnd() * 0.75 * Math.exp(-t * 16) + Math.sin(TAU * 190 * t) * 0.5 * Math.exp(-t * 24)));
  let hp = 0;
  const hat = (t0, a = 0.22) => hit(t0, 0.06, (t) => { const v = rnd(), d = v - hp; hp = v; return d * a * Math.exp(-t * 70); });
  const crash = (t0, a = 0.32) => { let p = 0; hit(t0, 2.2, (t) => { const v = rnd(), d = v - p; p = v; return d * a * Math.exp(-t * 1.6); }); };
  const tom = (t0, f) => { let c = 0; hit(t0, 0.3, (t) => { c += (f * (1 + 0.6 * Math.exp(-t * 18))) / R; return Math.sin(TAU * c) * Math.exp(-t * 8) * 0.9; }); };

  // acordes por compasso (fundamental em Lá2 = 45): intro, Lá, depois I–V–vi–IV–I–V–IV–V e o final em Lá
  const A = 45, E = 40, Fs = 42, D = 38;
  const CH = [null, A, A, E, Fs, D, A, E, D, E, A];
  const power = (t0, dur, root, amp, dec) => [0, 7, 12].forEach((iv) => {
    tone(gtr, t0, dur, hz(root + iv), amp, { dec, rel: 0.03 });
    tone(gtr, t0, dur, hz(root + iv) * 1.004, amp * 0.8, { dec, rel: 0.03 });
  });

  // intro (compasso 0): a energia subindo
  {
    let c = 0, y = 0;
    for (let i = 0; i < Math.floor(BAR * R); i++) {
      const t = i / R, p = t / BAR;
      c += (70 * Math.pow(6, p)) / R;
      const cut = 300 + 6000 * p * p;
      y += (1 - Math.exp((-TAU * cut) / R)) * (rnd() - y);
      fx[i] += (saw(c) * 0.35 * (0.6 + 0.4 * Math.sin(TAU * (14 + 30 * p) * t)) + y * 0.6) * p * p;
    }
  }
  // compasso 1: guitarra em tremolo (semicolcheias) + virada de tons
  for (let k = 0; k < 16; k++) power(T(1, k / 4), BEAT / 4, A, 0.5, 10);
  [0, 1, 2, 3].forEach((k) => snare(T(1, 2 + k * 0.25), 0.5 + 0.12 * k));
  [3, 3.25, 3.5, 3.75].forEach((b, k) => tom(T(1, b), [196, 165, 131, 98][k]));
  // corpo: compassos 2–9
  for (let bar = 2; bar <= 9; bar++) {
    const root = CH[bar];
    for (let e = 0; e < 8; e++) {
      const t0 = T(bar, e / 2), accent = e === 0 || e === 3 || e === 6;
      power(t0, BEAT / 2 * 0.92, root, accent ? 0.55 : 0.42, accent ? 3 : 9);
      tone(bass, t0, BEAT / 2 * 0.85, hz(root - 12 + (e === 7 ? 12 : 0)), 0.9, { dec: 3 });
      hat(t0, e % 2 ? 0.16 : 0.24);
    }
    kick(T(bar, 0)); kick(T(bar, 2)); if (bar % 2) kick(T(bar, 2.5));
    snare(T(bar, 1)); snare(T(bar, 3));
    if (bar === 2 || bar === 6) crash(T(bar, 0));
  }
  [0, 1, 2, 3].forEach((k) => snare(T(9, 3 + k * 0.25), 0.6 + 0.1 * k));
  // final (compasso 10): acorde aberto, prato e tom grave
  power(T(10, 0), BAR * 1.2, A, 0.6, 0.9);
  tone(bass, T(10, 0), BAR * 1.2, hz(A - 12), 1, { dec: 0.9 });
  kick(T(10, 0)); crash(T(10, 0), 0.4);

  // melodia original [compasso, tempo, duração, nota MIDI]
  const MEL = [
    [2, 0, 1, 76], [2, 1, 1.5, 81], [2, 2.5, 0.5, 80], [2, 3, 1, 78],
    [3, 0, 1.5, 76], [3, 1.5, 0.5, 71], [3, 2, 1, 76], [3, 3, 1, 80],
    [4, 0, 1, 81], [4, 1, 0.5, 80], [4, 1.5, 0.5, 78], [4, 2, 1.5, 73], [4, 3.5, 0.5, 76],
    [5, 0, 2, 78], [5, 2, 1, 76], [5, 3, 1, 74],
    [6, 0, 1, 76], [6, 1, 1.5, 81], [6, 2.5, 0.5, 83], [6, 3, 1, 85],
    [7, 0, 1.5, 83], [7, 1.5, 0.5, 80], [7, 2, 2, 76],
    [8, 0, 1, 78], [8, 1, 1, 81], [8, 2, 1, 86], [8, 3, 1, 85],
    [9, 0, 2, 83], [9, 2, 0.5, 80], [9, 2.5, 0.5, 81], [9, 3, 1, 83],
    [10, 0, 4.5, 81],
  ];
  for (const [bar, beat, dur, m] of MEL) {
    const t0 = T(bar, beat), d = dur * BEAT * 0.94;
    tone(lead, t0, d, hz(m), 0.32, { att: 0.02, rel: 0.09, vib: 0.007 });
    tone(lead, t0, d, hz(m) * 1.003, 0.22, { att: 0.02, rel: 0.09, vib: 0.007, wave: 'sq' });
    tone(lead, t0, d, hz(m - 12), 0.14, { att: 0.03, rel: 0.09 });
  }

  // timbres: guitarra saturada, baixo e metais filtrados; eco curto na melodia
  const g = lowpass(lowpass(gtr.map((v) => Math.tanh(v * 3.5)), 3200, R), 4200, R);
  const b = lowpass(lowpass(bass, 420, R), 420, R);
  const l = lowpass(lead, 4500, R);
  const dly = Math.floor(BEAT * 0.75 * R);
  for (let i = dly; i < n; i++) l[i] += 0.28 * l[i - dly];
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = Math.tanh((g[i] * 0.42 + b[i] * 0.55 + drm[i] * 0.7 + l[i] * 0.75 + fx[i] * 0.8) * 1.1);
  const fadeAt = Math.floor((11 * BAR + 0.6) * R);
  for (let i = fadeAt; i < n; i++) mix[i] *= Math.max(0, 1 - (i - fadeAt) / (n - fadeAt));
  write('opening', mix, 0.85, R);
}
