import * as THREE from 'three';

/**
 * Trajetória do corpo no mundo, da raiz (dentro das nuvens, embaixo) até o pescoço.
 * Ao surgir, a cabeça percorre esse caminho e o corpo a segue (como uma serpente de verdade).
 * Os pontos ondulam levemente com o tempo (respiração/serpenteio).
 */
const BASE: [number, number, number][] = [
  [0.0, -11.0, -2.0], // raiz: sob o pilar de luz
  [0.0, -6.5, -2.5],
  [0.2, -2.5, -4.0], // sobe pelo centro
  [1.7, 1.5, -6.5],
  [0.0, 4.4, -9.2], // passa alto, ao fundo
  [-2.5, 3.0, -7.0],
  [-2.6, 0.4, -3.6],
  [-1.0, -1.2, -0.7], // volta baixa à frente
  [1.25, -0.8, 0.6],
  [1.35, 0.9, 1.9],
];

const SAMPLES = 260;

export class BodyPath {
  private ctrl: THREE.Vector3[];
  private cur: THREE.Vector3[];
  /** coeficientes cúbicos por segmento (x,y,z × c0..c3) */
  private coef: Float32Array;
  private pts = new Float32Array(SAMPLES * 3);
  private len = new Float32Array(SAMPLES);
  length = 0;

  constructor(neckFinal: THREE.Vector3, neckBack: THREE.Vector3) {
    // últimos pontos: atrás do pescoço, alinhados ao eixo da cabeça (pescoço sem quebra)
    const c = BASE.map((p) => new THREE.Vector3(...p));
    c.push(neckFinal.clone().addScaledVector(neckBack, 2.4).add(new THREE.Vector3(0.4, -0.9, 0)));
    c.push(neckFinal.clone().addScaledVector(neckBack, 0.9));
    c.push(neckFinal.clone());
    this.ctrl = c;
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
      const k = Math.min(1, (n - 1 - i) / 3); // 0 no pescoço
      const a = (0.28 + 0.12 * energy) * k;
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
    this.length = acc;
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
    if (u >= this.length) return out.set(this.pts[(SAMPLES - 1) * 3]!, this.pts[(SAMPLES - 1) * 3 + 1]!, this.pts[(SAMPLES - 1) * 3 + 2]!);
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
