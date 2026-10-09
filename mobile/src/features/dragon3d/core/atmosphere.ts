import * as THREE from 'three';
import type { DragonInput, QualityLevel } from './types';
import { makeCloudTexture, makeRayTexture } from './textures';

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Paletas do céu: 0 = noite do altar · 1 = tempestade · 2 = dragão presente (mesmas da cena 2D) */
const SKY = {
  top: ['#02030a', '#05071c', '#03140f'].map((c) => new THREE.Color(c)),
  mid: ['#080d2a', '#16215f', '#0c3d2d'].map((c) => new THREE.Color(c)),
  low: ['#1d0f1e', '#4d2412', '#946016'].map((c) => new THREE.Color(c)),
};
const pick = (arr: THREE.Color[], m: number, out: THREE.Color) =>
  m <= 1 ? out.copy(arr[0]!).lerp(arr[1]!, m) : out.copy(arr[1]!).lerp(arr[2]!, m - 1);

/** Céu, estrelas, nuvens em camadas, raios de luz volumétricos falsos e iluminação de cinema. */
export class Atmosphere {
  readonly group = new THREE.Group();
  readonly fog = new THREE.FogExp2('#0b1a22', 0.03);
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private clouds: { s: THREE.Sprite; base: THREE.Vector3; sp: number; ph: number; front: boolean }[] = [];
  private rays: THREE.Mesh[] = [];
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly top: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly balls: THREE.PointLight;
  readonly flash: THREE.DirectionalLight;
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();
  private c3 = new THREE.Color();

  constructor(quality: QualityLevel) {
    // céu: esfera invertida com degradê vertical
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uGlow: { value: 0 } },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform float uGlow; varying vec3 vPos;
        void main(){
          vec3 vDir = normalize(vPos); // por fragmento: sem artefatos de interpolação
          float y = vDir.y;
          vec3 c = mix(uLow, uMid, smoothstep(-0.35, 0.05, y));
          c = mix(c, uTop, smoothstep(0.05, 0.55, y));
          // halo atrás do dragão
          float d = max(0.0, dot(vDir, normalize(vec3(0.0, 0.2, -1.0))));
          c += vec3(1.0, 0.72, 0.3) * (pow(d, 160.0) * 0.22 + pow(d, 12.0) * 0.025) * uGlow;
          // brilho quente baixo (esferas lá embaixo)
          c += vec3(0.9, 0.42, 0.1) * pow(max(0.0, 1.0 - abs(y + 0.2) * 4.0), 4.0) * uGlow * 0.12;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), this.skyMat);
    sky.name = 'sky';
    sky.frustumCulled = false;
    this.group.add(sky);

    const sp = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      const th = Math.random() * Math.PI * 2, y = 0.05 + Math.random() * 0.9;
      const r = Math.sqrt(1 - y * y);
      sp.set([Math.cos(th) * r * 80, y * 80, Math.sin(th) * r * 80 - 20], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.group.add(this.stars);

    // nuvens: sprites em profundidades diferentes, intercaladas com as voltas do corpo
    const tex = makeCloudTexture(128);
    const n = quality === 'low' ? 10 : quality === 'medium' ? 16 : 22;
    for (let i = 0; i < n; i++) {
      const front = i % 3 === 0;
      const base = new THREE.Vector3(
        (Math.random() - 0.5) * (front ? 9 : 26),
        front ? -5.2 + Math.random() * 1.4 : -7 + Math.random() * 5,
        front ? 2 + Math.random() * 5 : -16 + Math.random() * 12,
      );
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, rotation: Math.random() * 6 }));
      const sc = front ? 5 + Math.random() * 4 : 7 + Math.random() * 8;
      s.scale.set(sc, sc * 0.6, 1);
      s.position.copy(base);
      this.clouds.push({ s, base, sp: 0.04 + Math.random() * 0.06, ph: Math.random() * 6, front });
      this.group.add(s);
    }

    // feixes de luz atrás do dragão
    const rayTex = makeRayTexture();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(3 + i, 26),
        new THREE.MeshBasicMaterial({ map: rayTex, color: '#ffe2a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
      );
      m.position.set(-4 + i * 2.6, 6, -12 - i);
      m.rotation.z = -0.35 + i * 0.22;
      m.name = 'ray';
      this.rays.push(m);
      this.group.add(m);
    }

    // luzes
    this.hemi = new THREE.HemisphereLight('#3f6a50', '#5a3a14', 0.5);
    this.key = new THREE.DirectionalLight('#ffc070', 2.4); // luz dourada das esferas (de baixo/frente)
    this.key.position.set(2.5, -2.5, 9);
    this.rim = new THREE.DirectionalLight('#ffe0b0', 3.0); // contraluz do halo dourado: silhueta
    this.rim.position.set(-4, 7, -10);
    this.top = new THREE.DirectionalLight('#dfe8ff', 1.1); // lua/topo: projeta sombras
    this.top.position.set(1.5, 12, 5);
    this.flash = new THREE.DirectionalLight('#cfe0ff', 0);
    this.flash.position.set(-3, 10, 6);
    this.balls = new THREE.PointLight('#ff9a3a', 0, 30, 1.6);
    this.balls.position.set(0, -3.5, 4.5);
    if (quality !== 'low') {
      this.top.castShadow = true;
      const sz = quality === 'high' ? 2048 : 1024;
      this.top.shadow.mapSize.set(sz, sz);
      const c = this.top.shadow.camera;
      c.left = -9; c.right = 9; c.top = 10; c.bottom = -10; c.near = 1; c.far = 40;
      this.top.shadow.bias = -0.0006;
      this.top.shadow.normalBias = 0.03;
    }
    this.group.add(this.hemi, this.key, this.rim, this.top, this.flash, this.balls);
  }

  update(inp: DragonInput, scene: THREE.Scene) {
    const t = inp.t / 1000;
    const mood = Math.min(2, inp.summon * 0.9 + inp.appear * 1.1);
    pick(SKY.top, mood, this.c1);
    pick(SKY.mid, mood, this.c2);
    pick(SKY.low, mood, this.c3);
    this.skyMat.uniforms.uTop!.value.copy(this.c1);
    this.skyMat.uniforms.uMid!.value.copy(this.c2);
    this.skyMat.uniforms.uLow!.value.copy(this.c3);
    this.skyMat.uniforms.uGlow!.value = 0.15 + 0.85 * inp.appear + 0.6 * inp.wish;
    (this.fog.color as THREE.Color).copy(this.c2).lerp(this.c3, 0.25);
    scene.background = null;

    (this.stars.material as THREE.PointsMaterial).opacity = (1 - sstep(0.4, 1.3, mood)) * (0.7 + 0.3 * Math.sin(t * 1.4));

    const lit = this.c1.set('#ffb35c');
    for (const c of this.clouds) {
      c.s.position.set(c.base.x + Math.sin(t * c.sp + c.ph) * 1.4, c.base.y + Math.cos(t * c.sp * 0.7 + c.ph) * 0.3, c.base.z);
      const m = c.s.material as THREE.SpriteMaterial;
      // nuvens de baixo pegam a luz dourada das esferas
      m.color.copy(this.c2).multiplyScalar(1.6).lerp(lit, (c.front ? 0.45 : 0.12) * (0.3 + 0.7 * Math.max(inp.glow * 0.6, inp.appear, inp.summon)));
      m.color.lerp(this.c3.set('#ffffff'), inp.flash * 0.6);
      m.opacity = c.front ? 0.9 : 0.55;
    }
    const rayA = 0.035 * inp.appear + 0.03 * inp.summon + 0.12 * inp.wish;
    this.rays.forEach((r, i) => {
      (r.material as THREE.MeshBasicMaterial).opacity = rayA * (0.6 + 0.4 * Math.sin(t * 0.7 + i * 1.7));
    });

    this.key.intensity = 0.4 + 1.3 * inp.appear + 1.2 * inp.wish;
    this.rim.intensity = 0.8 + 2.4 * inp.appear;
    this.top.intensity = 0.4 + 0.8 * inp.appear;
    this.flash.intensity = 7 * inp.flash;
    this.balls.intensity = 30 * (0.2 + 0.5 * inp.glow + 0.6 * inp.summon) * (1 - 0.5 * inp.appear) + 20 * inp.wish;
    this.hemi.intensity = 0.35 + 0.35 * inp.appear;
    this.fog.density = 0.026 + 0.012 * (1 - inp.appear);
  }
}
