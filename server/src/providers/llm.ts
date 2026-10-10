import { config } from '../config.js';
import { systemPrompt } from '../persona.js';
import { geminiChatStream } from './gemini.js';
import { offlineReply } from './offline.js';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const MOCK_REPLIES = [
  '[CONCEDIDO] Feche os olhos... sinta o vento nos cabelos. Você flutua entre as nuvens douradas! Quer voar mais alto?',
  'Hmm... um desejo curioso. Conte-me mais, pequeno viajante: como ele seria?',
  'Que desejo bonito! Que seja concedido... [CONCEDIDO] Um brilho quente envolve você. O que mais faria seu coração sorrir?',
];
let mockIdx = 0;

/** Gemini se houver chave; senão o Shenlong por regras (sempre disponível). */
export const llmEngine = (): 'mock' | 'gemini' | 'offline' => (config.mock ? 'mock' : config.geminiKey ? 'gemini' : 'offline');
export const llmAvailable = () => true;

/** Stream de deltas de texto da resposta de Shenlong. */
export async function* streamReply(history: Turn[], wishes: number): AsyncGenerator<string> {
  if (config.mock) {
    const text = MOCK_REPLIES[mockIdx++ % MOCK_REPLIES.length] ?? '';
    for (const w of text.split(/(?<= )/)) {
      await new Promise((r) => setTimeout(r, 25));
      yield w;
    }
    return;
  }
  const engine = llmEngine();
  if (engine === 'offline') {
    yield* offlineWords(history, wishes);
    return;
  }
  try {
    yield* geminiChatStream(systemPrompt(wishes), history);
  } catch (e) {
    // sem rede/cota: não deixa a criança sem resposta — cai nas regras (só se nada foi dito ainda)
    console.error('gemini chat failed', (e as Error).message);
    yield* offlineWords(history, wishes);
  }
}

function* offlineWords(history: Turn[], wishes: number) {
  for (const w of offlineReply(history, wishes, config.maxWishes).split(/(?<= )/)) yield w;
}
