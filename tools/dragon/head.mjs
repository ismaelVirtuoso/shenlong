// Escultura da cabeça do Shenlong em SDF (espaço da cabeça: +Z = focinho, +Y = cima; ~2,4 unidades de comprimento).
import { capsule, ellipsoid, fbm, gradient, roundCone, smax, smin, sphere } from './sdf.mjs';
import { hex, lerp3 } from './parts.mjs';

/** linha da boca (y em função de z) e canto da boca */
export const mouthY = (z) => -0.11 - 0.035 * z;
export const MOUTH_CORNER_Z = -0.02;

export const EYE = { x: 0.335, y: 0.245, z: 0.3, r: 0.082 };
export const JAW_PIVOT = [0, -0.12, -0.16];

export function headBody(x, y, z) {
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, 0, 0.17, -0.22, 0.44, 0.42, 0.62); // crânio
  // focinho longo, alto na base e achatado na ponta (perfil de dragão oriental)
  d = smin(d, roundCone(x / 1.06, (y - 0.04) / 0.82 + 0.04, z, 0, 0.05, 0.1, 0, 0.03, 1.42, 0.37, 0.19) * 0.82, 0.22);
  d = smin(d, ellipsoid(x, y, z, 0, 0.1, 1.42, 0.23, 0.13, 0.18), 0.1); // nariz largo e baixo
  d = smin(d, capsule(x, y, z, 0, 0.18, 0.45, 0, 0.21, 1.3, 0.075), 0.1); // dorso do focinho
  d = smin(d, ellipsoid(ax, y, z, 0.1, 0.19, 1.45, 0.075, 0.06, 0.09), 0.05); // asas das narinas
  // sobrancelhas pesadas que encobrem os olhos (olhar severo)
  d = smin(d, roundCone(ax, y, z, 0.07, 0.33, 0.58, 0.47, 0.42, -0.02, 0.06, 0.085), 0.05);
  d = smin(d, ellipsoid(ax, y, z, 0.33, 0.34, 0.35, 0.12, 0.045, 0.12), 0.035); // pálpebra superior
  d = smin(d, ellipsoid(ax, y, z, 0.35, -0.01, -0.06, 0.2, 0.24, 0.36), 0.12); // maçãs/bochechas
  d = smin(d, roundCone(ax, y, z, 0.31, -0.055, 0.02, 0.19, -0.075, 1.3, 0.075, 0.05), 0.06); // lábio superior
  d = smin(d, roundCone(x, y, z, 0, 0.08, -0.38, 0, -0.12, -1.3, 0.42, 0.34), 0.16); // pescoço (cabe dentro do corpo)
  d = smin(d, ellipsoid(ax, y, z, 0.16, 0.24, 0.9, 0.07, 0.05, 0.2), 0.05); // rugas do focinho
  // órbitas e narinas
  d = smax(d, -ellipsoid(ax, y, z, EYE.x + 0.01, EYE.y, EYE.z + 0.02, 0.1, 0.085, 0.11), 0.035);
  d = smax(d, -ellipsoid(ax, y, z, 0.1, 0.235, 1.5, 0.035, 0.045, 0.05), 0.02); // narinas viradas p/ cima
  return d + (fbm(x * 7, y * 7, z * 7) - 0.5) * 0.012;
}

export function headUpper(x, y, z) {
  const cut = Math.max(y - mouthY(z), MOUTH_CORNER_Z - z); // volume da boca (abaixo da linha, à frente do canto)
  return smax(headBody(x, y, z), -cut, 0.022);
}

export function jaw(x, y, z) {
  const ax = Math.abs(x);
  let d = roundCone(x / 1.1, (y + 0.2) / 0.62 - 0.2, z, 0, -0.2, -0.3, 0, -0.2, 1.3, 0.29, 0.15) * 0.62;
  d = smin(d, ellipsoid(x, y, z, 0, -0.27, 1.15, 0.16, 0.1, 0.16), 0.08); // queixo
  d = smin(d, roundCone(ax, y, z, 0.27, -0.155, 0.0, 0.165, -0.15, 1.22, 0.065, 0.045), 0.05); // lábio inferior
  d = smin(d, ellipsoid(x, y, z, 0, -0.3, 0.25, 0.2, 0.08, 0.4), 0.1); // papada/garganta
  d += (fbm(x * 7 + 3, y * 7, z * 7) - 0.5) * 0.01;
  d = smax(d, y - (mouthY(z) - 0.006), 0.018); // topo plano (língua/gengiva)
  // traseira arredondada que sobe para dentro das bochechas (articulação escondida)
  d = smin(d, ellipsoid(Math.abs(x), y, z, 0.24, -0.16, -0.22, 0.13, 0.13, 0.2), 0.12);
  d = smax(d, -0.5 - z, 0.14);
  d = smax(d, y - (mouthY(z) - 0.006), 0.018);
  return d;
}

// ── cores ──
const C = {
  // paleta da referência: verde-limão vivo, barriga pêssego, boca rosada
  top: hex('#2d8a29'), mid: hex('#4cb83a'), side: hex('#80d457'), belly: hex('#f0c28c'), bellyShade: hex('#c99a62'),
  lip: hex('#2a7424'), palate: hex('#5a0f1a'), tongue: hex('#c8445a'), socket: hex('#123a12'), nose: hex('#3a9a30'),
};
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function skinColor(p, n, bellyAmount) {
  const v = fbm(p[0] * 9, p[1] * 9, p[2] * 9);
  let c = lerp3(C.side, C.mid, ss(-0.3, 0.3, n[1]));
  c = lerp3(c, C.top, ss(0.35, 0.9, n[1]));
  c = lerp3(c, lerp3(C.bellyShade, C.belly, v), bellyAmount);
  const k = 0.85 + 0.3 * v;
  return c.map((x) => x * k);
}

export function headColor(p, n) {
  const [x, y, z] = p;
  if (y < mouthY(z) + 0.012 && z > MOUTH_CORNER_Z && n[1] < -0.75) return [...C.palate, 1];
  const ex = Math.abs(x) - EYE.x, ey = y - EYE.y, ez = z - EYE.z;
  const de = Math.hypot(ex, ey, ez);
  let c = skinColor(p, n, ss(-0.45, -0.8, n[1]) * ss(0.1, -0.4, y));
  if (de < 0.2) c = lerp3(C.socket, c, ss(0.12, 0.2, de));
  if (z > 1.25 && y > 0.05) c = lerp3(c, C.nose, 0.5);
  const lipD = Math.abs(y - mouthY(z));
  if (z > MOUTH_CORNER_Z && lipD < 0.05) c = lerp3(C.lip, c, ss(0.0, 0.05, lipD));
  return c;
}

export function jawColor(p, n) {
  const [, y, z] = p;
  if (n[1] > 0.7 && y > mouthY(z) - 0.03) return [...lerp3(C.tongue, C.palate, ss(0.6, -0.1, z)), 1];
  let c = skinColor(p, n, ss(0.0, -0.6, n[1]));
  const lipD = Math.abs(y - mouthY(z));
  if (lipD < 0.05) c = lerp3(C.lip, c, ss(0.0, 0.05, lipD));
  return c;
}

/** Encontra a borda lateral (x>0) de um SDF na altura y, profundidade z. */
export function edgeX(f, y, z) {
  let a = 0, b = 0.9;
  if (f(a, y, z) > 0) return null;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (f(m, y, z) < 0) a = m;
    else b = m;
  }
  return a;
}

/** Projeta um ponto aproximado para dentro da superfície (base de espinhos/chifres). */
export function anchor(f, p, inset = 0.03) {
  let [x, y, z] = p;
  for (let i = 0; i < 6; i++) {
    const d = f(x, y, z);
    const g = gradient(f, x, y, z, 0.005);
    x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
  }
  const g = gradient(f, x, y, z, 0.005);
  return [x - g[0] * inset, y - g[1] * inset, z - g[2] * inset];
}
