import { config } from '../config.js';
import { getOpenAI } from './llm.js';

export const ttsAvailable = () => !config.mock && !!config.openaiKey;

const INSTRUCTIONS =
  'Voz de um dragão ancestral e bondoso: muito grave, profunda, lenta e majestosa, com ressonância de peito. ' +
  'Calorosa e gentil, falando com uma criança pequena. Pausas dramáticas nas reticências. Português do Brasil, clara e bem articulada.';

export async function synthesize(text: string): Promise<ArrayBuffer> {
  const res = await getOpenAI().audio.speech.create({
    model: config.ttsModel,
    voice: config.ttsVoice as 'onyx',
    input: text,
    instructions: INSTRUCTIONS,
    response_format: 'mp3',
  });
  return res.arrayBuffer();
}
