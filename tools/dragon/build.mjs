// Gera mobile/assets/models/shenlong.glb — o "asset 3D" do Shenlong.
//   node tools/dragon/build.mjs          (ou: make dragon-build)
// O GLB é padrão (abre no Blender) e pode ser substituído por um modelo de artista
// com os mesmos nomes de malhas/nós (ver docs/REFORMULACAO-3D.md).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { bakeAO, surfaceNets } from './mesh.mjs';
import { writeGlb } from './glb.mjs';
import { MeshBuilder, hex, lerp3, sdfMesh } from './parts.mjs';
import { EYE, JAW_PIVOT, anchor, edgeX, headBody, headColor, headUpper, jaw, jawColor, mouthY } from './head.mjs';
import { capsule, ellipsoid, fbm, roundCone, smin } from './sdf.mjs';

const OUT = resolve(import.meta.dirname, '../../mobile/assets/models/shenlong.glb');
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

const HEAD_BOX = [-0.8, -0.65, -1.8, 0.8, 0.85, 1.75];
// (z até 1,65: a ponta do lábio inferior passava de 1,4 e a malha saía aberta na frente)
const JAW_BOX = [-0.45, -0.52, -0.7, 0.45, 0.02, 1.65];

function sculpt(name, f, box, h, colorFn) {
  const m = surfaceNets(f, box, h);
  const ao = bakeAO(f, m.positions, m.normals);
  log(`${name}: ${m.positions.length / 3} vértices, ${m.indices.length / 3} triângulos`);
  return sdfMesh(name, m, colorFn, ao);
}

const meshes = [];
meshes.push(sculpt('head_hi', headUpper, HEAD_BOX, 0.0165, headColor));
meshes.push(sculpt('head_lo', headUpper, HEAD_BOX, 0.03, headColor));
meshes.push(sculpt('jaw_hi', jaw, JAW_BOX, 0.015, jawColor));
meshes.push(sculpt('jaw_lo', jaw, JAW_BOX, 0.024, jawColor));

// ── dentes: lâminas recurvadas (seção achatada no sentido da mandíbula), raiz na gengiva ──
const GUM_ROOT = hex('#b3485a'), BASE_Y = hex('#ddd0ad'), IVORY = hex('#f6f1e2'), TIP = hex('#ffffff'); // marfim claro (a luz-chave é dourada)
const toothColor = (t) =>
  t < 0.1 ? lerp3(GUM_ROOT, BASE_Y, t / 0.1) : t < 0.5 ? lerp3(BASE_Y, IVORY, (t - 0.1) / 0.4) : lerp3(IVORY, TIP, (t - 0.5) / 0.5);
function teeth(name, f, yAt, dirY, list) {
  const b = new MeshBuilder(name);
  for (const [z, len, r] of list) {
    const ex = edgeX(f, yAt(z), z);
    if (ex == null) continue;
    const fang = len > 0.15;
    for (const s of [1, -1]) {
      const bx = s * (ex - 0.035 - r * 0.3), by = yAt(z) - dirY * 0.03; // raiz 3 cm dentro da gengiva
      const back = len * (fang ? 0.38 : 0.24); // recurvados para trás (presas mais em gancho)
      const out = fang ? s * 0.05 : s * 0.012; // presas atravessam o lábio; demais levemente para fora
      const L = len + 0.04;
      b.tube([[bx, by, z], [bx + out * 0.2, by + dirY * L * 0.35, z + len * 0.04], [bx * 0.99 + out * 0.6, by + dirY * L * 0.75, z - back * 0.45], [bx * 0.96 + out, by + dirY * L, z - back]], {
        rings: fang ? 16 : 10, sides: 12, flat: fang ? 0.75 : 0.9, color: toothColor,
        radius: (t) => r * (1 - t) ** 0.7 * (1 + 0.35 * Math.max(0, 1 - t / 0.16)),
      });
    }
  }
  return b.build();
}
// [z, comprimento, raio]: molares → pré-molares → PRESA imponente → incisivos
meshes.push(teeth('teeth_upper', headBody, (z) => mouthY(z) + 0.004, -1, [
  [0.02, 0.07, 0.042], [0.12, 0.08, 0.042], [0.22, 0.095, 0.04], [0.34, 0.11, 0.04], [0.46, 0.125, 0.04],
  [0.58, 0.14, 0.042], [0.7, 0.16, 0.044], [0.82, 0.18, 0.046], [0.96, 0.4, 0.075], [1.1, 0.15, 0.038],
  [1.2, 0.12, 0.032], [1.3, 0.1, 0.028],
]));
meshes.push(teeth('teeth_lower', (x, y, z) => jaw(x, y, z, false), (z) => mouthY(z) - 0.014, 1, [
  [0.08, 0.065, 0.04], [0.18, 0.075, 0.038], [0.3, 0.09, 0.038], [0.42, 0.105, 0.038], [0.54, 0.12, 0.038],
  [0.66, 0.13, 0.04], [0.82, 0.32, 0.066], [0.96, 0.13, 0.036], [1.08, 0.1, 0.03], [1.2, 0.085, 0.026],
]));
log('dentes');

// ── chifres: galhos de madeira em segmentos retos, com nós e pontas cortadas (como no anime) ──
{
  const b = new MeshBuilder('horns');
  const dark = hex('#5a3613'), light = hex('#a8733a'), lit = hex('#c99555');
  // claro de um lado (k ≈ 0), escuro do outro: o traço "madeira" do desenho
  const col = (t, k = 0) => {
    const side = 0.5 + 0.5 * Math.cos(k * Math.PI * 2);
    return lerp3(lerp3(dark, light, 0.35 + 0.4 * t), lit, side * side * 0.6);
  };
  const lerpP = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  const seg = (a, c, r0, r1, cap) => b.tube([a, lerpP(a, c, 1 / 3), lerpP(a, c, 2 / 3), c], {
    rings: 8, sides: 12, cap, color: col,
    // nó saliente no começo de cada segmento
    radius: (t) => (r0 + (r1 - r0) * t) * (1 + 0.14 * Math.max(0, 1 - t / 0.12)),
  });
  for (const s of [1, -1]) {
    const base = anchor(headUpper, [s * 0.24, 0.6, -0.22], 0.05);
    const j1 = [s * 0.31, 0.98, -0.42], j2 = [s * 0.37, 1.3, -0.82], end = [s * 0.4, 1.48, -1.32];
    seg(base, j1, 0.11, 0.097, false);
    seg(j1, j2, 0.097, 0.085, false);
    seg(j2, end, 0.085, 0.074, true);
    // galhos curtos e grossos, cortados retos
    seg(j1, [j1[0] + s * 0.24, j1[1] + 0.2, j1[2] + 0.1], 0.064, 0.056, true);
    seg(j2, [j2[0] + s * 0.26, j2[1] + 0.1, j2[2] - 0.06], 0.056, 0.05, true);
    const m3 = lerpP(j2, end, 0.55);
    seg(m3, [m3[0] + s * 0.06, m3[1] + 0.22, m3[2] + 0.04], 0.048, 0.043, true);
  }
  meshes.push(b.build());
  log('chifres');
}

// ── juba do anime: mechas largas em "chama" (base verde, ponta limão-clara), em leque nas bochechas,
//    um tufo subindo das sobrancelhas e mechas na mandíbula/nuca; peso de balanço p/ animar no shader ──
{
  const b = new MeshBuilder('mane');
  const root = hex('#2a8420'), mid = hex('#79cf37'), tip = hex('#bdee72');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  // [âncora (lado direito), direção principal, nº de mechas, comprimento mín–máx, abertura, largura]
  const tufts = [
    [[0.5, 0.02, -0.22], [1, -0.05, -0.45], 11, [0.8, 1.25], 0.6, 0.19], // bochechas: leque para os lados
    [[0.44, -0.2, -0.3], [0.85, -0.55, -0.8], 7, [0.65, 1.0], 0.5, 0.15], // canto da mandíbula
    [[0.38, 0.48, -0.12], [0.3, 0.85, -0.85], 8, [0.85, 1.2], 0.45, 0.16], // sobrancelhas: tufo que sobe
    [[0.32, 0.3, -0.8], [0.65, 0.35, -1], 7, [0.75, 1.1], 0.5, 0.15], // nuca
  ];
  const blade = (base, dir, len, w0, sgn) => {
    const d = norm(dir);
    const out = norm([sgn, 0.3, 0]); // a ponta se curva para fora, como uma chama
    const wav = (rnd() - 0.5) * 0.3;
    const at = (k, curl) => [
      base[0] + d[0] * len * k + out[0] * curl, base[1] + d[1] * len * k + out[1] * curl, base[2] + d[2] * len * k + out[2] * curl,
    ];
    b.tube([base, at(0.33, wav * len * 0.3), at(0.66, (0.12 - wav * 0.3) * len), at(1, (0.22 + wav * 0.4) * len)], {
      rings: 12, sides: 8, flat: 0.55,
      color: (t) => (t < 0.45 ? lerp3(root, mid, t / 0.45) : lerp3(mid, tip, (t - 0.45) / 0.55)).map((x) => x * (0.94 + 0.12 * rnd())),
      // larga e cheia no meio, afinando em ponta
      radius: (t) => w0 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)) ** 0.8 * (1 - t) ** 0.35 + 0.002,
    });
  };
  for (const [p, dir, count, [l0, l1], spread, w] of tufts) {
    for (const sgn of [1, -1]) {
      const base0 = anchor(headUpper, [sgn * p[0], p[1], p[2]], 0.04);
      for (let i = 0; i < count; i++) {
        const j = () => (rnd() - 0.5) * spread;
        // leque organizado (como no desenho) + um pouco de aleatoriedade
        const fan = (i / Math.max(1, count - 1) - 0.5) * spread * 1.6;
        const dd = [sgn * dir[0] + j() * 0.4, dir[1] + fan + j() * 0.3, dir[2] + j() * 0.4];
        const off = [j() * 0.12, j() * 0.12, j() * 0.12];
        blade([base0[0] + off[0], base0[1] + off[1], base0[2] + off[2]], dd, l0 + (l1 - l0) * rnd(), w * (0.8 + 0.4 * rnd()), sgn);
      }
    }
  }
  // crista central: mechas curtas para trás, entre os chifres
  for (let i = 0; i < 7; i++) {
    const z = -0.45 - i * 0.12;
    const base = anchor(headUpper, [(rnd() - 0.5) * 0.1, 0.7, z], 0.03);
    blade(base, [(rnd() - 0.5) * 0.4, 0.8, -1.1], 0.55 + 0.3 * rnd(), 0.07, rnd() < 0.5 ? 1 : -1);
  }
  meshes.push(b.build());
  log('juba');
}

// ── braço do anime (instanciado 4× no corpo) ──
// eixo local: o braço sai do ombro (origem) para −Y até o cotovelo; o antebraço segue +Z; a palma
// olha para +X (os dedos e as garras se curvam para lá). Proporções medidas no desenho de referência.
{
  const SH = [0, 0.02, 0], EL = [0, -0.55, -0.02], WR = [0, -0.57, 0.46];
  // dedos curtos e grossos, dobrados para a palma (garra de dragão, não mão humana)
  const FINGERS = [-0.11, 0, 0.11].map((dy) => {
    const b0 = [0.0, WR[1] + dy, 0.62], k = [0.07, WR[1] + dy * 1.3, 0.74], t = [0.17, WR[1] + dy * 1.4, 0.73];
    return { b0, k, t };
  });
  const THUMB = { b0: [0.02, WR[1] - 0.12, 0.52], t: [0.12, WR[1] - 0.22, 0.6] };
  const rc = (x, y, z, a, b, ra, rb) => roundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb);
  const leg = (x, y, z) => {
    let d = rc(x, y, z, SH, EL, 0.17, 0.12); // braço
    d = smin(d, ellipsoid(x, y, z, 0.01, -0.24, 0.04, 0.155, 0.2, 0.16), 0.08); // bíceps
    d = smin(d, rc(x, y, z, EL, [0, -0.67, -0.17], 0.1, 0.025), 0.05); // cotovelo pontudo
    d = smin(d, rc(x, y, z, EL, WR, 0.125, 0.088), 0.06); // antebraço
    d = smin(d, ellipsoid(x, y, z, 0.0, -0.08 + EL[1], 0.17, 0.12, 0.1, 0.17), 0.06); // músculo do antebraço
    d = smin(d, ellipsoid(x, y, z, 0.01, WR[1], 0.58, 0.075, 0.15, 0.12), 0.05); // palma
    for (const f of FINGERS) {
      d = smin(d, rc(x, y, z, f.b0, f.k, 0.062, 0.054), 0.03);
      d = smin(d, rc(x, y, z, f.k, f.t, 0.054, 0.045), 0.02);
    }
    d = smin(d, rc(x, y, z, THUMB.b0, THUMB.t, 0.058, 0.044), 0.03);
    return d + (fbm(x * 9, y * 9, z * 9) - 0.5) * 0.008;
  };
  const legColor = (p, n) => {
    const v = fbm(p[0] * 12, p[1] * 12, p[2] * 12);
    // verde do anime: dorso escuro, faces de cima limão; palma e dedos por dentro mais claros
    const lit = Math.max(0, 0.6 * n[1] + 0.5 * n[2] + 0.3);
    let c = lerp3(hex('#2f8d27'), hex('#8edb55'), Math.min(1, lit));
    if (p[2] > 0.5) c = lerp3(c, hex('#b8ec84'), Math.max(0, n[0]) * 0.6);
    return c.map((x) => x * (0.88 + 0.24 * v));
  };
  const m = sculpt('leg_sdf', leg, [-0.25, -0.95, -0.3, 0.32, 0.25, 1.0], 0.019, legColor);
  const claws = new MeshBuilder('claws');
  const cc = (t) => lerp3(hex('#f6f4ec'), hex('#c9c3b0'), t ** 1.5); // garras brancas
  // garras grandes em gancho, curvadas para a palma
  const claw = (p, dy) => claws.tube([[p[0] - 0.01, p[1], p[2] + 0.01], [p[0] + 0.06, p[1] + dy * 0.3, p[2] - 0.01], [p[0] + 0.1, p[1] + dy * 0.5, p[2] - 0.09], [p[0] + 0.08, p[1] + dy * 0.6, p[2] - 0.18]], {
    rings: 12, sides: 10, color: cc, radius: (t) => 0.046 * (1 - t) ** 0.75 + 0.002,
  });
  for (const f of FINGERS) claw(f.t, Math.sign(f.t[1] - WR[1]) * 0.05);
  claw(THUMB.t, -0.06);
  const c = claws.build();
  // mescla pata + garras numa malha só (mask=0: usa o material da cabeça sem mucosa)
  const off = m.positions.length / 3;
  const nLeg = m.positions.length / 3 + c.positions.length / 3;
  meshes.push({
    name: 'leg',
    positions: Float32Array.from([...m.positions, ...c.positions]),
    normals: Float32Array.from([...m.normals, ...c.normals]),
    colors: Uint8Array.from([...m.colors, ...c.colors]),
    mask: new Float32Array(nLeg), // zeros — evita atributo ausente no shader da cabeça
    indices: Uint32Array.from([...m.indices, ...Array.from(c.indices, (i) => i + off)]),
  });
  log('pata');
}

const nodes = {
  eye_R: [EYE.x, EYE.y, EYE.z],
  eye_L: [-EYE.x, EYE.y, EYE.z],
  whisker_R: [0.24, 0.0, 1.22],
  whisker_L: [-0.24, 0.0, 1.22],
  jaw_pivot: JAW_PIVOT,
  neck: [0, -0.12, -1.3],
};
mkdirSync(resolve(OUT, '..'), { recursive: true });
const bytes = writeGlb(OUT, { meshes, nodes });
log(`GLB: ${OUT} (${(bytes / 1048576).toFixed(2)} MB)`);
