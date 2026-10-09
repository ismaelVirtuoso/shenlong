import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { config } from '../config.js';

/** Piper: TTS neural local e gratuito (voz pt-BR masculina "faber"). Instalação: make voice-setup */
export const piperAvailable = () => existsSync(config.piperBin) && existsSync(config.piperModel);

let sampleRate = 0;
const rate = () => (sampleRate ||= (JSON.parse(readFileSync(config.piperModel + '.json', 'utf8')).audio?.sample_rate ?? 22050));

/** Reticências viram pausas reais (frases separadas com silêncio). */
const prepare = (text: string) => text.replace(/\.\.\.|…/g, '. ').replace(/[[\]*_#]/g, '').replace(/\s+/g, ' ').trim();

export function piperSynthesize(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(config.piperBin, ['-m', config.piperModel, '--output-raw', '--sentence-silence', '0.45'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    p.stdout.on('data', (c: Buffer) => chunks.push(c));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`piper saiu com ${code}`));
      resolve(wav(Buffer.concat(chunks), rate()));
    });
    p.stdin.end(prepare(text) + '\n');
  });
}

function wav(pcm: Buffer, sr: number) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
