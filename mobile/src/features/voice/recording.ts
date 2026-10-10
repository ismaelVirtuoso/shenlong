import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

// AAC/M4A 16 kHz mono nas duas plataformas. O preset LOW_QUALITY grava AMR-NB (.3gp, 8 kHz) no
// Android: o STT (Gemini) não decodifica AMR e a fala da criança nunca era reconhecida.
export const REC_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  // voice_communication liga o pré-processamento de voz do aparelho (redutor de ruído, cancelamento
  // de eco do drone/efeitos que o próprio app toca e ganho automático). No iOS o expo-audio fixa a
  // sessão em modo .default, sem esse processamento.
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: 'voice_communication' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};
