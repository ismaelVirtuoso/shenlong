/** Utilitários de desenho vetorial (sem dependências): curvas → contornos SVG. Espaço da arte: 1000×1000, eixo em x=500. */
export type Pt = [number, number];
export type Seg = [Pt, Pt, Pt, Pt]; // cúbica de Bézier

export function bezPts([p0, p1, p2, p3]: Seg, n = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** Encadeia segmentos (cada um começa onde o anterior termina) em pontos. */
export function chain(segs: Seg[], n = 16): Pt[] {
  const pts: Pt[] = [];
  segs.forEach((s, i) => pts.push(...bezPts(s, n).slice(i ? 1 : 0)));
  return pts;
}

/** Atalho: curva por pontos de passagem (Catmull-Rom → Bézier). */
export function smooth(pts: Pt[], closed = false, n = 10): Pt[] {
  const out: Pt[] = [];
  const N = pts.length;
  const at = (i: number) => (closed ? pts[(i + N) % N]! : pts[Math.max(0, Math.min(N - 1, i))]!);
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out.push(...bezPts([p1, c1, c2, p2], n).slice(i ? 1 : 0));
  }
  return out;
}

export const mirrorX = (p: Pt): Pt => [1000 - p[0], p[1]];

/** Meia forma (lado direito, do eixo ao eixo) → forma simétrica fechada. */
export function symmetric(rightHalf: Pt[]): Pt[] {
  return [...rightHalf, ...rightHalf.slice(1, -1).reverse().map(mirrorX)];
}

/** Traço afunilado ao longo de uma curva → polígono fechado (chifres, presas, tufos, bigodes). */
export function taper(center: Pt[], w0: number, w1: number, tipRound = false): Pt[] {
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)]!, b = center[Math.min(center.length - 1, i + 1)]!;
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const t = i / (center.length - 1);
    const w = (w0 + (w1 - w0) * (tipRound ? Math.pow(t, 1.6) : t)) / 2;
    const c = center[i]!;
    L.push([c[0] - ty * w, c[1] + tx * w]);
    R.push([c[0] + ty * w, c[1] - tx * w]);
  }
  return [...L, ...R.reverse()];
}

/** Tufo de pelos/espinhos: várias pontas curvas saindo de uma base (estilo anime). */
export function tuft(base: Pt, angles: number[], lens: number[], width: number, bend: number): Pt[][] {
  return angles.map((a, i) => {
    const len = lens[i % lens.length]!;
    const r = (a * Math.PI) / 180;
    const tip: Pt = [base[0] + Math.cos(r) * len, base[1] + Math.sin(r) * len];
    const mid: Pt = [base[0] + Math.cos(r) * len * 0.55 - Math.sin(r) * bend, base[1] + Math.sin(r) * len * 0.55 + Math.cos(r) * bend];
    return taper(smooth([base, mid, tip], false, 8), width, 0);
  });
}

export function toD(pts: Pt[], close = true): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + (close ? 'Z' : '');
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 32): Pt[] {
  const out: Pt[] = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}
