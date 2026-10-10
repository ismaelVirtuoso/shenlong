import type { SharedValue } from 'react-native-reanimated';
import type { QualityProfile } from '@/core/quality';

/** Tudo que a cena lê. Escrito por drive.ts / controller; lido em worklets (UI thread). */
export interface SceneValues {
  /** relógio em ms */
  clock: SharedValue<number>;
  /** 0→1 entrada das esferas no boot */
  intro: SharedValue<number>;
  /** 0→1 invocação (esferas orbitam, pilar de luz) */
  summon: SharedValue<number>;
  /** 0→1 dragão emergindo/presente */
  appear: SharedValue<number>;
  /** brilho das esferas por voz detectada */
  glow: SharedValue<number>;
  speak: SharedValue<number>;
  listen: SharedValue<number>;
  think: SharedValue<number>;
  /** flash de relâmpago 0..1 e semente do desenho do raio */
  flash: SharedValue<number>;
  boltSeed: SharedValue<number>;
  /** pulso de desejo concedido 1→0 */
  wish: SharedValue<number>;
  shake: SharedValue<number>;
  poke: SharedValue<number>;
  /** sorteio dos destinos do lançamento das esferas na saída dourada (novo a cada aparição) */
  seed: SharedValue<number>;
  /** 0→1 saída após o desejo (ver RELEASE em timing.ts); 0 fora dela */
  release: SharedValue<number>;
  /** nível do mic 0..1 */
  mic: SharedValue<number>;
}

export interface Layout {
  W: number;
  H: number;
  cx: number;
  /** centro da cabeça do dragão */
  hy: number;
  /** raio-base da cabeça (px) */
  Rh: number;
  /** centro do altar */
  altarY: number;
  q: QualityProfile;
}
