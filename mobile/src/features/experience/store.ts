import { create } from 'zustand';
import { makeMutable } from 'react-native-reanimated';
import { initialState, type MachineState } from '@/core/machine';
import { defaultQuality, type Quality } from '@/core/quality';
import { UNKNOWN, type BackendStatus } from '../conversation/health';

export interface Fx {
  /** incrementa a cada relâmpago */
  bolt: number;
  boltBig: boolean;
  /** incrementa a cada desejo concedido */
  wish: number;
  /** voz detectada no altar (esferas acendem) / reconhecimento falhou (apagam) */
  heard: number;
  missed: number;
  /** incrementa a cada toque no dragão */
  poke: number;
}

interface Store {
  m: MachineState;
  /** áudio de Shenlong tocando agora (boca/olhos) */
  speaking: boolean;
  micDenied: boolean;
  quality: Quality;
  fx: Fx;
  backend: BackendStatus;
  /** última transcrição (painel de diagnóstico em dev) */
  lastHeard: string;
  /** diagnóstico do microfone em dev: dBFS e estado */
  micDb: number;
  voiceState: string;
  set: (p: Partial<Omit<Store, 'set'>>) => void;
  bump: (k: keyof Fx, extra?: Partial<Fx>) => void;
}

export const useStore = create<Store>((set) => ({
  m: initialState,
  speaking: false,
  micDenied: false,
  quality: defaultQuality(),
  backend: UNKNOWN,
  lastHeard: '',
  micDb: -160,
  voiceState: 'parado',
  fx: { bolt: 0, boltBig: false, wish: 0, heard: 0, missed: 0, poke: 0 },
  set: (p) => set(p),
  bump: (k, extra) => set((s) => ({ fx: { ...s.fx, ...extra, [k]: (s.fx[k] as number) + 1 } })),
}));

/** Nível do microfone (0..1), atualizado a ~16 Hz fora do React. */
export const micLevel = makeMutable(0);
