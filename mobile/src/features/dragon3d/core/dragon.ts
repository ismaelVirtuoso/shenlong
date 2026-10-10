import * as THREE from 'three';
import type { DragonAsset } from './glb';
import { bodySpine, shared, type DragonMaterials } from './materials';
import { BodyPath, FIGURE, LEG_CTRL, TAPER_CTRL, TIP_CTRL } from './path';
import { computeFrames, createSpine, GpuTube, type Spine } from './tube';
import { Whisker } from './whisker';
import type { DragonInput, QualityLevel } from './types';
import { makeGlowTexture } from './textures';

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** posição (fração do corpo) do anel x∈[0,1]: anéis ~3× mais densos na cauda, para o caracol fino sair redondo */
const ringFrac = (x: number) => x + 0.7 * x * x * (1 - x);
/** comprimento (a partir da ponta) em que a cauda afina até a ponta */
const TIP_LEN = 2.4;

/** Pose final da cabeça (mundo): no cruzamento do "8", à frente das voltas — ver path.ts / DragonScene. */
export const HEAD_FINAL = new THREE.Vector3(FIGURE.cx, FIGURE.cy + 0.05 * FIGURE.h, 1.6);
/** como no anime: encara quem invocou, focinho para baixo e para a esquerda, chifres para cima/direita */
const HEAD_DOWN_LEFT = new THREE.Vector3(-0.5, -0.87, 0).normalize();
const HEAD_TILT = 0.5; // rad entre o eixo da cabeça e a direção da câmera
const HEAD_UP = new THREE.Vector3(0.29, 0.96, 0);
/** escala da cabeça esculpida em relação ao corpo (anime: cabeça ≈ 2,2× o diâmetro do corpo) */
const HEAD_SCALE = 1.5;

/** raio do corpo na volta de cima (a mais grossa); anime: diâmetro ≈ 16% da largura do "8" */
const BODY_R = 0.8;
const SPIKE_STEP = 0.3;
/** dorso para fora das voltas e levemente para longe da câmera: a barriga aparece por dentro (como no anime) */
const AWAY = new THREE.Vector3(-0.15, -0.35, -1).normalize();
/** lado de cada pata (+1 direita, −1 esquerda) e qual par (frente/trás) */
const LEGS: ['front' | 'rear', number][] = [['front', 1], ['front', -1], ['rear', 1], ['rear', -1]];

/** Anel mais próximo do comprimento de arco `s` (os anéis não são equidistantes). */
function ringAt(sp: Spine, s: number) {
  let lo = 0, hi = sp.count - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (sp.s[m]! < s) lo = m;
    else hi = m;
  }
  return s - sp.s[lo]! < sp.s[hi]! - s ? lo : hi;
}

/** Cor do corpo em função da posição angular (0 = dorso, 0.5 = ventre). */
function bodyColor(side01: number): [number, number, number] {
  const c = Math.cos(side01 * Math.PI * 2); // 1 dorso, -1 ventre
  const lin = (h: string) => new THREE.Color(h); // THREE.Color converte sRGB→linear
  // paleta da referência: verde-limão, barriga pêssego e a linha vermelha entre os dois
  const top = lin('#2d8a29'), mid = lin('#4cb83a'), side = lin('#86d85c'), belly = lin('#f0c28c'), stripe = lin('#d8442a');
  const col = new THREE.Color();
  if (c > 0.3) col.copy(mid).lerp(top, sstep(0.3, 0.95, c));
  else if (c > -0.3) col.copy(side).lerp(mid, sstep(-0.3, 0.3, c));
  else if (c > -0.42) col.copy(stripe);
  else col.copy(belly);
  return [col.r, col.g, col.b];
}

export class Dragon {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  private jaw = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private eyeGlows: THREE.Sprite[] = [];
  private redGlows: THREE.Sprite[] = [];
  private orb: THREE.Sprite;
  private eyeLight = new THREE.PointLight('#ff1a0a', 0, 3.2, 2);
  private path: BodyPath;
  private spine: Spine;
  private body: GpuTube;
  private bodyMesh: THREE.Mesh;
  private spikes: THREE.InstancedMesh;
  private legs: THREE.Mesh[] = [];
  private whiskers: Whisker[] = [];
  private neckOffset: THREE.Vector3;
  private qFinal = new THREE.Quaternion();
  private bodyLength: number;
  /** fração do corpo (a partir do pescoço) onde a cauda começa a afinar */
  private taperK: number;
  /** distância (a partir da cabeça) de cada par de patas */
  private legAt = { front: 3, rear: 12 };
  private rings: number;
  private matEye: THREE.ShaderMaterial;
  /** materiais sem shader próprio (bigodes, espinhos): dourados via emissive na saída */
  private plainMats: THREE.MeshStandardMaterial[];
  private goldColor = new THREE.Color(1, 0.55, 0.08);

  // temporários
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private e1 = new THREE.Euler();
  private tv = { T: new THREE.Vector3(), N: new THREE.Vector3(), B: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3() };
  private pt = new THREE.Vector3();
  private neckPos = new THREE.Vector3();
  private travel = new THREE.Vector3();

  constructor(asset: DragonAsset, mats: DragonMaterials, quality: QualityLevel, camera: THREE.Vector3) {
    const hi = quality === 'high';
    const g = (name: string) => {
      const m = asset.meshes[name];
      if (!m) throw new Error(`malha ausente no GLB: ${name}`);
      return m;
    };
    // ── cabeça ──
    this.head.add(new THREE.Mesh(g(hi ? 'head_hi' : 'head_lo'), mats.head));
    this.head.add(new THREE.Mesh(g('horns'), mats.horn));
    this.head.add(new THREE.Mesh(g('mane'), mats.mane));
    this.head.add(new THREE.Mesh(g('teeth_upper'), mats.teeth));
    const pivot = asset.nodes.jaw_pivot ?? new THREE.Vector3(0, -0.12, -0.16);
    this.jaw.position.copy(pivot);
    const jawMesh = new THREE.Mesh(g(hi ? 'jaw_hi' : 'jaw_lo'), mats.head);
    const lowTeeth = new THREE.Mesh(g('teeth_lower'), mats.teeth);
    jawMesh.position.copy(pivot).negate();
    lowTeeth.position.copy(pivot).negate();
    this.jaw.add(jawMesh, lowTeeth);
    this.head.add(this.jaw);

    this.matEye = mats.eye;
    this.plainMats = [mats.whisker, mats.spike];
    const glowTex = makeGlowTexture();
    // olho amendoado e inclinado (canto externo para cima), como no anime
    const eyeGeo = new THREE.SphereGeometry(0.1, 32, 16);
    for (const n of ['eye_R', 'eye_L']) {
      const p = asset.nodes[n]!;
      const e = new THREE.Mesh(eyeGeo, mats.eye);
      const sgn = Math.sign(p.x);
      e.position.copy(p).add(new THREE.Vector3(0, 0.005, -0.012));
      e.rotation.set(0, sgn * 0.28, sgn * 0.36);
      e.userData.base = new THREE.Vector3(1.45, 0.78, 0.85);
      e.scale.copy(e.userData.base);
      this.head.add(e);
      this.eyes.push(e);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff1408', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
      s.position.copy(p).add(new THREE.Vector3(0, 0, 0.08));
      this.head.add(s);
      this.eyeGlows.push(s);
      // olhos em brasa: halo vermelho opaco (o aditivo sobre a pele verde ficaria laranja)
      const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#e80000', depthWrite: false, transparent: true, fog: false, toneMapped: false }));
      r.position.copy(p).add(new THREE.Vector3(0, 0, 0.1));
      r.renderOrder = 2;
      r.visible = false;
      this.head.add(r);
      this.redGlows.push(r);
    }
    // luz vermelha dos olhos em brasa (sempre na cena: ligar/desligar luzes recompila os shaders)
    this.eyeLight.position.set(0, 0.05, 0.9);
    this.head.add(this.eyeLight);
    this.orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd76a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.orb.position.set(0, 1.25, -0.2);
    this.head.add(this.orb);

    // ── corpo ──
    const neck = asset.nodes.neck ?? new THREE.Vector3(0, -0.12, -1.3);
    this.neckOffset = neck.clone().negate();
    const toCam = camera.clone().sub(HEAD_FINAL).normalize();
    const fwd = toCam.multiplyScalar(Math.cos(HEAD_TILT)).addScaledVector(HEAD_DOWN_LEFT, Math.sin(HEAD_TILT)).normalize();
    const X = new THREE.Vector3().crossVectors(HEAD_UP, fwd).normalize();
    const Y = new THREE.Vector3().crossVectors(fwd, X);
    this.qFinal.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, fwd));
    const neckFinal = HEAD_FINAL.clone().add(neck.clone().multiplyScalar(HEAD_SCALE).applyQuaternion(this.qFinal));
    const neckBack = new THREE.Vector3(0, 0, -1).applyQuaternion(this.qFinal);
    this.path = new BodyPath(neckFinal, neckBack);
    this.path.update(0, 0);
    this.bodyLength = this.path.length - this.path.arcAtCtrl(TIP_CTRL);
    this.taperK = (this.path.length - this.path.arcAtCtrl(TAPER_CTRL)) / this.bodyLength;
    this.legAt = {
      front: this.path.length - this.path.arcAtCtrl(LEG_CTRL.front),
      rear: this.path.length - this.path.arcAtCtrl(LEG_CTRL.rear),
    };

    this.rings = hi ? 200 : quality === 'medium' ? 160 : 120;
    const sides = hi ? 32 : quality === 'medium' ? 26 : 20;
    this.spine = createSpine(this.rings);
    this.body = new GpuTube(this.rings, sides, { vRepeat: 4, flatBelly: 0.5, uScale: 1.2, colors: bodyColor });
    bodySpine.uSpine.value = this.body.uniforms.uSpine.value;
    this.bodyMesh = new THREE.Mesh(this.body.geometry, mats.body);
    this.bodyMesh.frustumCulled = false;

    // espinhos dorsais (lâminas finas, inclinadas para trás)
    const spikeGeo = new THREE.ConeGeometry(0.5, 1, 6, 4, false);
    spikeGeo.translate(0, 0.5, 0);
    const sc = new Float32Array(spikeGeo.attributes.position!.count * 3);
    const base = new THREE.Color('#1b5e1c'), tip = new THREE.Color('#3f9a2f');
    for (let i = 0; i < spikeGeo.attributes.position!.count; i++) {
      const c = base.clone().lerp(tip, spikeGeo.attributes.position!.getY(i));
      sc.set([c.r, c.g, c.b], i * 3);
    }
    spikeGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    mats.spike.vertexColors = true;
    mats.spike.color.set('#ffffff');
    const spikeCount = Math.floor((this.bodyLength - 3) / SPIKE_STEP);
    this.spikes = new THREE.InstancedMesh(spikeGeo, mats.spike, spikeCount);
    this.spikes.frustumCulled = false;

    for (const [, side] of LEGS) {
      const leg = new THREE.Mesh(g('leg'), mats.head);
      leg.scale.set(side, 1, 1);
      this.legs.push(leg);
    }

    for (const n of ['whisker_R', 'whisker_L'] as const) {
      const a = asset.nodes[n]!;
      const w = new Whisker(a, Math.sign(a.x), 4.4);
      const m = new THREE.Mesh(w.tube.geometry, mats.whisker);
      m.frustumCulled = false;
      this.whiskers.push(w);
      this.root.add(m);
    }

    this.root.add(this.head, this.bodyMesh, this.spikes, ...this.legs);
    this.root.name = 'dragon';
  }

  /** Quaternion com +Z (frente da cabeça) apontando para `dir`. */
  private lookQuat(dir: THREE.Vector3, out: THREE.Quaternion) {
    const up = Math.abs(dir.y) > 0.92 ? this.v3.set(0, 0, 1) : this.v3.set(0, 1, 0);
    this.m4.lookAt(dir, this.v2.set(0, 0, 0), up);
    return out.setFromRotationMatrix(this.m4);
  }

  update(inp: DragonInput, camera: THREE.Camera) {
    const t = inp.t / 1000;
    const dive = inp.dive;
    // no mergulho de saída a pose não recua: o corpo segue a cabeça para baixo da tela
    const p = dive > 0 ? 1 : inp.appear;
    // na saída dourada o corpo some no auge do estouro de luz (a cena 2D cobre com o clarão)
    this.root.visible = inp.gold < 1.98 && (dive > 0 ? dive < 0.999 : p > 0.002);
    shared.uGold.value = inp.gold;
    if (!this.root.visible) return;
    const g = Math.min(1, inp.gold);
    for (const m of this.plainMats) {
      m.emissive.copy(this.goldColor);
      m.emissiveIntensity = g * (0.6 + 4 * Math.max(0, inp.gold - 1) ** 2);
    }

    const P0 = performance.now();
    this.path.update(t, inp.wish + inp.speak * 0.3);
    const P1 = performance.now();
    const L = this.path.length;
    const headU = L * p + (this.path.total - L) * dive;

    // ── cabeça: segue o caminho ao surgir, encara a câmera (3/4) e, no mergulho, aponta para onde vai ──
    const neckPos = this.path.at(headU, this.neckPos);
    const behind = this.path.at(headU - 0.6, this.v1);
    const travel = this.travel.copy(neckPos).sub(behind).normalize();
    this.lookQuat(travel, this.q1);
    const front = sstep(0.68, 0.98, p) * (1 - sstep(0, 0.1, dive));
    this.q1.slerp(this.qFinal, front);
    // vida: respiração, inclinação ao ouvir, olhar para cima ao pensar, sacudida ao toque, acenos ao falar
    const env = Math.abs(Math.sin(inp.t * 0.0155)) * (0.6 + 0.4 * Math.sin(inp.t * 0.0071 + 2));
    this.e1.set(
      0.04 * Math.sin(t * 0.8) - 0.1 * inp.think + 0.05 * inp.speak * env - 0.04 * inp.listen,
      0.06 * Math.sin(t * 0.45) + 0.08 * inp.think * Math.sin(t * 0.7) + 0.12 * inp.poke * Math.sin(t * 25),
      0.14 * inp.listen * Math.sin(t * 0.9 + 0.5) + 0.03 * Math.sin(t * 0.6),
    );
    this.q2.setFromEuler(this.e1);
    this.head.quaternion.copy(this.q1).multiply(this.q2);
    const breathe = HEAD_SCALE * (1 + 0.01 * Math.sin(t * 1.7) + 0.04 * inp.wish);
    this.head.scale.setScalar(breathe);
    this.head.position.copy(neckPos).add(this.v2.copy(this.neckOffset).multiplyScalar(breathe).applyQuaternion(this.head.quaternion));
    this.head.updateMatrixWorld(true);

    // mandíbula: envelope de fala (sílabas ~5 Hz) + rugido no desejo
    // boca entreaberta em repouso (presas à mostra); fala abre o suficiente p/ ver língua/palato
    const jawOpen = 0.32 + inp.speak * (0.2 + 0.55 * env) + 0.3 * inp.wish + 0.1 * inp.poke;
    this.jaw.rotation.x = jawOpen * 0.7;

    // olhos: seguem a câmera, piscam, brilham ao falar/ouvir/desejo;
    // desejo aceito (grant): arregalados, em brasa vermelha pulsando até a partida
    const ph = t % 4.6;
    const grant = inp.grant;
    const blink = (ph < 0.16 ? Math.max(0.08, Math.abs(ph - 0.08) / 0.08) : 1) * (1 - grant) + grant;
    const pulse = grant * (0.85 + 0.15 * Math.sin(t * 5));
    const glow = 0.35 + 0.35 * sstep(0.6, 1, p) + 0.5 * inp.speak + 0.9 * inp.wish + 0.2 * inp.listen + 1.8 * pulse;
    this.matEye.uniforms.uGlow!.value = glow;
    this.matEye.uniforms.uPupil!.value = 1 - 0.4 * inp.wish + 0.3 * inp.think - 0.5 * grant;
    for (const e of this.eyes) {
      const b0 = e.userData.base as THREE.Vector3;
      e.scale.set(b0.x, b0.y * blink * (1 - 0.3 * inp.think), b0.z);
    }
    for (const s of this.eyeGlows) {
      s.scale.setScalar(0.28 + 0.24 * Math.min(glow - 1.8 * pulse, 2) + 0.3 * pulse);
      (s.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.25 + 0.5 * glow) * blink;
    }
    const ember = pulse * (1 - Math.min(1, inp.gold));
    for (const r of this.redGlows) {
      r.visible = ember > 0.01;
      r.scale.setScalar(0.42 + 0.06 * Math.sin(t * 5));
      (r.material as THREE.SpriteMaterial).opacity = 0.9 * ember;
    }
    this.eyeLight.intensity = 6 * ember;
    this.orb.scale.setScalar(0.6 + 0.25 * Math.sin(t * 6));
    (this.orb.material as THREE.SpriteMaterial).opacity = inp.think * 0.9;
    this.orb.visible = inp.think > 0.01;

    // ── espinha do corpo ──
    const sp = this.spine;
    const n = this.rings;
    const BL = this.bodyLength;
    const headBack = this.v3.set(0, 0, -1).applyQuaternion(this.head.quaternion);
    const blendLen = 2.2;
    const pt = this.pt;
    let cursor = this.path.cursorAt(headU);
    for (let i = 0; i < n; i++) {
      const s = ringFrac(i / (n - 1)) * BL;
      const u = headU - s;
      cursor = this.path.atFrom(u, cursor, pt);
      if (s < blendLen) {
        const w = sstep(0, blendLen, s);
        pt.lerp(this.v1.copy(neckPos).addScaledVector(headBack, s), 1 - w);
      }
      sp.p[i * 3] = pt.x; sp.p[i * 3 + 1] = pt.y; sp.p[i * 3 + 2] = pt.z;
      sp.s[i] = s;
      // perfil do anime: nuca mais grossa (cobre o pescoço esculpido); a volta de cima é a mais grossa,
      // a faixa da frente ~70% dela, a volta pequena de baixo ~50% e o caracol da cauda afina até a ponta
      const k = s / BL;
      let r = BODY_R * (1 + 0.14 * (1 - sstep(0, 0.05, k)) - 0.3 * sstep(0.25, 0.6, k) - 0.28 * sstep(this.taperK, 1, k));
      r *= Math.pow(sstep(0, TIP_LEN, BL - s), 0.7);
      r *= sstep(-0.2, 0.6, u);
      sp.r[i] = Math.max(0.0005, r);
    }
    const P2 = performance.now();
    // nuca com o dorso da cabeça; nas voltas (e no caracol da cauda), barriga por dentro e virada para quem olha
    computeFrames(sp, this.v2.set(0, 1, 0).applyQuaternion(this.head.quaternion), AWAY, 0.6);
    const P3 = performance.now();
    this.body.update(sp);
    const P4 = performance.now();

    // espinhos dorsais
    const { T, N, B, Y, Z } = this.tv;
    let count = 0;
    for (let j = 0; j < this.spikes.count; j++) {
      const s = 2.6 + j * SPIKE_STEP;
      const i = ringAt(sp, s);
      if (headU - s < 0.4) break;
      T.fromArray(sp.t, i * 3); N.fromArray(sp.n, i * 3); B.fromArray(sp.b, i * 3);
      const r = sp.r[i]!;
      const sway = 0.08 * Math.sin(t * 2 + j * 0.7);
      Y.copy(N).multiplyScalar(Math.cos(0.75 + sway)).addScaledVector(T, Math.sin(0.75 + sway)).normalize();
      Z.crossVectors(B, Y).normalize();
      const h = r * (0.5 + 0.15 * Math.sin(j * 1.7)) * (1 - 0.4 * sstep(0.7, 1, s / BL));
      this.m4.makeBasis(B.multiplyScalar(r * 0.12), Y.multiplyScalar(h), Z.multiplyScalar(r * 0.7));
      this.m4.setPosition(this.v1.fromArray(sp.p, i * 3).addScaledVector(N, r * 0.78));
      this.spikes.setMatrixAt(count++, this.m4);
    }
    this.spikes.count = count;
    this.spikes.instanceMatrix.needsUpdate = true;

    // patas
    LEGS.forEach(([pair, side], li) => {
      const s = this.legAt[pair];
      const leg = this.legs[li]!;
      const i = ringAt(sp, s);
      leg.visible = headU - s > 0.5;
      if (!leg.visible) return;
      T.fromArray(sp.t, i * 3); N.fromArray(sp.n, i * 3); B.fromArray(sp.b, i * 3);
      const r = sp.r[i]!;
      const paddle = 0.12 * Math.sin(t * 1.6 + li * 1.9);
      leg.position.fromArray(sp.p, i * 3);
      const toCam = this.v1.copy(camera.position).sub(leg.position).normalize();
      // malha: braço para −Y até o cotovelo, antebraço para +Z, palma para +X
      const raised = pair === 'front' && side * B.dot(toCam) > 0;
      if (raised) {
        // anime: braço para fora do dorso (em direção à cauda), cotovelo dobrado, antebraço erguido
        Y.copy(N).multiplyScalar(-0.75).addScaledVector(T, -0.65).normalize();
        Z.copy(N).sub(T);
      } else if (pair === 'rear') {
        // anime: coxa sobe rente ao lado de dentro da volta de baixo; antebraço entra na volta, garras para baixo
        Y.copy(N).multiplyScalar(0.45).addScaledVector(T, -0.8).normalize();
        Z.copy(N).negate().addScaledVector(T, -0.6);
      } else {
        // pata da frente de dentro da volta de cima: braço para dentro, antebraço em direção à cabeça
        Y.copy(N).multiplyScalar(0.9).addScaledVector(B, -side * 0.4).normalize();
        Z.copy(T).negate();
      }
      Z.addScaledVector(Y, -Y.dot(Z)).normalize();
      const X = this.v2.crossVectors(Y, Z).normalize();
      const palm = X.dot(toCam) >= 0 ? 1 : -1; // palma e garras sempre voltadas para quem olha
      this.m4.makeBasis(X, Y, Z);
      leg.quaternion.setFromRotationMatrix(this.m4);
      leg.rotateX(paddle);
      // braço ≈ diâmetro do corpo até o cotovelo, como no desenho; o de trás é menor
      const sc = (pair === 'rear' ? 1.9 : 2.4) * (r / BODY_R);
      leg.scale.set(palm * sc, sc, sc);
      leg.position.addScaledVector(B, side * r * 0.6).addScaledVector(N, (raised ? 0.3 : -0.3) * r);
    });

    const P5 = performance.now();
    for (const w of this.whiskers) w.update(this.head, t, inp.wish + inp.speak * 0.5);
    const P6 = performance.now();
    const pr = this.prof;
    const add = (i: number, v: number) => (pr[i] = (pr[i] ?? 0) + v);
    add(0, P1 - P0); add(1, P2 - P1); add(2, P3 - P2); add(3, P4 - P3); add(4, P5 - P4); add(5, P6 - P5); add(6, 1);
    if ((pr[6] ?? 0) >= 60 && process.env.EXPO_PUBLIC_PROFILE === '1') {
      const f = (i: number) => ((pr[i] ?? 0) / 60).toFixed(1);
      console.log(`[dragon3d] perfil: path ${f(0)} · espinha ${f(1)} · frames ${f(2)} · tubo ${f(3)} · espinhos+patas ${f(4)} · bigodes ${f(5)} ms`);
      pr.fill(0);
    }
  }
  private prof = [0, 0, 0, 0, 0, 0, 0];
}
