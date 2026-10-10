import { config } from '../config.js';
import { geminiSpeak } from './gemini.js';
import { piperAvailable, piperSynthesize } from '../voice/piper.js';
import { dragonize, ffmpegAvailable } from '../voice/dragonize.js';

export type TtsEngine = 'gemini' | 'piper' | null;

export function ttsEngine(): TtsEngine {
  if (config.mock) return null;
  const gemini = !!config.geminiKey;
  if (config.ttsProvider === 'gemini') return gemini ? 'gemini' : null;
  if (config.ttsProvider === 'piper') return piperAvailable() ? 'piper' : null;
  return gemini ? 'gemini' : piperAvailable() ? 'piper' : null;
}
export const ttsAvailable = () => ttsEngine() !== null;

const INSTRUCTIONS =
  'Voz de um dragão ancestral, imenso e sábio: masculina, muito grave e profunda, ressonante, lenta e majestosa, ' +
  'com autoridade e calma. Fala pausada e solene, com pausas dramáticas nas reticências. Gentil com uma criança, ' +
  'mas sempre imponente. Português do Brasil, dicção clara.';

async function raw(text: string): Promise<{ audio: Buffer; engine: 'gemini' | 'piper' }> {
  if (ttsEngine() === 'gemini') {
    try {
      return { audio: await geminiSpeak(text, `Diga com esta voz — ${INSTRUCTIONS}`), engine: 'gemini' };
    } catch (e) {
      // cota/rede: mantém o app falando com a voz local, se houver
      console.error('gemini tts failed', (e as Error).message);
      if (!piperAvailable()) throw e;
    }
  }
  return { audio: await piperSynthesize(text), engine: 'piper' };
}

/** Texto → MP3 com a voz de Shenlong (provedor + pós-processamento). */
export async function synthesize(text: string): Promise<Buffer> {
  const { audio, engine } = await raw(text);
  if (config.voiceFx === 'none' || !ffmpegAvailable()) return audio;
  return dragonize(audio, engine);
}
