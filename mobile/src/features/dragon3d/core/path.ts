import * as THREE from 'three';

/**
 * Trajetória do corpo no mundo, da raiz (as esferas unidas, embaixo) até o pescoço.
 * Ao surgir, a cabeça percorre esse caminho e o corpo a segue (como uma serpente de verdade).
 * Os pontos ondulam levemente com o tempo (respiração/serpenteio).
 */
/**
 * Pose final = o Shenlong clássico do anime (arte oficial, 742×1076): "8" vertical com a cabeça
 * no cruzamento. Pontos digitalizados da referência em frações da imagem (fx, fy) + profundidade z
 * para os cruzamentos (cabeça na frente; passagens por trás da cabeça e da volta de baixo).
 */
export const FIGURE = { cx: 0.35, cy: 2.0, w: 7.2, h: (7.2 * 1076) / 742 };
const ref = (fx: number, fy: number, z: number): [number, number, number] =>
  [FIGURE.cx + (fx - 0.5) * FIGURE.w, FIGURE.cy + (0.5 - fy) * FIGURE.h, z];

/**
 * Onde as sete esferas ficam unidas, à frente e abaixo do "8" (como no anime): a cabeça nasce
 * delas, percorre o caminho todo, e a ponta da cauda fica presa no brilho dourado.
 * A cena 2D desenha as esferas na projeção deste ponto (ver DragonScene.anchor).
 */
export const BALLS = new THREE.Vector3(0.35, -4.7, 1.8);
/** cauda: sai das esferas, abre para a direita e entra por baixo na volta pequena do "8" */
const TAIL: [number, number, number][] = [
  [BALLS.x, BALLS.y, BALLS.z],
  [0.75, -4.2, 1.4],
  [1.55, -3.75, 0.8],
  [2.05, -3.05, 0.2],
  [1.85, -2.6, -0.2],
];
/** o "8" do anime, da volta pequena de baixo até o pescoço */
const FIG: [number, number, number][] = [
  ref(0.6, 0.925, -0.4), // volta pequena de baixo (barriga à mostra)
  ref(0.48, 0.915, -0.5),
  ref(0.415, 0.872, -0.8),
  ref(0.41, 0.8, -1.0), // de novo por trás da faixa da frente
  ref(0.48, 0.725, -0.5), // faixa central sob a boca
  ref(0.5, 0.65, -0.2),
  ref(0.47, 0.59, 0.1),
  ref(0.36, 0.545, 0.2), // topo da volta de baixo, indo para a esquerda
  ref(0.25, 0.565, 0.3),
  ref(0.195, 0.66, 0.5), // ← patas de trás
  ref(0.22, 0.765, 0.7),
  ref(0.31, 0.825, 0.9),
  ref(0.48, 0.83, 1.0), // faixa da frente, descendo na diagonal para a esquerda
  ref(0.66, 0.805, 0.9),
  ref(0.8, 0.725, 0.6),
  ref(0.86, 0.61, 0.3),
  ref(0.82, 0.535, -0.3),
  ref(0.7, 0.5, -1.1), // por trás da cabeça
  ref(0.55, 0.49, -1.5),
  ref(0.4, 0.48, -1.1),
  ref(0.28, 0.43, -0.6),
  ref(0.2, 0.35, -0.3), // sobe pela esquerda
  ref(0.19, 0.25, -0.1),
  ref(0.27, 0.16, -0.3), // ← patas da frente (uma erguida no canto)
  ref(0.4, 0.11, -0.7),
  ref(0.55, 0.105, -0.9), // arco de cima
  ref(0.7, 0.13, -1.0),
  ref(0.79, 0.21, -1.1),
  ref(0.77, 0.3, -1.4),
  ref(0.68, 0.37, -1.8), // desce para a nuca
];
/** índices (nos pontos de controle) onde ficam as patas */
export const LEG_CTRL = { front: TAIL.length + 23, rear: TAIL.length + 9.7 };
/** ponto de controle da ponta da cauda (nas esferas) */
export const TIP_CTRL = 0;
/** ponto de controle onde a faixa central sai de trás da faixa da frente (dali até a ponta, a cauda afina) */
export const TAPER_CTRL = TAIL.length + 4;
const BASE = [...TAIL, ...FIG];

const SAMPLES = 520;

/**
 * Saída (mergulho), relativa ao pescoço na pose final: a cabeça se ergue um pouco, vem em direção
 * a quem olha e despenca para baixo da tela; o último trecho é longo o bastante para o corpo
 * inteiro passar (ver o construtor).
 */
const EXIT: [number, number, number][] = [
  [0.3, 1.0, 1.2],
  [0.1, -1.5, 2.4],
  [-1.4, -6.5, 2.8],
  [0.4, -11.5, 2.6],
  [-0.6, -17.0, 2.4],
];

export class BodyPath {
  private cur: THREE.Vector3[];
  /** coeficientes cúbicos por segmento (x,y,z × c0..c3) */
  private coef: Float32Array;
  private pts = new Float32Array(SAMPLES * 3);
  private len = new Float32Array(SAMPLES);
  private neckCtrl: number;
  /** comprimento de arco até o pescoço (onde a cabeça fica na pose final) */
  length = 0;
  /** comprimento total, incluindo o trajeto do mergulho de saída */
  total = 0;

  constructor(neckFinal: THREE.Vector3, neckBack: THREE.Vector3) {
    // os 2 últimos pontos do corpo seguem o eixo da cabeça (sem quebra no pescoço)
    const c = BASE.map((p) => new THREE.Vector3(...p));
    c.push(neckFinal.clone().addScaledVector(neckBack, 1.1));
    c.push(neckFinal.clone());
    this.neckCtrl = c.length - 1;
    let body = 0;
    for (let i = TIP_CTRL + 1; i < c.length; i++) body += c[i]!.distanceTo(c[i - 1]!);
    for (const [x, y, z] of EXIT) c.push(neckFinal.clone().add(new THREE.Vector3(x, y, z)));
    c.push(c[c.length - 1]!.clone().add(new THREE.Vector3(-0.2, -(body * 1.15 + 6), 0)));
    this.cur = c.map((v) => v.clone());
    this.coef = new Float32Array((c.length - 1) * 12);
    this.base = c.map((v) => v.clone());
  }
  private base: THREE.Vector3[];

  /** Recalcula a curva com ondulação no tempo t (s). Pontos perto da cabeça ondulam menos. */
  update(t: number, energy: number) {
    const n = this.base.length;
    for (let i = 0; i < n; i++) {
      const b = this.base[i]!;
      // 0 no pescoço, no trajeto de saída e na ponta presa às esferas
      const k = Math.min(1, Math.max(0, this.neckCtrl - i) / 3, i / 2);
      const a = (0.14 + 0.08 * energy) * k; // pequeno: as voltas do "8" quase se tocam
      this.cur[i]!.set(
        b.x + a * Math.sin(t * 0.7 + i * 1.3),
        b.y + a * 0.8 * Math.sin(t * 0.55 + i * 0.9 + 1),
        b.z + a * Math.cos(t * 0.6 + i * 1.1),
      );
    }
    this.buildCoefficients();
    // amostragem uniforme no parâmetro + comprimento de arco acumulado
    const segs = n - 1;
    let acc = 0, px = 0, py = 0, pz = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const g = (i / (SAMPLES - 1)) * segs;
      const sgi = Math.min(segs - 1, Math.floor(g));
      const u = g - sgi;
      const o = sgi * 12;
      const c = this.coef;
      const x = c[o]! + u * (c[o + 1]! + u * (c[o + 2]! + u * c[o + 3]!));
      const y = c[o + 4]! + u * (c[o + 5]! + u * (c[o + 6]! + u * c[o + 7]!));
      const z = c[o + 8]! + u * (c[o + 9]! + u * (c[o + 10]! + u * c[o + 11]!));
      if (i > 0) acc += Math.hypot(x - px, y - py, z - pz);
      this.pts[i * 3] = x; this.pts[i * 3 + 1] = y; this.pts[i * 3 + 2] = z;
      this.len[i] = acc;
      px = x; py = y; pz = z;
    }
    this.total = acc;
    this.length = this.arcAtCtrl(this.neckCtrl);
  }

  /** Catmull-Rom centrípeto (mesma formulação do three.js), sem alocação por amostra. */
  private buildCoefficients() {
    const P = this.cur;
    const n = P.length;
    for (let s = 0; s < n - 1; s++) {
      const p0 = P[Math.max(0, s - 1)]!, p1 = P[s]!, p2 = P[s + 1]!, p3 = P[Math.min(n - 1, s + 2)]!;
      let dt0 = Math.pow(p0.distanceToSquared(p1), 0.25);
      let dt1 = Math.pow(p1.distanceToSquared(p2), 0.25);
      let dt2 = Math.pow(p2.distanceToSquared(p3), 0.25);
      if (dt1 < 1e-4) dt1 = 1.0;
      if (dt0 < 1e-4) dt0 = dt1;
      if (dt2 < 1e-4) dt2 = dt1;
      for (let a = 0; a < 3; a++) {
        const x0 = p0.getComponent(a), x1 = p1.getComponent(a), x2 = p2.getComponent(a), x3 = p3.getComponent(a);
        let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
        let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
        t1 *= dt1;
        t2 *= dt1;
        const o = s * 12 + a * 4;
        this.coef[o] = x1;
        this.coef[o + 1] = t1;
        this.coef[o + 2] = -3 * x1 + 3 * x2 - 2 * t1 - t2;
        this.coef[o + 3] = 2 * x1 - 2 * x2 + t1 + t2;
      }
    }
  }

  /** Comprimento de arco (a partir da raiz) no ponto de controle `k`. */
  arcAtCtrl(k: number) {
    const g = (k / (this.base.length - 1)) * (SAMPLES - 1);
    const i = Math.min(SAMPLES - 2, Math.floor(g));
    return this.len[i]! + (this.len[i + 1]! - this.len[i]!) * (g - i);
  }

  /** Índice da amostra cujo comprimento acumulado é ≤ u (para caminhar em sequência). */
  cursorAt(u: number) {
    let lo = 0, hi = SAMPLES - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.len[m]! < u) lo = m;
      else hi = m;
    }
    return lo;
  }

  /** Como at(), mas começando do cursor e andando para trás (u decrescente) — O(1) amortizado. */
  atFrom(u: number, cursor: number, out: THREE.Vector3) {
    if (u <= 0) { out.set(this.pts[0]!, this.pts[1]!, this.pts[2]!); return 0; }
    let lo = Math.min(cursor, SAMPLES - 2);
    while (lo > 0 && this.len[lo]! > u) lo--;
    while (lo < SAMPLES - 2 && this.len[lo + 1]! < u) lo++;
    const hi = lo + 1;
    const k = Math.min(1, Math.max(0, (u - this.len[lo]!) / (this.len[hi]! - this.len[lo]! || 1)));
    out.set(
      this.pts[lo * 3]! + (this.pts[hi * 3]! - this.pts[lo * 3]!) * k,
      this.pts[lo * 3 + 1]! + (this.pts[hi * 3 + 1]! - this.pts[lo * 3 + 1]!) * k,
      this.pts[lo * 3 + 2]! + (this.pts[hi * 3 + 2]! - this.pts[lo * 3 + 2]!) * k,
    );
    return lo;
  }

  /** Ponto no comprimento de arco u (0 = raiz). */
  at(u: number, out: THREE.Vector3) {
    if (u <= 0) return out.set(this.pts[0]!, this.pts[1]!, this.pts[2]!);
    if (u >= this.total) return out.set(this.pts[(SAMPLES - 1) * 3]!, this.pts[(SAMPLES - 1) * 3 + 1]!, this.pts[(SAMPLES - 1) * 3 + 2]!);
    let lo = 0, hi = SAMPLES - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.len[m]! < u) lo = m;
      else hi = m;
    }
    const k = (u - this.len[lo]!) / (this.len[hi]! - this.len[lo]! || 1);
    return out.set(
      this.pts[lo * 3]! + (this.pts[hi * 3]! - this.pts[lo * 3]!) * k,
      this.pts[lo * 3 + 1]! + (this.pts[hi * 3 + 1]! - this.pts[lo * 3 + 1]!) * k,
      this.pts[lo * 3 + 2]! + (this.pts[hi * 3 + 2]! - this.pts[lo * 3 + 2]!) * k,
    );
  }
}
