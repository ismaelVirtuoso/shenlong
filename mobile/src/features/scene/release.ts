import { RELEASE } from './bridge';
import { lerp, rand, smooth } from './math';
import type { Layout } from './types';

const TAU = Math.PI * 2;

/** Centro da tela onde as 7 esferas giram e se fundem. */
export function releaseCenter(L: Layout) {
  'worklet';
  return { x: L.cx, y: L.H * 0.45 };
}

/**
 * Destinos do lançamento (frações da tela): cada esfera sobe em arco e some no horizonte ou no
 * céu, para um canto diferente do planeta. A ordem é sorteada a cada saída.
 */
const TARGETS: [number, number][] = [
  [-0.35, 0.62],
  [1.35, 0.58],
  [-0.2, -0.12],
  [1.2, -0.08],
  [0.18, 0.66],
  [0.82, 0.68],
  [0.55, -0.3],
];

/** Progresso 0..1 do voo da esfera i (saídas levemente escalonadas). */
export function launchU(i: number, f: number) {
  'worklet';
  const t0 = RELEASE.launch + i * 0.012;
  const k = smooth(t0, t0 + 0.24, f);
  return 1 - (1 - k) * (1 - k);
}

/** Ponto do arco de lançamento da esfera i em u∈[0,1] (Bézier quadrática). */
export function launchPoint(i: number, u: number, seed: number, L: Layout) {
  'worklet';
  const c = releaseCenter(L);
  const slot = (i + Math.floor(rand(seed + 11) * 7)) % 7;
  const tgt = TARGETS[slot]!;
  const ex = tgt[0] * L.W;
  const ey = tgt[1] * L.H;
  const mx = lerp(c.x, ex, 0.45);
  const my = Math.min(c.y, ey) - L.H * (0.18 + 0.12 * rand(seed + i * 4.3));
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
  return { x: a * c.x + b * mx + d * ex, y: a * c.y + b * my + d * ey };
}

/** Ângulo da esfera i girando no centro (acelera até a fusão). */
export function spinAngle(i: number, f: number) {
  'worklet';
  const s = Math.max(0, f - RELEASE.burst);
  return (i * TAU) / 7 + s * TAU * 2.2 + s * s * TAU * 9;
}
