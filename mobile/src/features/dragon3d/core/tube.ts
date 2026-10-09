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

/**
 * Tangentes por diferença e normais por transporte paralelo a partir de `up0`.
 * `away` (opcional): direção para onde o DORSO tende a apontar (ex.: para longe da câmera), para a
 * barriga aparecer nas laterais dos laços como no anime; o peso cresce a partir do pescoço.
 */
/** peso do viés do dorso para a câmera no alvo (menor = barriga mais visível no lado de dentro das curvas) */
const AWAY_W = 0.25;
/** o dorso nunca vira menos que isto para a câmera (cos): a barriga não fica de frente */
const MIN = 0.05;
/** alvos do dorso por anel (reaproveitado entre quadros) */
let targets = new Float32Array(0);
let tmp = new Float32Array(0);

export function computeFrames(sp: Spine, up0: THREE.Vector3, away?: THREE.Vector3, bias = 0) {
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
  const useBias = !!away && bias > 0;
  if (useBias) {
    if (targets.length < count * 4) { targets = new Float32Array(count * 4); tmp = new Float32Array(count * 4); }
    // alvo do dorso: para FORA da curva (barriga para dentro, como no anime) + viés para `away` (câmera)
    for (let i = 0; i < count; i++) {
      const a = Math.max(0, i - 2), c = Math.min(count - 1, i + 2);
      let kx = t[c * 3]! - t[a * 3]!, ky = t[c * 3 + 1]! - t[a * 3 + 1]!, kz = t[c * 3 + 2]! - t[a * 3 + 2]!;
      const kl = Math.hypot(kx, ky, kz);
      const curv = Math.min(1, kl * 6); // ~0 em trechos retos/inflexões
      if (kl > 1e-5) { kx /= kl; ky /= kl; kz /= kl; }
      targets[i * 4] = -kx * curv + away!.x * AWAY_W;
      targets[i * 4 + 1] = -ky * curv + away!.y * AWAY_W;
      targets[i * 4 + 2] = -kz * curv + away!.z * AWAY_W;
      targets[i * 4 + 3] = curv;
    }
    // suaviza ao longo da coluna (2 passadas de média móvel ±R): a torção fica gradual, sem "fita torcida"
    const R = 9;
    for (let pass = 0; pass < 2; pass++) {
      const src = pass === 0 ? targets : tmp, dst = pass === 0 ? tmp : targets;
      for (let i = 0; i < count; i++) {
        let sx = 0, sy = 0, sz = 0, sc = 0, m = 0;
        for (let j = Math.max(0, i - R); j <= Math.min(count - 1, i + R); j++) {
          sx += src[j * 4]!; sy += src[j * 4 + 1]!; sz += src[j * 4 + 2]!; sc += src[j * 4 + 3]!; m++;
        }
        dst[i * 4] = sx / m; dst[i * 4 + 1] = sy / m; dst[i * 4 + 2] = sz / m; dst[i * 4 + 3] = sc / m;
      }
    }
  }
  // N0 = up0 projetado no plano normal; depois transporte paralelo puxado pelo alvo
  let nx = up0.x, ny = up0.y, nz = up0.z;
  for (let i = 0; i < count; i++) {
    const tx = t[i * 3]!, ty = t[i * 3 + 1]!, tz = t[i * 3 + 2]!;
    const d = nx * tx + ny * ty + nz * tz;
    nx -= d * tx; ny -= d * ty; nz -= d * tz;
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-5) { nx = -tz; ny = 0; nz = tx; l = Math.hypot(nx, nz) || 1; }
    nx /= l; ny /= l; nz /= l;
    if (useBias) {
      const vx = targets[i * 4]!, vy = targets[i * 4 + 1]!, vz = targets[i * 4 + 2]!, curv = targets[i * 4 + 3]!;
      const ad = vx * tx + vy * ty + vz * tz;
      let ax = vx - ad * tx, ay = vy - ad * ty, az = vz - ad * tz;
      const al = Math.hypot(ax, ay, az);
      if (al > 1e-3) {
        ax /= al; ay /= al; az /= al;
        // o dorso nunca fica de costas para a câmera: a barriga aparece de lado, não de frente
        const wx = away!.x - (away!.x * tx + away!.y * ty + away!.z * tz) * tx;
        const wy = away!.y - (away!.x * tx + away!.y * ty + away!.z * tz) * ty;
        const wz = away!.z - (away!.x * tx + away!.y * ty + away!.z * tz) * tz;
        const wl = Math.hypot(wx, wy, wz);
        if (wl > 0.2) {
          const face = (ax * wx + ay * wy + az * wz) / wl;
          if (face < MIN) {
            const k = Math.min(1, (MIN - face) / (1 + MIN));
            ax += (wx / wl - ax) * k; ay += (wy / wl - ay) * k; az += (wz / wl - az) * k;
            const l3 = Math.hypot(ax, ay, az) || 1;
            ax /= l3; ay /= l3; az /= l3;
          }
        }
        const w = bias * Math.min(1, i / 12) * (0.35 + 0.65 * curv);
        nx += (ax - nx) * w; ny += (ay - ny) * w; nz += (az - nz) * w;
        const d2 = nx * tx + ny * ty + nz * tz;
        nx -= d2 * tx; ny -= d2 * ty; nz -= d2 * tz;
        const l2 = Math.hypot(nx, ny, nz) || 1;
        nx /= l2; ny /= l2; nz /= l2;
      }
    }
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

/** Dados da espinha empacotados por anel (4 texels RGBA32F): [P,r] [T,dr/ds] [N,s] [B,0]. */
export const SPINE_GLSL = /* glsl */ `
attribute vec2 ringSide;
uniform highp sampler2D uSpine;
uniform float uFlat;
uniform float uUScale;
uniform float uVRepeat;
vec3 gTubePos;
vec2 gTubeUv;
void spineVertex(out vec3 nrm) {
  int r = int(ringSide.x + 0.5);
  vec4 P = texelFetch(uSpine, ivec2(r, 0), 0);
  vec4 T = texelFetch(uSpine, ivec2(r, 1), 0);
  vec4 N = texelFetch(uSpine, ivec2(r, 2), 0);
  vec4 B = texelFetch(uSpine, ivec2(r, 3), 0);
  float a = ringSide.y * 6.28318530718;
  float c = cos(a), s = sin(a);
  float cd = c, nd = c;
  if (uFlat > 0.0 && c < -0.55) { // ventre achatado
    cd = -0.55 + (c + 0.55) * (1.0 - uFlat);
    nd = c - (c + 0.55) * uFlat * 2.2;
  }
  nrm = normalize(N.xyz * nd + B.xyz * s - T.xyz * T.w);
  gTubePos = P.xyz + (N.xyz * cd + B.xyz * s) * P.w;
  gTubeUv = vec2(N.w / uUScale, ringSide.y * uVRepeat);
}
`;

export interface SpineUniforms {
  uSpine: { value: THREE.DataTexture };
  uFlat: { value: number };
  uUScale: { value: number };
  uVRepeat: { value: number };
}

/**
 * Tubo deformado na GPU: o JS só calcula os anéis da espinha (posição/quadro/raio) e os envia
 * numa textura float; o vertex shader monta vértices e normais (também na passada de sombra).
 * Custo de CPU ~independe do número de vértices.
 */
export class GpuTube {
  readonly geometry = new THREE.BufferGeometry();
  readonly uniforms: SpineUniforms;
  private data: Float32Array;
  private tex: THREE.DataTexture;

  constructor(
    readonly rings: number,
    readonly sides: number,
    opts: { vRepeat: number; flatBelly: number; uScale: number; colors: (side01: number) => [number, number, number] },
  ) {
    const vc = rings * (sides + 1);
    const rs = new Float32Array(vc * 2);
    const col = new Float32Array(vc * 3);
    const bel = new Float32Array(vc);
    const idx: number[] = [];
    for (let r = 0; r < rings; r++)
      for (let k = 0; k <= sides; k++) {
        const i = r * (sides + 1) + k;
        rs[i * 2] = r;
        rs[i * 2 + 1] = k / sides;
        col.set(opts.colors(k / sides), i * 3);
        bel[i] = Math.min(1, Math.max(0, (-Math.cos((k / sides) * Math.PI * 2) - 0.45) / 0.35));
      }
    for (let r = 0; r < rings - 1; r++)
      for (let k = 0; k < sides; k++) {
        const a = r * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    this.geometry.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vc * 3), 3)); // ignorada pelo shader
    this.geometry.setAttribute('ringSide', new THREE.BufferAttribute(rs, 2));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geometry.setAttribute('belly', new THREE.BufferAttribute(bel, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.data = new Float32Array(rings * 4 * 4);
    this.tex = new THREE.DataTexture(this.data, rings, 4, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.uniforms = {
      uSpine: { value: this.tex },
      uFlat: { value: opts.flatBelly },
      uUScale: { value: opts.uScale },
      uVRepeat: { value: opts.vRepeat },
    };
  }

  update(sp: Spine) {
    const { rings, data } = this;
    const row = rings * 4;
    for (let r = 0; r < rings; r++) {
      const i3 = r * 3, o = r * 4;
      const ra = sp.r[Math.max(0, r - 1)]!, rb = sp.r[Math.min(rings - 1, r + 1)]!;
      const sa = sp.s[Math.max(0, r - 1)]!, sb = sp.s[Math.min(rings - 1, r + 1)]!;
      data[o] = sp.p[i3]!; data[o + 1] = sp.p[i3 + 1]!; data[o + 2] = sp.p[i3 + 2]!; data[o + 3] = sp.r[r]!;
      data[row + o] = sp.t[i3]!; data[row + o + 1] = sp.t[i3 + 1]!; data[row + o + 2] = sp.t[i3 + 2]!;
      data[row + o + 3] = sb - sa > 1e-5 ? (rb - ra) / (sb - sa) : 0;
      data[2 * row + o] = sp.n[i3]!; data[2 * row + o + 1] = sp.n[i3 + 1]!; data[2 * row + o + 2] = sp.n[i3 + 2]!; data[2 * row + o + 3] = sp.s[r]!;
      data[3 * row + o] = sp.b[i3]!; data[3 * row + o + 1] = sp.b[i3 + 1]!; data[3 * row + o + 2] = sp.b[i3 + 2]!;
    }
    this.tex.needsUpdate = true;
  }
}
