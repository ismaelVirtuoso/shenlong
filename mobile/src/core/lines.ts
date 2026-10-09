/**
 * Frases fixas de Shenlong. Se existir áudio pré-gerado (assets/voice, via `npm run gen:voice` no
 * server) ele toca com latência zero; senão cai no TTS do servidor / expo-speech.
 */
export type LineId =
  | 'greeting'
  | 'notheard'
  | 'stillthere'
  | 'goodbye'
  | 'offline'
  | 'thinking1'
  | 'thinking2';

export const LINES: Record<LineId, string> = {
  greeting: 'Eu sou Shenlong... Diga-me... qual é o seu desejo?',
  notheard: 'Os ventos estão agitados... não consegui ouvir. Fale de novo, com calma.',
  stillthere: 'Você ainda está aí, pequeno viajante? Estou ouvindo...',
  goodbye: 'Seu tempo comigo chegou ao fim. Até a próxima vez que as esferas brilharem.',
  offline: 'Os ventos do céu estão fracos esta noite... Chame-me de novo em breve.',
  thinking1: 'Hmmm... deixe-me ver...',
  thinking2: 'Interessante... muito interessante...',
};
