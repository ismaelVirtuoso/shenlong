export type QualityLevel = 'high' | 'medium' | 'low';

/** Estado que a cena 3D consome a cada quadro (espelho JS das shared values da cena 2D). */
export interface DragonInput {
  /** relógio em ms */
  t: number;
  appear: number;
  /** saída: 0 = pose final, 1 = mergulhou de cabeça para baixo da tela (corpo inteiro fora) */
  dive: number;
  /** saída após o desejo: 0..1 vira ouro luminoso, 1..2 estoura em luz e some */
  gold: number;
  /** desejo aceito: olhos em brasa vermelha (0..1) */
  grant: number;
  summon: number;
  speak: number;
  listen: number;
  think: number;
  wish: number;
  flash: number;
  poke: number;
  glow: number;
}
