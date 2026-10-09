/**
 * Máquina de estados da experiência. Pura: (state, event) -> state.
 * Todos os efeitos (áudio, rede, timers) vivem no controller.
 */
export type Phase =
  | 'boot' // "toque para continuar" (gesto do usuário libera áudio/mic)
  | 'altar' // esferas visíveis, escutando a invocação
  | 'summoning'
  | 'appearing'
  | 'greeting' // Shenlong fala a frase fixa de abertura
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'goodbye' // fala de despedida
  | 'disappearing';

export type Event =
  | { type: 'START' } // tap no boot
  | { type: 'INVOKE' } // voz reconhecida / toque longo
  | { type: 'SUMMON_DONE' }
  | { type: 'APPEAR_DONE' }
  | { type: 'GREETING_DONE' }
  | { type: 'UTTERANCE' } // usuário terminou de falar algo útil
  | { type: 'REPLY_STARTED' } // primeira frase da resposta começou a tocar
  | { type: 'REPLY_DONE'; farewell: boolean }
  | { type: 'REPLY_FAILED' } // falha: Shenlong fala frase fixa e volta a ouvir
  | { type: 'INTERRUPT' } // toque na tela enquanto fala
  | { type: 'IDLE_TIMEOUT' } // silêncio prolongado
  | { type: 'GOODBYE_DONE' }
  | { type: 'DISAPPEAR_DONE' }
  | { type: 'BACKGROUND' };

export interface MachineState {
  phase: Phase;
  /** quantos desejos já foram concedidos nesta invocação */
  wishes: number;
  /** quantos avisos de silêncio já foram dados no turno de escuta atual */
  idlePrompts: number;
}

export const initialState: MachineState = { phase: 'boot', wishes: 0, idlePrompts: 0 };

const to = (s: MachineState, phase: Phase, patch: Partial<MachineState> = {}): MachineState => ({
  ...s,
  ...patch,
  phase,
});

export function transition(s: MachineState, e: Event): MachineState {
  if (e.type === 'BACKGROUND') {
    return s.phase === 'boot' ? s : { ...initialState, phase: 'altar' };
  }
  switch (s.phase) {
    case 'boot':
      return e.type === 'START' ? to(s, 'altar') : s;
    case 'altar':
      return e.type === 'INVOKE' ? to(s, 'summoning', { wishes: 0, idlePrompts: 0 }) : s;
    case 'summoning':
      return e.type === 'SUMMON_DONE' ? to(s, 'appearing') : s;
    case 'appearing':
      return e.type === 'APPEAR_DONE' ? to(s, 'greeting') : s;
    case 'greeting':
      return e.type === 'GREETING_DONE' ? to(s, 'listening') : s;
    case 'listening':
      if (e.type === 'UTTERANCE') return to(s, 'thinking', { idlePrompts: 0 });
      if (e.type === 'IDLE_TIMEOUT') {
        // 1º aviso: pergunta se ainda está aí (fala); 2º: despede-se.
        return s.idlePrompts >= 1 ? to(s, 'goodbye') : to(s, 'speaking', { idlePrompts: s.idlePrompts + 1 });
      }
      return s;
    case 'thinking':
      if (e.type === 'REPLY_STARTED') return to(s, 'speaking');
      if (e.type === 'REPLY_FAILED') return to(s, 'speaking');
      if (e.type === 'REPLY_DONE') return e.farewell ? to(s, 'goodbye') : to(s, 'listening');
      return s;
    case 'speaking':
      if (e.type === 'REPLY_DONE') {
        return e.farewell ? to(s, 'goodbye') : to(s, 'listening');
      }
      if (e.type === 'INTERRUPT') return to(s, 'listening');
      return s;
    case 'goodbye':
      return e.type === 'GOODBYE_DONE' ? to(s, 'disappearing') : s;
    case 'disappearing':
      return e.type === 'DISAPPEAR_DONE' ? to(s, 'altar', { wishes: 0, idlePrompts: 0 }) : s;
  }
}

/** Fases em que o microfone deve estar ouvindo. */
export const isMicOpen = (p: Phase) => p === 'altar' || p === 'listening';
