/** Cenário estilo anime: pilares de rocha com musgo e nuvens fofas. Coordenadas de tela (W×H). */
import { ellipse, smooth, type Pt } from './geom';

export const LAND = {
  rock: '#8a6a45',
  rockShade: '#5d4429',
  rockLight: '#b58f5f',
  moss: '#4f8a3a',
  ink: '#1c140c',
  cloud: '#eef6ff',
  cloudShade: '#a9c4e6',
};

export interface Shape {
  pts: Pt[];
  fill: string;
  stroke?: string;
  sw?: number;
}

/** Pilar de rocha: corpo, lado sombreado, faixa clara e musgo no topo. */
export function rockSpire(x0: number, x1: number, top: number, bottom: number, lean: number): Shape[] {
  const w = x1 - x0;
  const body: Pt[] = smooth(
    [[x0, bottom], [x0 + w * 0.06, top + (bottom - top) * 0.45], [x0 + w * 0.2 + lean, top + 18], [x0 + w * 0.5 + lean, top], [x1 - w * 0.18 + lean, top + 14], [x1 - w * 0.06, top + (bottom - top) * 0.5], [x1, bottom]],
    false, 10,
  );
  const shade: Pt[] = smooth(
    [[x0 + w * 0.55, bottom], [x0 + w * 0.6 + lean * 0.6, top + (bottom - top) * 0.5], [x1 - w * 0.18 + lean, top + 20], [x1 - w * 0.06, top + (bottom - top) * 0.5], [x1, bottom]],
    false, 8,
  );
  const light: Pt[] = smooth([[x0 + w * 0.12, bottom], [x0 + w * 0.16, top + (bottom - top) * 0.5], [x0 + w * 0.28 + lean, top + 30], [x0 + w * 0.32 + lean * 0.8, top + (bottom - top) * 0.5], [x0 + w * 0.3, bottom]], false, 8);
  const moss: Pt[] = smooth([[x0 + w * 0.16 + lean, top + 26], [x0 + w * 0.5 + lean, top - 6], [x1 - w * 0.16 + lean, top + 22], [x1 - w * 0.3 + lean, top + 44], [x0 + w * 0.5 + lean, top + 34], [x0 + w * 0.26 + lean, top + 46]], true, 6);
  return [
    { pts: body, fill: LAND.rock, stroke: LAND.ink, sw: 4 },
    { pts: shade, fill: LAND.rockShade },
    { pts: light, fill: LAND.rockLight },
    { pts: moss, fill: LAND.moss, stroke: LAND.ink, sw: 3 },
  ];
}

/** Nuvem fofa estilo anime: lóbulos brancos + base sombreada azulada. */
export function cloud(cx: number, cy: number, w: number): Shape[] {
  const lobes: Pt[][] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = cx - w / 2 + (w * (i + 0.5)) / n;
    const r = (w / n) * (0.75 + 0.35 * Math.sin(i * 2.1 + cx));
    lobes.push(ellipse(x, cy - r * 0.35 * Math.sin((i / (n - 1)) * Math.PI), r, r * 0.72, 0, 20));
  }
  const base = ellipse(cx, cy + w * 0.06, w * 0.55, w * 0.1, 0, 28);
  return [
    ...lobes.map((pts) => ({ pts, fill: LAND.cloud })),
    { pts: base, fill: LAND.cloudShade },
  ];
}
