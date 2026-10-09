import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';

/**
 * Piper: TTS neural local e gratuito (voz pt-BR masculina "faber"). Instalação: make voice-setup.
 * Mantém um worker Python persistente (o modelo leva ~6 s para carregar; cada frase ~0,4 s).
 */
const python = () => resolve(dirname(config.piperBin), 'python');
const WORKER = resolve(import.meta.dirname, '../../../tools/voice/piper_worker.py');
export const piperAvailable = () => existsSync(python()) && existsSync(config.piperModel) && existsSync(WORKER);

let proc: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<number> | null = null;
let buf = Buffer.alloc(0);
const waiting: ((pcm: Buffer) => void)[] = [];

function start(): Promise<number> {
  if (ready) return ready;
  ready = new Promise((res, rej) => {
    proc = spawn(python(), [WORKER, config.piperModel], { stdio: ['pipe', 'pipe', 'pipe'] });
    let rate = 0;
    proc.stdout.on('data', (c: Buffer) => {
      buf = Buffer.concat([buf, c]);
      if (!rate) {
        const nl = buf.indexOf(10);
        if (nl < 0) return;
        rate = Number(buf.subarray(0, nl).toString().split(' ')[1]) || 22050;
        buf = buf.subarray(nl + 1);
        res(rate);
      }
      while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
        const n = buf.readUInt32LE(0);
        const pcm = buf.subarray(4, 4 + n);
        buf = buf.subarray(4 + n);
        waiting.shift()?.(Buffer.from(pcm));
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', () => {
      proc = null;
      ready = null;
      buf = Buffer.alloc(0);
      waiting.splice(0).forEach((w) => w(Buffer.alloc(0)));
      if (!rate) rej(new Error('piper worker saiu'));
    });
  });
  return ready;
}

/** Aquece o worker na subida do servidor (a 1ª fala já sai rápida). */
export function warmPiper() {
  if (piperAvailable()) start().catch(() => {});
}

/** Reticências viram frases separadas (pausas reais). */
const prepare = (text: string) => text.replace(/\.\.\.|…/g, '. ').replace(/[[\]*_#]/g, '').replace(/\s+/g, ' ').trim();

export async function piperSynthesize(text: string): Promise<Buffer> {
  const rate = await start();
  const pcm = await new Promise<Buffer>((res) => {
    waiting.push(res);
    proc!.stdin.write(JSON.stringify({ text: prepare(text) }) + '\n');
  });
  if (!pcm.length) throw new Error('piper não gerou áudio');
  return wav(pcm, rate);
}

function wav(pcm: Buffer, sr: number) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
