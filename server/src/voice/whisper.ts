import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { config } from '../config.js';

/**
 * Reconhecimento de fala LOCAL e gratuito (faster-whisper no computador), usado quando não há
 * OPENAI_API_KEY. Worker persistente: o modelo carrega uma vez (~1–2 s); cada fala ~1 s (modelo base).
 */
const python = () => resolve(dirname(config.piperBin), 'python');
const WORKER = resolve(import.meta.dirname, '../../../tools/voice/stt_worker.py');
export const whisperAvailable = () => existsSync(python()) && existsSync(WORKER);

let proc: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<void> | null = null;
let buf = '';
const waiting: ((text: string) => void)[] = [];

function start(): Promise<void> {
  if (ready) return ready;
  ready = new Promise((res, rej) => {
    proc = spawn(python(), [WORKER, config.localSttModel], { stdio: ['pipe', 'pipe', 'pipe'] });
    let ok = false;
    proc.stdout.on('data', (c: Buffer) => {
      buf += c.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!ok) {
          if (line.startsWith('READY')) { ok = true; res(); }
          continue;
        }
        try { waiting.shift()?.((JSON.parse(line) as { text: string }).text ?? ''); } catch { waiting.shift()?.(''); }
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', () => {
      proc = null;
      ready = null;
      buf = '';
      waiting.splice(0).forEach((w) => w(''));
      if (!ok) rej(new Error('whisper worker saiu'));
    });
  });
  return ready;
}

export function warmWhisper() {
  if (whisperAvailable()) start().catch((e) => console.error('whisper:', (e as Error).message));
}

export async function whisperTranscribe(file: File): Promise<string> {
  await start();
  const path = join(tmpdir(), `shenlong-${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`);
  writeFileSync(path, Buffer.from(await file.arrayBuffer()));
  try {
    return await new Promise<string>((res) => {
      waiting.push(res);
      proc!.stdin.write(JSON.stringify({ path }) + '\n');
    });
  } finally {
    try { unlinkSync(path); } catch {} // a voz da criança não fica guardada
  }
}
