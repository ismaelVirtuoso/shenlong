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

const SAMPLES = 480;

export class BodyPath {
  private ctrl: THREE.Vector3[];
  private curve: THREE.CatmullRomCurve3;
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
    this.curve = new THREE.CatmullRomCurve3(c.map((v) => v.clone()), false, 'centripetal');
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
      this.curve.points[i]!.set(
        b.x + a * Math.sin(t * 0.7 + i * 1.3),
        b.y + a * 0.8 * Math.sin(t * 0.55 + i * 0.9 + 1),
        b.z + a * Math.cos(t * 0.6 + i * 1.1),
      );
    }
    const v = new THREE.Vector3();
    let acc = 0;
    for (let i = 0; i < SAMPLES; i++) {
      this.curve.getPoint(i / (SAMPLES - 1), v);
      if (i > 0) acc += Math.hypot(v.x - this.pts[(i - 1) * 3]!, v.y - this.pts[(i - 1) * 3 + 1]!, v.z - this.pts[(i - 1) * 3 + 2]!);
      this.pts[i * 3] = v.x; this.pts[i * 3 + 1] = v.y; this.pts[i * 3 + 2] = v.z;
      this.len[i] = acc;
    }
    this.length = acc;
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
