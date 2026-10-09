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
const JAW_BOX = [-0.45, -0.5, -0.7, 0.45, 0.02, 1.4];

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

// ── dentes ──
const IVORY = hex('#f1ead2'), GUM = hex('#c9b98e');
const toothColor = (t) => lerp3(GUM, IVORY, Math.min(1, t * 3));
function teeth(name, f, yAt, dirY, list) {
  const b = new MeshBuilder(name);
  for (const [z, len, r] of list) {
    const ex = edgeX(f, yAt(z), z);
    if (ex == null) continue;
    for (const s of [1, -1]) {
      const bx = s * (ex - 0.03), by = yAt(z) - dirY * 0.02;
      const tip = [bx * 0.98, by + dirY * len, z - len * 0.25];
      b.tube([[bx, by, z], [bx, by + dirY * len * 0.4, z], [bx, by + dirY * len * 0.75, z - len * 0.1], tip], {
        rings: 6, sides: 8, radius: (t) => r * (1 - t) ** 0.7, color: toothColor,
      });
    }
  }
  return b.build();
}
// [z, comprimento, raio]
meshes.push(teeth('teeth_upper', headBody, (z) => mouthY(z) + 0.004, -1, [
  [0.08, 0.06, 0.022], [0.24, 0.07, 0.024], [0.4, 0.075, 0.025], [0.56, 0.08, 0.026], [0.72, 0.085, 0.026],
  [0.88, 0.09, 0.026], [1.02, 0.22, 0.04], [1.18, 0.09, 0.024], [1.3, 0.07, 0.02],
]));
meshes.push(teeth('teeth_lower', jaw, (z) => mouthY(z) - 0.014, 1, [
  [0.12, 0.05, 0.02], [0.28, 0.06, 0.022], [0.44, 0.065, 0.023], [0.6, 0.07, 0.024], [0.76, 0.07, 0.024], [0.9, 0.16, 0.034], [1.1, 0.06, 0.02],
]));
log('dentes');

// ── chifres em galhada (marfim, com anéis na base) ──
{
  const b = new MeshBuilder('horns');
  const dark = hex('#5a4529'), light = hex('#c9b27c');
  const col = (t) => lerp3(dark, light, Math.min(1, t * 1.6));
  for (const s of [1, -1]) {
    const base = anchor(headUpper, [s * 0.24, 0.6, -0.22], 0.05);
    const main = [base, [s * 0.34, 0.95, -0.34], [s * 0.42, 1.25, -0.76], [s * 0.47, 1.32, -1.28]];
    b.tube(main, {
      rings: 40, sides: 14, color: col,
      radius: (t) => (0.11 - 0.085 * t) * (1 + (t < 0.28 ? 0.09 * Math.max(0, Math.sin(t * 70)) : 0)),
    });
    const bez = (t) => { const u = 1 - t; return [0, 1, 2].map((i) => u * u * u * main[0][i] + 3 * u * u * t * main[1][i] + 3 * u * t * t * main[2][i] + t * t * t * main[3][i]); };
    const pa = bez(0.36), pb = bez(0.68);
    b.tube([pa, [pa[0] + s * 0.08, pa[1] + 0.18, pa[2] + 0.06], [s * 0.6, 1.2, -0.1], [s * 0.66, 1.26, -0.02]], {
      rings: 20, sides: 10, color: (t) => col(0.4 + t * 0.6), radius: (t) => 0.048 * (1 - t) + 0.008,
    });
    b.tube([pb, [pb[0] + s * 0.08, pb[1] + 0.15, pb[2] + 0.02], [s * 0.62, 1.55, -0.66], [s * 0.66, 1.62, -0.6]], {
      rings: 18, sides: 10, color: (t) => col(0.6 + t * 0.4), radius: (t) => 0.036 * (1 - t) + 0.006,
    });
  }
  meshes.push(b.build());
  log('chifres');
}

// ── juba: espinhos verde-escuros (com peso de balanço p/ animar no shader) ──
{
  const b = new MeshBuilder('mane');
  const baseC = hex('#163f1a'), tipC = hex('#5f9a3a');
  const col = (t, k) => { const c = lerp3(baseC, tipC, t * t); const s = 0.8 + 0.3 * Math.abs(Math.sin(k * Math.PI)); return c.map((x) => x * s); };
  // [ponto aproximado, direção, comprimento, raio, queda]
  const side = [
    [[0.47, 0.46, -0.03], [0.55, 0.35, -1], 0.72, 0.07, 0.05], // sobrancelhas espinhosas
    [[0.42, 0.52, -0.13], [0.42, 0.6, -1], 0.82, 0.072, 0.04],
    [[0.35, 0.56, -0.22], [0.28, 0.72, -1], 0.76, 0.068, 0.02],
    [[0.57, 0.04, -0.2], [1, -0.05, -1], 0.78, 0.085, 0.12], // franja das bochechas
    [[0.54, -0.12, -0.3], [0.9, -0.5, -1], 0.72, 0.08, 0.1],
    [[0.5, 0.18, -0.36], [0.85, 0.3, -1], 0.84, 0.085, 0.08],
    [[0.44, -0.24, -0.48], [0.6, -0.8, -1], 0.6, 0.075, 0.06],
    [[0.4, 0.36, -0.56], [0.6, 0.45, -1], 0.82, 0.085, 0.08], // lateral do crânio
    [[0.4, 0.12, -0.78], [0.75, 0.05, -1], 0.88, 0.09, 0.12],
    [[0.33, 0.4, -0.92], [0.5, 0.55, -1], 0.8, 0.085, 0.08],
    [[0.38, -0.12, -1.0], [0.7, -0.35, -1], 0.75, 0.085, 0.1],
  ];
  const mid = [
    [[0, 0.64, -0.42], [0, 1, -0.85], 0.55, 0.07, 0.0],
    [[0, 0.58, -0.72], [0, 1, -1], 0.62, 0.075, 0.02],
    [[0, 0.5, -1.02], [0, 1, -1.1], 0.62, 0.075, 0.03],
    [[0, 0.44, -1.3], [0, 1, -1.2], 0.55, 0.07, 0.03],
  ];
  const spike = ([p, dir, len, r, droop]) => {
    const base = anchor(headUpper, p, 0.04);
    const l = Math.hypot(...dir);
    const d = dir.map((v) => v / l);
    const at = (k, dy) => [base[0] + d[0] * len * k, base[1] + d[1] * len * k - dy, base[2] + d[2] * len * k];
    b.tube([base, at(0.35, 0), at(0.7, droop * 0.5), at(1, droop)], {
      rings: 12, sides: 8, flat: 0.55, color: col, radius: (t) => r * (1 - t) ** 0.9 + 0.003,
    });
  };
  for (const s of side) {
    spike(s);
    spike([[-s[0][0], s[0][1], s[0][2]], [-s[1][0], s[1][1], s[1][2]], s[2], s[3], s[4]]);
  }
  mid.forEach(spike);
  meshes.push(b.build());
  log('juba');
}

// ── pata com garras (instanciada 4× no corpo) ──
{
  const leg = (x, y, z) => {
    let d = roundCone(x, y, z, 0, 0, 0, 0, -0.42, 0.12, 0.15, 0.11);
    d = smin(d, roundCone(x, y, z, 0, -0.42, 0.12, 0, -0.8, 0.02, 0.1, 0.075), 0.06);
    d = smin(d, ellipsoid(x, y, z, 0, -0.86, 0.1, 0.13, 0.065, 0.14), 0.05);
    for (const fx of [-0.085, -0.03, 0.03, 0.085]) d = smin(d, roundCone(x, y, z, fx, -0.86, 0.12, fx * 1.6, -0.9, 0.3, 0.038, 0.028), 0.025);
    d = smin(d, capsule(x, y, z, 0, -0.84, 0.0, 0, -0.88, -0.12, 0.03), 0.03); // esporão
    return d + (fbm(x * 9, y * 9, z * 9) - 0.5) * 0.008;
  };
  const legColor = (p, n) => {
    const v = fbm(p[0] * 12, p[1] * 12, p[2] * 12);
    const c = lerp3(lerp3(hex('#4c983a'), hex('#1e5223'), Math.max(0, n[2] * -0.5 + 0.5)), hex('#cdbb7a'), Math.max(0, n[2]) * 0.6);
    return c.map((x) => x * (0.85 + 0.3 * v));
  };
  const m = sculpt('leg_sdf', leg, [-0.3, -1.05, -0.3, 0.3, 0.2, 0.45], 0.021, legColor);
  const claws = new MeshBuilder('claws');
  const cc = (t) => lerp3(hex('#e9dcb0'), hex('#4a3b26'), t ** 1.5);
  for (const fx of [-0.085, -0.03, 0.03, 0.085]) {
    const bx = fx * 1.6;
    claws.tube([[bx, -0.9, 0.29], [bx, -0.9, 0.38], [bx, -0.95, 0.45], [bx, -1.02, 0.47]], { rings: 10, sides: 8, color: cc, radius: (t) => 0.03 * (1 - t) + 0.002 });
  }
  claws.tube([[0, -0.88, -0.1], [0, -0.9, -0.18], [0, -0.95, -0.22], [0, -1.0, -0.22]], { rings: 8, sides: 8, color: cc, radius: (t) => 0.025 * (1 - t) + 0.002 });
  const c = claws.build();
  // mescla pata + garras numa malha só
  const off = m.positions.length / 3;
  meshes.push({
    name: 'leg',
    positions: Float32Array.from([...m.positions, ...c.positions]),
    normals: Float32Array.from([...m.normals, ...c.normals]),
    colors: Uint8Array.from([...m.colors, ...c.colors]),
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
