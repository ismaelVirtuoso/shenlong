import { spawn, spawnSync } from 'node:child_process';

let hasFfmpeg: boolean | null = null;
export const ffmpegAvailable = () => (hasFfmpeg ??= spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0);

/**
 * "Voz de dragão": tom bem grave (~90 Hz), formantes levemente abaixo (garganta grande sem
 * abafar), uma camada uma oitava abaixo só nos graves para o peso, sem lama em ~300 Hz e com
 * presença em 2,8 kHz e brilho acima de 4,5 kHz para as consoantes no alto-falante do celular.
 * O reverb de catedral vai num canal paralelo, baixo e sem graves/agudos: dá o "vindo do céu"
 * sem borrar as palavras (em série, ele derrubava a inteligibilidade). Ritmo ~10% mais lento.
 * Não imita nenhum dublador: é um arquétipo (voz grave, antiga, ressonante).
 */
const FORMANT = 0.92; // tamanho do trato vocal (asetrate)
const TEMPO = 0.9;
/** tom total por provedor: Piper "faber" é tenor (~140 Hz); Gemini Charon já é grave (~110 Hz) */
const PITCH: Record<string, number> = { piper: 0.66, gemini: 0.8 };
const REVERB = 0.26;

function filter(engine: string) {
  const p2 = (PITCH[engine] ?? 0.75) / FORMANT;
  const t2 = TEMPO / FORMANT;
  return [
    `[0:a]aresample=48000,asetrate=${Math.round(48000 * FORMANT)},aresample=48000,` +
      `rubberband=pitch=${p2.toFixed(4)}:tempo=${t2.toFixed(4)}:formant=preserved,asplit=2[m][s]`,
    `[s]asetrate=24000,aresample=48000,atempo=2.0,lowpass=f=700,volume=0.5[sub]`, // oitava abaixo (barato)
    `[m][sub]amix=inputs=2:weights=1 0.45:normalize=0,` +
      `highpass=f=65,bass=g=3:f=130,equalizer=f=320:t=q:w=1:g=-3,` +
      `equalizer=f=2800:t=q:w=1.2:g=5,treble=g=3:f=4500,asplit=2[dry][w]`,
    `[w]highpass=f=300,lowpass=f=2500,aecho=1:1:80|160|290|440:0.5|0.35|0.22|0.12,volume=${REVERB}[wet]`,
    `[dry][wet]amix=inputs=2:weights=1 1:normalize=0,` +
      `acompressor=threshold=-21dB:ratio=3.5:attack=8:release=220:makeup=3.5,alimiter=limit=0.94,apad=pad_dur=0.25[out]`,
  ].join(';');
}

export function dragonize(audio: Buffer, engine: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-filter_complex', filter(engine), '-map', '[out]', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '112k', '-f', 'mp3', 'pipe:1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (c: Buffer) => out.push(c));
    p.stderr.on('data', (c: Buffer) => (err += c.toString()));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.slice(0, 300)}`))));
    p.stdin.end(audio);
  });
}
