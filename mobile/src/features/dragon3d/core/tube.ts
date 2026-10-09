import * as THREE from 'three';

/** Quadro (posição + tangente/normal/binormal) de cada anel de uma espinha. */
export interface Spine {
  count: number;
  /** xyz por anel */
  p: Float32Array;
  t: Float32Array;
  n: Float32Array; // "dorsal"
  b: Float32Array; // lateral
  r: Float32Array; // raio
  s: Float32Array; // comprimento de arco a partir da cabeça
}

export function createSpine(count: number): Spine {
  return {
    count,
    p: new Float32Array(count * 3),
    t: new Float32Array(count * 3),
    n: new Float32Array(count * 3),
    b: new Float32Array(count * 3),
    r: new Float32Array(count),
    s: new Float32Array(count),
  };
}

/** Tangentes por diferença e normais por transporte paralelo (sem torção) a partir de `up0`. */
export function computeFrames(sp: Spine, up0: THREE.Vector3) {
  const { p, t, n, b, count } = sp;
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1), c = Math.min(count - 1, i + 1);
    let x = p[c * 3]! - p[a * 3]!, y = p[c * 3 + 1]! - p[a * 3 + 1]!, z = p[c * 3 + 2]! - p[a * 3 + 2]!;
    let l = Math.hypot(x, y, z);
    if (l < 1e-6) {
      // anéis colapsados (raiz): herda a tangente anterior
      if (i > 0) { x = t[(i - 1) * 3]!; y = t[(i - 1) * 3 + 1]!; z = t[(i - 1) * 3 + 2]!; l = 1; }
      else { x = 0; y = -1; z = 0; l = 1; }
    }
    t[i * 3] = x / l; t[i * 3 + 1] = y / l; t[i * 3 + 2] = z / l;
  }
  // N0 = up0 projetado no plano normal
  let nx = up0.x, ny = up0.y, nz = up0.z;
  for (let i = 0; i < count; i++) {
    const tx = t[i * 3]!, ty = t[i * 3 + 1]!, tz = t[i * 3 + 2]!;
    const d = nx * tx + ny * ty + nz * tz;
    nx -= d * tx; ny -= d * ty; nz -= d * tz;
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-5) { nx = -tz; ny = 0; nz = tx; l = Math.hypot(nx, nz) || 1; }
    nx /= l; ny /= l; nz /= l;
    n[i * 3] = nx; n[i * 3 + 1] = ny; n[i * 3 + 2] = nz;
    b[i * 3] = ty * nz - tz * ny; b[i * 3 + 1] = tz * nx - tx * nz; b[i * 3 + 2] = tx * ny - ty * nx;
  }
}

/**
 * Tubo dinâmico contínuo (sem segmentos): seção com ventre achatado, normais analíticas
 * (inclui a variação do raio), UV u = arco/escala, v = volta (repetição inteira, sem costura visível).
 */
export class DynamicTube {
  readonly geometry = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nrm: Float32Array;
  private cos: Float32Array;
  private sin: Float32Array;

  constructor(
    readonly rings: number,
    readonly sides: number,
    opts: { vRepeat?: number; flatBelly?: number; colors?: (side01: number) => [number, number, number]; belly?: boolean } = {},
  ) {
    const vc = rings * (sides + 1);
    this.pos = new Float32Array(vc * 3);
    this.nrm = new Float32Array(vc * 3);
    const uv = new Float32Array(vc * 2);
    this.cos = new Float32Array(sides + 1);
    this.sin = new Float32Array(sides + 1);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      this.cos[k] = Math.cos(a);
      this.sin[k] = Math.sin(a);
    }
    this.flat = opts.flatBelly ?? 0;
    const idx: number[] = [];
    for (let r = 0; r < rings - 1; r++)
      for (let k = 0; k < sides; k++) {
        const a = r * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    this.geometry.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.uvAttr = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('uv', this.uvAttr);
    this.vRepeat = opts.vRepeat ?? 1;
    if (opts.colors) {
      const col = new Float32Array(vc * 3);
      const bel = new Float32Array(vc);
      for (let r = 0; r < rings; r++)
        for (let k = 0; k <= sides; k++) {
          const i = r * (sides + 1) + k;
          const c = opts.colors(k / sides);
          col.set(c, i * 3);
          bel[i] = Math.min(1, Math.max(0, (-this.cos[k]! - 0.45) / 0.35));
        }
      this.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (opts.belly) this.geometry.setAttribute('belly', new THREE.BufferAttribute(bel, 1));
    }
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  }
  private flat: number;
  private vRepeat: number;
  private uvAttr: THREE.BufferAttribute;

  /** uScale: unidades de arco por repetição da textura ao longo do corpo */
  update(sp: Spine, uScale = 1) {
    const { rings, sides, pos, nrm } = this;
    const uv = this.uvAttr.array as Float32Array;
    const flat = this.flat;
    for (let r = 0; r < rings; r++) {
      const i3 = r * 3;
      const px = sp.p[i3]!, py = sp.p[i3 + 1]!, pz = sp.p[i3 + 2]!;
      const tx = sp.t[i3]!, ty = sp.t[i3 + 1]!, tz = sp.t[i3 + 2]!;
      const nx = sp.n[i3]!, ny = sp.n[i3 + 1]!, nz = sp.n[i3 + 2]!;
      const bx = sp.b[i3]!, by = sp.b[i3 + 1]!, bz = sp.b[i3 + 2]!;
      const rad = sp.r[r]!;
      // dr/ds para inclinar a normal onde o corpo afina
      const ra = sp.r[Math.max(0, r - 1)]!, rb = sp.r[Math.min(rings - 1, r + 1)]!;
      const sa = sp.s[Math.max(0, r - 1)]!, sb = sp.s[Math.min(rings - 1, r + 1)]!;
      const drds = sb - sa > 1e-5 ? (rb - ra) / (sb - sa) : 0;
      for (let k = 0; k <= sides; k++) {
        const c = this.cos[k]!, s = this.sin[k]!;
        // c = componente dorsal (+N), s = lateral (+B). Ventre achatado: comprime c < -0.55
        let cd = c, nd = c;
        if (flat > 0 && c < -0.55) {
          cd = -0.55 + (c + 0.55) * (1 - flat);
          nd = c - (c + 0.55) * flat * 2.2;
        }
        const ox = (nx * cd + bx * s) * rad, oy = (ny * cd + by * s) * rad, oz = (nz * cd + bz * s) * rad;
        const v = r * (sides + 1) + k;
        pos[v * 3] = px + ox; pos[v * 3 + 1] = py + oy; pos[v * 3 + 2] = pz + oz;
        let qx = nx * nd + bx * s - tx * drds, qy = ny * nd + by * s - ty * drds, qz = nz * nd + bz * s - tz * drds;
        const l = Math.hypot(qx, qy, qz) || 1;
        nrm[v * 3] = qx / l; nrm[v * 3 + 1] = qy / l; nrm[v * 3 + 2] = qz / l;
        uv[v * 2] = sp.s[r]! / uScale;
        uv[v * 2 + 1] = (k / sides) * this.vRepeat;
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.normal!.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
  }
}
