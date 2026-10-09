// Construtor de malhas explícitas (chifres, dentes, espinhos, garras) e utilitários de cor.
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t)));
}

/** Acumula várias peças numa única malha (posições, normais, cores sRGB→linear, sway). */
export class MeshBuilder {
  constructor(name) {
    this.name = name;
    this.p = []; this.n = []; this.c = []; this.s = []; this.i = [];
  }
  get count() { return this.p.length / 3; }
  vertex(p, n, rgb, sway = 0) {
    this.p.push(...p); this.n.push(...norm(n)); this.s.push(sway);
    this.c.push(...rgb.map((v) => Math.round(srgbToLinear(Math.min(1, Math.max(0, v))) * 255)), 255);
    return this.count - 1;
  }
  /**
   * Tubo afunilado ao longo de uma bezier cúbica, terminando em ponta.
   * radius(t), color(t) → [r,g,b] sRGB; flat = achatamento da seção (1 = redonda)
   */
  tube(pts, { rings = 18, sides = 10, radius, color, flat = 1, swayScale = 1, up = [0, 1, 0] }) {
    const P = (t) => bezier(pts[0], pts[1], pts[2], pts[3], t);
    let prevN = null;
    const base = this.count;
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      const p = P(t);
      const T = norm(sub(P(Math.min(1, t + 0.01)), P(Math.max(0, t - 0.01))));
      let N = prevN ? norm(sub(prevN, mul(T, prevN[0] * T[0] + prevN[1] * T[1] + prevN[2] * T[2]))) : norm(cross(cross(T, up), T));
      if (!Number.isFinite(N[0]) || Math.hypot(...N) < 0.5) N = norm(cross(T, [1, 0, 0]));
      prevN = N;
      const B = cross(T, N);
      const rad = t >= 1 ? 0.0005 : radius(t);
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a) * flat;
        const dir = add(mul(N, ca), mul(B, sa));
        this.vertex(add(p, mul(dir, rad)), add(mul(N, ca), mul(B, Math.sin(a) / flat)), color(t, k / sides), t * swayScale);
      }
    }
    for (let r = 0; r < rings; r++)
      for (let k = 0; k < sides; k++) {
        const a = base + r * sides + k, b = base + r * sides + ((k + 1) % sides);
        const c = a + sides, d = b + sides;
        this.i.push(a, c, b, b, c, d);
      }
  }
  build() {
    return {
      name: this.name,
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      colors: new Uint8Array(this.c),
      sway: new Float32Array(this.s),
      indices: new Uint32Array(this.i),
    };
  }
}

/** Converte resultado do SDF (+cor por vértice) para o formato do GLB. */
export function sdfMesh(name, m, colorFn, ao) {
  const n = m.positions.length / 3;
  const colors = new Uint8Array(n * 4);
  const mask = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    const p = [m.positions[q * 3], m.positions[q * 3 + 1], m.positions[q * 3 + 2]];
    const nn = [m.normals[q * 3], m.normals[q * 3 + 1], m.normals[q * 3 + 2]];
    const rgb = colorFn(p, nn);
    mask[q] = rgb[3] ?? 0; // 1 = mucosa (boca): lisa, úmida, sem escamas
    const occ = (ao ? 0.35 + 0.65 * ao[q] : 1) * (mask[q] ? 0.6 : 1);
    for (let c = 0; c < 3; c++) colors[q * 4 + c] = Math.round(srgbToLinear(Math.min(1, Math.max(0, rgb[c]))) * occ * 255);
    colors[q * 4 + 3] = Math.round((ao ? ao[q] : 1) * (mask[q] ? 0.35 : 1) * 255); // alpha = AO (oclusão especular/contraluz)
  }
  return { name, positions: m.positions, normals: m.normals, colors, mask, indices: m.indices };
}
