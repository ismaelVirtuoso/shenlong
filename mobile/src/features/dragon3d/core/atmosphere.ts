import * as THREE from 'three';
import type { DragonInput, QualityLevel } from './types';
import { makeCloudTexture, makeRayTexture } from './textures';
import { createLandscape } from './landscape';

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
  private clouds: { base: THREE.Vector3; sp: number; ph: number; front: boolean }[] = [];
  private cloudPos!: THREE.BufferAttribute;
  private cloudMat!: THREE.ShaderMaterial;
  private rayMat!: THREE.MeshBasicMaterial;
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly top: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
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

    this.group.add(createLandscape(quality));

    // nuvens: uma única malha de quads com billboard no vertex shader (1 draw call), em profundidades
    // diferentes, intercaladas com as voltas do corpo
    const tex = makeCloudTexture(128);
    const n = quality === 'low' ? 10 : quality === 'medium' ? 16 : 22;
    const pos = new Float32Array(n * 4 * 3), corner = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const front = i % 3 === 0;
      const base = new THREE.Vector3(
        (Math.random() - 0.5) * (front ? 9 : 26),
        front ? -8.2 + Math.random() * 1.4 : -9 + Math.random() * 5, // abaixo da cauda: o "8" fica inteiro à vista
        front ? 2 + Math.random() * 5 : -16 + Math.random() * 12,
      );
      const sc = front ? 5 + Math.random() * 4 : 7 + Math.random() * 8;
      this.clouds.push({ base, sp: 0.04 + Math.random() * 0.06, ph: Math.random() * 6, front });
      const rot = Math.random() * 6;
      for (let k = 0; k < 4; k++) {
        const cx = k === 0 || k === 3 ? -0.5 : 0.5, cy = k < 2 ? -0.5 : 0.5;
        const rx = cx * Math.cos(rot) - cy * Math.sin(rot), ry = cx * Math.sin(rot) + cy * Math.cos(rot);
        pos.set([base.x, base.y, base.z], (i * 4 + k) * 3);
        // xy = canto já girado e escalado; z = 1 se nuvem da frente
        corner.set([rx * sc, ry * sc * 0.6, front ? 1 : 0], (i * 4 + k) * 3);
        uv.set([cx + 0.5, cy + 0.5], (i * 4 + k) * 2);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    const cg = new THREE.BufferGeometry();
    this.cloudPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    cg.setAttribute('position', this.cloudPos);
    cg.setAttribute('corner', new THREE.BufferAttribute(corner, 3));
    cg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    cg.setIndex(idx);
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uMap: { value: tex }, uBack: { value: new THREE.Color() }, uFront: { value: new THREE.Color() } },
      ]),
      vertexShader: /* glsl */ `
        attribute vec3 corner;
        varying vec2 vUv; varying float vFront;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vFront = corner.z;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          mvPosition.xy += corner.xy; // billboard: sempre de frente para a câmera
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uBack; uniform vec3 uFront;
        varying vec2 vUv; varying float vFront;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(uMap, vUv);
          gl_FragColor = vec4(mix(uBack, uFront, vFront) * t.rgb, t.a * mix(0.55, 0.9, vFront));
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const clouds = new THREE.Mesh(cg, this.cloudMat);
    clouds.frustumCulled = false;
    clouds.renderOrder = 1;
    this.group.add(clouds);

    // feixes de luz atrás do dragão (uma geometria só)
    const rayTex = makeRayTexture();
    const rp: number[] = [], ru: number[] = [], ri: number[] = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.PlaneGeometry(3 + i, 26);
      g.rotateZ(-0.35 + i * 0.22);
      g.translate(-4 + i * 2.6, 6, -12 - i);
      const o = rp.length / 3;
      rp.push(...(g.attributes.position!.array as Float32Array));
      ru.push(...(g.attributes.uv!.array as Float32Array));
      ri.push(...Array.from(g.index!.array, (v) => v + o));
    }
    const rays = new THREE.BufferGeometry();
    rays.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    rays.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
    rays.setIndex(ri);
    this.rayMat = new THREE.MeshBasicMaterial({ map: rayTex, color: '#ffe2a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const rayMesh = new THREE.Mesh(rays, this.rayMat);
    rayMesh.name = 'ray';
    this.group.add(rayMesh);

    // luzes
    this.hemi = new THREE.HemisphereLight('#8fb89a', '#6a4a1c', 0.5);
    this.key = new THREE.DirectionalLight('#ffe6b8', 2.4); // luz das esferas (de baixo/frente): quente, mas sem apagar o verde-limão
    this.key.position.set(2.5, -2.5, 9);
    this.rim = new THREE.DirectionalLight('#ffe0b0', 3.0); // contraluz do halo dourado: silhueta
    this.rim.position.set(-4, 7, -10);
    this.top = new THREE.DirectionalLight('#dfe8ff', 1.1); // lua/topo: projeta sombras
    this.top.position.set(1.5, 12, 5);
    // (relâmpago e brilho das esferas modulam estas luzes — menos luzes = menos uniforms por quadro)
    // sem sombras projetadas: no iPhone custavam quadros (travadas no Expo Go) e deixavam uma mancha
    // retangular no corpo; o AO assado no modelo já dá o sombreamento de contato
    this.group.add(this.hemi, this.key, this.rim, this.top);
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

    // nuvens: deriva lenta; as de baixo pegam a luz dourada das esferas; relâmpago clareia
    const arr = this.cloudPos.array as Float32Array;
    this.clouds.forEach((c, i) => {
      const x = c.base.x + Math.sin(t * c.sp + c.ph) * 1.4, y = c.base.y + Math.cos(t * c.sp * 0.7 + c.ph) * 0.3;
      for (let k = 0; k < 4; k++) arr.set([x, y, c.base.z], (i * 4 + k) * 3);
    });
    this.cloudPos.needsUpdate = true;
    const energy = 0.3 + 0.7 * Math.max(inp.glow * 0.6, inp.appear, inp.summon);
    const lit = new THREE.Color('#ffb35c');
    const white = new THREE.Color('#ffffff');
    (this.cloudMat.uniforms.uBack!.value as THREE.Color).copy(this.c2).multiplyScalar(1.6).lerp(lit, 0.12 * energy).lerp(white, inp.flash * 0.6);
    (this.cloudMat.uniforms.uFront!.value as THREE.Color).copy(this.c2).multiplyScalar(1.6).lerp(lit, 0.45 * energy).lerp(white, inp.flash * 0.6);
    this.rayMat.opacity = 0.035 * inp.appear + 0.03 * inp.summon + 0.12 * inp.wish;

    // luz-chave dourada (as esferas lá embaixo) + clarão branco-azulado do relâmpago na luz de topo
    this.key.intensity = 0.4 + 1.6 * inp.appear + 1.2 * inp.wish + 0.6 * inp.glow * (1 - inp.appear);
    this.rim.intensity = 0.8 + 2.4 * inp.appear + 2 * inp.flash;
    this.top.intensity = 0.4 + 1.1 * inp.appear + 6 * inp.flash;
    this.hemi.intensity = 0.35 + 0.65 * inp.appear + 0.8 * inp.flash;
    this.fog.density = 0.011 + 0.014 * (1 - inp.appear); // câmera a ~25: dragão nítido como no anime
  }
}
