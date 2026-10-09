import { config } from '../config.js';
import { getOpenAI } from './llm.js';
import { piperAvailable, piperSynthesize } from '../voice/piper.js';
import { dragonize, ffmpegAvailable } from '../voice/dragonize.js';

export type TtsEngine = 'openai' | 'piper' | null;

export function ttsEngine(): TtsEngine {
  if (config.mock) return null;
  const openai = !!config.openaiKey;
  if (config.ttsProvider === 'openai') return openai ? 'openai' : null;
  if (config.ttsProvider === 'piper') return piperAvailable() ? 'piper' : null;
  return openai ? 'openai' : piperAvailable() ? 'piper' : null;
}
export const ttsAvailable = () => ttsEngine() !== null;

const INSTRUCTIONS =
  'Voz de um dragão ancestral, imenso e sábio: masculina, muito grave e profunda, ressonante, lenta e majestosa, ' +
  'com autoridade e calma. Fala pausada e solene, com pausas dramáticas nas reticências. Gentil com uma criança, ' +
  'mas sempre imponente. Português do Brasil, dicção clara.';

async function raw(text: string): Promise<Buffer> {
  if (ttsEngine() === 'openai') {
    const res = await getOpenAI().audio.speech.create({
      model: config.ttsModel,
      voice: config.ttsVoice as 'onyx',
      input: text,
      instructions: INSTRUCTIONS,
      response_format: 'wav',
    });
    return Buffer.from(await res.arrayBuffer());
  }
  return piperSynthesize(text);
}

/** Texto → MP3 com a voz de Shenlong (provedor + pós-processamento). */
export async function synthesize(text: string): Promise<Buffer> {
  const engine = ttsEngine() ?? 'piper';
  const audio = await raw(text);
  if (config.voiceFx === 'none' || !ffmpegAvailable()) return audio;
  return dragonize(audio, engine);
}
