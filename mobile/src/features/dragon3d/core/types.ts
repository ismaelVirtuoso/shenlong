export type QualityLevel = 'high' | 'medium' | 'low';

/** Estado que a cena 3D consome a cada quadro (espelho JS das shared values da cena 2D). */
export interface DragonInput {
  /** relógio em ms */
  t: number;
  appear: number;
  summon: number;
  speak: number;
  listen: number;
  think: number;
  wish: number;
  flash: number;
  poke: number;
  glow: number;
}
