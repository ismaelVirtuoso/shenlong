import 'dotenv/config';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const env = process.env;
export const config = {
  port: Number(env.PORT ?? 8787),
  mock: env.MOCK === '1',
  // IA: somente Gemini (uma chave cobre conversa, reconhecimento de fala e voz)
  geminiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '',
  geminiChatModel: env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash',
  geminiSttModel: env.GEMINI_STT_MODEL ?? 'gemini-2.5-flash',
  geminiTtsModel: env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts',
  /** voz grave e firme (Charon); outras: Orus, Alnilam, Algenib… */
  geminiVoice: env.GEMINI_VOICE ?? 'Charon',
  /** reconhecimento local sem chave: base (~1 s) | small (mais preciso, ~3 s) */
  localSttModel: env.LOCAL_STT_MODEL ?? 'base',
  /** auto = Gemini se houver chave, senão Piper local (grátis) */
  ttsProvider: (env.TTS_PROVIDER ?? 'auto') as 'auto' | 'gemini' | 'piper',
  piperBin: env.PIPER_BIN ?? resolve(ROOT, 'tools/voice/.venv/bin/piper'),
  piperModel: env.PIPER_MODEL ?? resolve(ROOT, 'tools/voice/models/pt_BR-faber-medium.onnx'),
  /** pós-processamento "voz de dragão" (ffmpeg): dragon | none */
  voiceFx: env.VOICE_FX ?? 'dragon',
  appToken: env.APP_TOKEN || '',
  maxWishes: 3,
  limits: { audioBytes: 1_500_000, textChars: 300, historyTurns: 12, ratePerMinute: 40 },
};
