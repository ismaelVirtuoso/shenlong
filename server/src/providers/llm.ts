import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config.js';
import { systemPrompt } from '../persona.js';
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

let anthropic: Anthropic | undefined;
let openai: OpenAI | undefined;
const getAnthropic = () => (anthropic ??= new Anthropic({ apiKey: config.anthropicKey }));
export const getOpenAI = () => (openai ??= new OpenAI({ apiKey: config.openaiKey }));

/** IA paga se houver chave; senão o Shenlong por regras (sempre disponível). */
export const llmEngine = (): 'mock' | 'anthropic' | 'openai' | 'offline' =>
  config.mock ? 'mock'
    : config.llmProvider === 'anthropic' && config.anthropicKey ? 'anthropic'
    : config.openaiKey ? 'openai'
    : config.anthropicKey ? 'anthropic'
    : 'offline';
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
    const text = offlineReply(history, wishes, config.maxWishes);
    for (const w of text.split(/(?<= )/)) yield w;
    return;
  }
  const system = systemPrompt(wishes);
  if (engine === 'openai') {
    const stream = await getOpenAI().chat.completions.create({
      model: config.openaiChatModel,
      stream: true,
      max_tokens: 160,
      temperature: 0.9,
      messages: [{ role: 'system', content: system }, ...history],
    });
    for await (const chunk of stream) {
      const d = chunk.choices[0]?.delta?.content;
      if (d) yield d;
    }
    return;
  }
  const stream = getAnthropic().messages.stream({
    model: config.anthropicModel,
    max_tokens: 200,
    system,
    messages: history,
  });
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
  }
}
