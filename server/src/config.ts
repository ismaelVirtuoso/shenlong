import 'dotenv/config';

const env = process.env;
export const config = {
  port: Number(env.PORT ?? 8787),
  mock: env.MOCK === '1',
  openaiKey: env.OPENAI_API_KEY || '',
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  llmProvider: (env.LLM_PROVIDER ?? 'anthropic') as 'anthropic' | 'openai',
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  openaiChatModel: env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
  sttModel: env.STT_MODEL ?? 'gpt-4o-mini-transcribe',
  ttsModel: env.TTS_MODEL ?? 'gpt-4o-mini-tts',
  ttsVoice: env.TTS_VOICE ?? 'onyx',
  appToken: env.APP_TOKEN || '',
  maxWishes: 3,
  limits: { audioBytes: 1_500_000, textChars: 300, historyTurns: 12, ratePerMinute: 40 },
};
