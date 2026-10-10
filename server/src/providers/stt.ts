import { config } from '../config.js';
import { geminiTranscribe } from './gemini.js';
import { whisperAvailable, whisperTranscribe } from '../voice/whisper.js';

export type SttEngine = 'gemini' | 'local' | null;

/** Gemini se houver chave; senão Whisper local (grátis, roda no computador). */
export function sttEngine(): SttEngine {
  if (config.mock) return null;
  if (config.geminiKey) return 'gemini';
  return whisperAvailable() ? 'local' : null;
}
export const sttAvailable = () => sttEngine() !== null;

/** Viés de vocabulário: melhora muito o reconhecimento de "Shenlong" na voz de criança. */
const PROMPT = 'Shenlong, apareça! Esferas do Dragão. Eu quero um desejo.';

export async function transcribe(file: File): Promise<string> {
  if (sttEngine() === 'local') return whisperTranscribe(file);
  return geminiTranscribe(file, PROMPT);
}
