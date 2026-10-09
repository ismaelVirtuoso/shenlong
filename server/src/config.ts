import 'dotenv/config';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const env = process.env;
export const config = {
  port: Number(env.PORT ?? 8787),
  mock: env.MOCK === '1',
  openaiKey: env.OPENAI_API_KEY || '',
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  // uma única chave basta: sem Anthropic, a conversa usa OpenAI automaticamente
  llmProvider: (env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')) as 'anthropic' | 'openai',
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  openaiChatModel: env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
  sttModel: env.STT_MODEL ?? 'gpt-4o-mini-transcribe',
  ttsModel: env.TTS_MODEL ?? 'gpt-4o-mini-tts',
  ttsVoice: env.TTS_VOICE ?? 'onyx',
  /** auto = OpenAI se houver chave, senão Piper local (grátis) */
  ttsProvider: (env.TTS_PROVIDER ?? 'auto') as 'auto' | 'openai' | 'piper',
  piperBin: env.PIPER_BIN ?? resolve(ROOT, 'tools/voice/.venv/bin/piper'),
  piperModel: env.PIPER_MODEL ?? resolve(ROOT, 'tools/voice/models/pt_BR-faber-medium.onnx'),
  /** pós-processamento "voz de dragão" (ffmpeg): dragon | none */
  voiceFx: env.VOICE_FX ?? 'dragon',
  appToken: env.APP_TOKEN || '',
  maxWishes: 3,
  limits: { audioBytes: 1_500_000, textChars: 300, historyTurns: 12, ratePerMinute: 40 },
};
