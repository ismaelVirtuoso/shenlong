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

function lowpass(x, cutoff) {
  const a = 1 - Math.exp((-TAU * cutoff) / SR);
  let y = 0;
  const o = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = y += a * (x[i] - y);
  return o;
}
const noise = (sec) => buf(sec).map(() => rnd());
const env = (n, i, att, rel) => Math.min(1, i / (att * SR)) * Math.min(1, (n - i) / (rel * SR));

function write(name, x, gain = 0.9) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const pcm = Buffer.alloc(x.length * 2 + 44);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + x.length * 2, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
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
// rumble de invocação (loop 4 s)
{
  const n = 4 * SR, x = lowpass(noise(4), 90);
  for (let i = 0; i < n; i++) x[i] = x[i] * (0.7 + 0.3 * Math.sin(TAU * 2 * i / n)) + 0.4 * Math.sin(TAU * 40 * i / SR);
  write('rumble', x, 0.9);
}
// charge: varredura ascendente com ruído
{
  const x = buf(3.6);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const p = i / x.length, f = 80 * Math.pow(12, p * p);
    ph += (TAU * f) / SR;
    x[i] = (0.6 * Math.sin(ph) + 0.25 * Math.sin(ph * 2) + 0.15 * rnd() * p) * (0.15 + p) * env(x.length, i, 0.05, 0.05);
  }
  write('charge', x);
}
// trovão
{
  const x = buf(3.8), n = lowpass(noise(3.8), 700), n2 = lowpass(noise(3.8), 120);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const crack = Math.exp(-t * 14) * rnd();
    const roll = (0.7 * n[i] + 1.4 * n2[i]) * Math.exp(-t * 1.1) * (1 + 0.5 * Math.sin(t * 9));
    x[i] = crack * 0.8 + roll;
  }
  write('thunder', x);
}
// impacto grave
{
  const x = buf(2.2);
  let ph = 0;
  const n = lowpass(noise(2.2), 500);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    ph += (TAU * (30 + 70 * Math.exp(-t * 8))) / SR;
    x[i] = Math.sin(ph) * Math.exp(-t * 2.2) + 0.5 * n[i] * Math.exp(-t * 7);
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
// chime de desejo concedido
{
  const x = buf(3);
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => {
    const t0 = k * 0.14;
    for (let i = Math.floor(t0 * SR); i < x.length; i++) {
      const t = i / SR - t0;
      x[i] += (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * 2.2) * 0.4;
    }
  });
  write('chime', x, 0.7);
}
// ping de reconhecimento (invocação detectada)
{
  const x = buf(0.9);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = (Math.sin(TAU * 660 * t) + 0.5 * Math.sin(TAU * 990 * t)) * Math.exp(-t * 5);
  }
  write('ping', x, 0.6);
}
// "escutando": dois tons suaves ascendentes
{
  const x = buf(0.5);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, f = t < 0.12 ? 520 : 780;
    x[i] = Math.sin(TAU * f * t) * Math.exp(-t * 7) * Math.min(1, t * 200);
  }
  write('listen', x, 0.4);
}
