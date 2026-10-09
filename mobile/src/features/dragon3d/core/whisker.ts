import * as THREE from 'three';
import { computeFrames, createSpine, DynamicTube, type Spine } from './tube';

const N = 16;

/** Bigode longo com física verlet: preso no lábio, atraído para a forma de repouso, com inércia e vento. */
export class Whisker {
  readonly tube = new DynamicTube(N, 7);
  readonly spine: Spine = createSpine(N);
  private x = new Float32Array(N * 3);
  private prev = new Float32Array(N * 3);
  private rest: THREE.Vector3[] = [];
  private init = false;
  private seg: number;
  private tmp = new THREE.Vector3();

  constructor(private anchor: THREE.Vector3, private side: number, length = 3.2) {
    // forma de repouso: sai para o lado, arqueia para cima e cai para trás em S
    const shape = (a: number) =>
      new THREE.Vector3(side * (0.3 * a + 0.3 * Math.sin(Math.PI * a)), 0.15 * a - 1.5 * a * a, -0.55 * a - 0.7 * a * a + 0.15 * Math.sin(Math.PI * 2 * a));
    // reamostra por comprimento de arco: nós igualmente espaçados (sem conflito com as restrições)
    const dense: THREE.Vector3[] = [];
    const cum: number[] = [0];
    for (let i = 0; i <= 400; i++) {
      dense.push(shape(i / 400));
      if (i > 0) cum.push(cum[i - 1]! + dense[i]!.distanceTo(dense[i - 1]!));
    }
    const L = cum[400]!;
    const k = length / L;
    let c = 0;
    for (let j = 0; j < N; j++) {
      const target = (j / (N - 1)) * L;
      while (c < 399 && cum[c + 1]! < target) c++;
      const f = (target - cum[c]!) / (cum[c + 1]! - cum[c]! || 1);
      this.rest.push(dense[c]!.clone().lerp(dense[c + 1]!, f).multiplyScalar(k).add(anchor));
    }
    this.seg = length / (N - 1);
    for (let j = 0; j < N; j++) this.spine.r[j] = 0.034 * Math.pow(1 - j / (N - 1), 0.8) + 0.005;
  }

  update(head: THREE.Object3D, t: number, energy: number) {
    const { x, prev } = this;
    const target = this.tmp;
    for (let j = 0; j < N; j++) {
      target.copy(this.rest[j]!);
      head.localToWorld(target);
      if (!this.init) {
        x[j * 3] = prev[j * 3] = target.x;
        x[j * 3 + 1] = prev[j * 3 + 1] = target.y;
        x[j * 3 + 2] = prev[j * 3 + 2] = target.z;
        continue;
      }
      const a = j / (N - 1);
      const stiff = 0.12 * (1 - a) * (1 - a) + 0.02;
      for (let c = 0; c < 3; c++) {
        const i = j * 3 + c;
        const cur = x[i]!;
        const tv = c === 0 ? target.x : c === 1 ? target.y : target.z;
        let acc = (tv - cur) * stiff;
        if (c === 1) acc -= 0.0012 * a;
        if (c === 0) acc += Math.sin(t * 1.3 + a * 4 + this.side) * 0.0025 * a * (1 + energy * 2);
        if (c === 2) acc += Math.cos(t * 0.9 + a * 3) * 0.0018 * a * (1 + energy * 2);
        x[i] = cur + (cur - prev[i]!) * 0.86 + acc;
        prev[i] = cur;
      }
      if (j <= 1) { // base rígida
        x[j * 3] = target.x; x[j * 3 + 1] = target.y; x[j * 3 + 2] = target.z;
      }
    }
    this.init = true;
    for (let it = 0; it < 4; it++)
      for (let j = 1; j < N; j++) {
        const a = (j - 1) * 3, b = j * 3;
        const dx = x[b]! - x[a]!, dy = x[b + 1]! - x[a + 1]!, dz = x[b + 2]! - x[a + 2]!;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const k = (d - this.seg * head.scale.x) / d;
        const wa = j - 1 <= 1 ? 0 : 0.5, wb = j - 1 <= 1 ? 1 : 0.5;
        x[a] = x[a]! + dx * k * wa; x[a + 1] = x[a + 1]! + dy * k * wa; x[a + 2] = x[a + 2]! + dz * k * wa;
        x[b] = x[b]! - dx * k * wb; x[b + 1] = x[b + 1]! - dy * k * wb; x[b + 2] = x[b + 2]! - dz * k * wb;
      }
    this.spine.p.set(x);
    let s = 0;
    for (let j = 0; j < N; j++) {
      if (j > 0) s += this.seg * head.scale.x;
      this.spine.s[j] = s;
    }
    computeFrames(this.spine, target.set(0, 1, 0).applyQuaternion(head.quaternion));
    this.tube.update(this.spine);
  }
}
