/**
 * Estrelas das Esferas do Dragão (em unidades do raio da esfera). Todas as esferas usam o MESMO
 * tamanho de estrela — o da esfera de 7 estrelas — como no anime; muda só a quantidade e o arranjo.
 */
export const STAR_R = 0.2;
export const STAR_INNER = 0.42;

export function starCenters(n: number): { x: number; y: number }[] {
  if (n <= 1) return [{ x: 0, y: 0 }];
  const out: { x: number; y: number }[] = [];
  // 6 e 7: anel ao redor de uma estrela central
  const center = n >= 6;
  if (center) out.push({ x: 0, y: 0 });
  const ring = center ? n - 1 : n;
  const rad = n === 2 ? 0.26 : n === 3 ? 0.28 : n === 4 ? 0.3 : n === 5 ? 0.34 : n === 6 ? 0.44 : 0.47;
  const start = n === 2 ? 0 : n === 4 ? Math.PI / 4 : -Math.PI / 2;
  for (let k = 0; k < ring; k++) {
    const a = start + (k * Math.PI * 2) / ring;
    out.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  return out;
}

/** Contorno de uma estrela de 5 pontas: 10 vértices (x, y) em unidades do raio da esfera. */
export function starOutline(cx: number, cy: number, r = STAR_R): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * STAR_INNER : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}
