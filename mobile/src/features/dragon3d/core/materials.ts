import * as THREE from 'three';
import { makeBellyTextures, makeScaleTextures } from './textures';
import { SPINE_GLSL, type SpineUniforms } from './tube';

/** Uniforms globais compartilhados por todos os materiais do dragão (tempo, contraluz, energia). */
export const shared = {
  uTime: { value: 0 },
  uRim: { value: 0.6 },
  uRimColor: { value: new THREE.Color('#ffd27a') },
  uSwayAmp: { value: 0.05 },
};

const COMMON_FRAG = /* glsl */ `
uniform float uRim;
uniform vec3 uRimColor;
`;

/** Contraluz/fresnel quente (dá a silhueta "de cinema" e simula o brilho das esferas) + AO do vertex alpha. */
const RIM_AND_AO = /* glsl */ `
#include <aomap_fragment>
#ifdef USE_COLOR_ALPHA
  reflectedLight.indirectDiffuse *= vColor.a;
  reflectedLight.indirectSpecular *= vColor.a;
#endif
{
  vec3 vdir = normalize(vViewPosition);
  float fr = pow(1.0 - clamp(abs(dot(normal, vdir)), 0.0, 1.0), 3.0);
  #ifdef USE_COLOR_ALPHA
    fr *= vColor.a * vColor.a; // cavidades (boca, dobras) não recebem contraluz
  #endif
  totalEmissiveRadiance += uRimColor * fr * uRim;
}
`;

function base(params: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, ...params });
}

/** Uniforms da espinha do corpo: preenchidos pelo GpuTube (a textura real é trocada lá). */
export const bodySpine: SpineUniforms = {
  uSpine: { value: new THREE.DataTexture(new Float32Array(4 * 4), 1, 4, THREE.RGBAFormat, THREE.FloatType) },
  uFlat: { value: 0.55 },
  uUScale: { value: 1.15 },
  uVRepeat: { value: 3 },
};

export interface DragonMaterials {
  body: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  mane: THREE.MeshStandardMaterial;
  horn: THREE.MeshStandardMaterial;
  teeth: THREE.MeshStandardMaterial;
  whisker: THREE.MeshStandardMaterial;
  spike: THREE.MeshStandardMaterial;
  eye: THREE.ShaderMaterial;
}

export function createMaterials(): DragonMaterials {
  const scales = makeScaleTextures(256, 8);
  const belly = makeBellyTextures(128, 4);

  // ── corpo: deformado na GPU (ver GpuTube); escamas por UV (u = ao longo do corpo) + placas ventrais ──
  const body = base({ roughness: 0.5, normalMap: scales.normal, normalScale: new THREE.Vector2(1.1, 1.1) });
  body.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared, bodySpine, { uBellyN: { value: belly.normal }, uDet: { value: scales.detail }, uBellyDet: { value: belly.detail } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${SPINE_GLSL}\nattribute float belly;\nvarying float vBelly;\nvarying vec2 vBodyUv;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal;\nspineVertex(objectNormal);')
      .replace('#include <begin_vertex>', `vec3 transformed = gTubePos;
        vBelly = belly;
        vBodyUv = gTubeUv;
        #ifdef USE_NORMALMAP
          vNormalMapUv = gTubeUv;
        #endif`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_FRAG}\nuniform sampler2D uBellyN;\nuniform sampler2D uDet;\nuniform sampler2D uBellyDet;\nvarying float vBelly;\nvarying vec2 vBodyUv;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.a = 1.0;
        vec4 det = mix(texture2D(uDet, vBodyUv), texture2D(uBellyDet, vBodyUv * vec2(1.0, 0.25)), vBelly);
        diffuseColor.rgb *= det.r * 1.12 * mix(vec3(0.9 + 0.2 * det.b, 1.0, 0.86 + 0.2 * det.b), vec3(1.0), vBelly);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(det.g * 1.05, 0.22, 0.92);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nS = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(uBellyN, vBodyUv * vec2(1.0, 0.25)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(mix(nS, nB, vBelly));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`)
      .replace('#include <aomap_fragment>', RIM_AND_AO);
  };

  // ── cabeça/patas: escamas triplanares (malha esculpida não tem UV) ──
  const head = base({ roughness: 0.5 });
  head.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared, { uScaleN: { value: scales.normal }, uDet: { value: scales.detail }, uTri: { value: 5.5 } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mask;\nvarying float vMask;\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjN = normal;\nvMask = mask;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_FRAG}\nuniform mat3 normalMatrix;\nuniform sampler2D uScaleN;\nuniform sampler2D uDet;\nuniform float uTri;\nvarying float vMask;\nvarying vec3 vObjPos;\nvarying vec3 vObjN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.a = 1.0;
        vec3 n0 = normalize(vObjN);
        vec3 bl = pow(abs(n0), vec3(4.0)); bl /= (bl.x + bl.y + bl.z);
        vec3 P = vObjPos * uTri;
        // máscara do GLB + heurística pela cor (vermelho >> verde = mucosa),
        // caso o atributo falhe em malhas que compartilham o material (patas)
        float mucCol = smoothstep(0.52, 0.72, diffuseColor.r / max(diffuseColor.r + diffuseColor.g, 1e-4));
        float muc = max(vMask, mucCol);
        vec4 det = texture2D(uDet, P.zy) * bl.x + texture2D(uDet, P.xz) * bl.y + texture2D(uDet, P.xy) * bl.z;
        det = mix(det, vec4(1.08, 0.2, 0.4, 0.5), muc); // boca: úmida, sem escamas
        diffuseColor.rgb *= mix(det.r * 1.12 * vec3(0.92 + 0.16 * det.b, 1.0, 0.9 + 0.16 * det.b), vec3(1.12), muc);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(clamp(det.g * 1.05, 0.18, 0.92), 0.22, muc);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 tx = texture2D(uScaleN, P.zy).xyz * 2.0 - 1.0;
        vec3 ty = texture2D(uScaleN, P.xz).xyz * 2.0 - 1.0;
        vec3 tz = texture2D(uScaleN, P.xy).xyz * 2.0 - 1.0;
        float ns = 0.75 * (1.0 - muc);
        tx.xy *= ns; ty.xy *= ns; tz.xy *= ns;
        // mucosa lisa: o z da textura também entra na mistura (whiteout) e, com a boca úmida
        // (rugosidade baixa), desenhava escamas no reflexo
        tx.z = mix(tx.z, 1.0, muc); ty.z = mix(ty.z, 1.0, muc); tz.z = mix(tz.z, 1.0, muc);
        tx = vec3(tx.xy + n0.zy, abs(tx.z) * n0.x);
        ty = vec3(ty.xy + n0.xz, abs(ty.z) * n0.y);
        tz = vec3(tz.xy + n0.xy, abs(tz.z) * n0.z);
        vec3 objN = normalize(tx.zyx * bl.x + ty.xzy * bl.y + tz.xyz * bl.z);
        normal = normalize(normalMatrix * objN) * faceDirection;`)
      .replace('#include <aomap_fragment>', RIM_AND_AO);
  };

  // ── juba: balança com o tempo (atributo sway = 0 na base, 1 na ponta) ──
  const mane = base({ roughness: 0.6 });
  mane.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;\nuniform float uSwayAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float w = sway * sway;
        transformed.x += w * uSwayAmp * sin(uTime * 2.1 + position.z * 4.0 + position.y * 3.0);
        transformed.y += w * uSwayAmp * 0.8 * sin(uTime * 1.7 + position.x * 5.0 + position.z * 2.0);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_FRAG}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a = 1.0;')
      .replace('#include <aomap_fragment>', RIM_AND_AO);
  };

  const simple = (roughness: number, rim = true) => {
    const m = base({ roughness });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, shared);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON_FRAG}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a = 1.0;')
        .replace('#include <aomap_fragment>', rim ? RIM_AND_AO : '#include <aomap_fragment>');
    };
    return m;
  };

  const whisker = new THREE.MeshStandardMaterial({ color: '#8fd34e', roughness: 0.45, metalness: 0.05 });
  const spike = new THREE.MeshStandardMaterial({ color: '#1f4d22', roughness: 0.6, metalness: 0 });

  return {
    body, head, mane,
    horn: simple(0.55),
    teeth: simple(0.3, false),
    whisker, spike,
    eye: createEyeMaterial(),
  };
}

/** Olho: íris vermelha luminosa, pupila em fenda, córnea com brilho especular. +Z local = frente. */
function createEyeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: 0.6 }, uPupil: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vN; varying vec3 vView;
      void main() {
        vLocal = position;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; uniform float uPupil;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vView;
      void main() {
        // olho vermelho luminoso (como no anime): centro quente, borda vermelho-escura
        vec3 d = normalize(vLocal);
        float r = length(d.xy);
        vec3 col = mix(vec3(1.0, 0.18, 0.1), vec3(0.85, 0.02, 0.02), smoothstep(0.0, 0.6, r));
        col = mix(col, vec3(0.35, 0.0, 0.0), smoothstep(0.75, 1.0, r));
        // pupila: traço escuro fino e discreto
        float slit = abs(d.x) - 0.045 * uPupil;
        col = mix(col * 0.35, col, smoothstep(-0.01, 0.02, slit) + step(0.6, abs(d.y)));
        vec3 N = normalize(vN), V = normalize(vView);
        vec3 L = normalize(vec3(-0.4, 0.7, 0.6));
        float spec = pow(max(dot(reflect(-L, N), V), 0.0), 60.0);
        vec3 outc = col * (0.55 + 0.9 * uGlow) + vec3(1.0, 0.9, 0.8) * spec * 1.2;
        gl_FragColor = vec4(outc, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
