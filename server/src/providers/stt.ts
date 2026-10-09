import { config } from '../config.js';
import { getOpenAI } from './llm.js';

export const sttAvailable = () => !config.mock && !!config.openaiKey;

/** Viés de vocabulário: melhora muito o reconhecimento de "Shenlong" na voz de criança. */
const PROMPT = 'Shenlong, apareça! Esferas do Dragão. Eu quero um desejo.';

export async function transcribe(file: File): Promise<string> {
  const r = await getOpenAI().audio.transcriptions.create({
    file,
    model: config.sttModel,
    language: 'pt',
    prompt: PROMPT,
  });
  return r.text.trim();
}
