// Escultura da cabeça do Shenlong em SDF (espaço da cabeça: +Z = focinho, +Y = cima; ~2,4 unidades de comprimento).
import { capsule, ellipsoid, fbm, gradient, roundCone, smax, smin, sphere } from './sdf.mjs';
import { hex, lerp3 } from './parts.mjs';

/** linha da boca (y em função de z) e canto da boca */
export const mouthY = (z) => -0.11 - 0.035 * z;
export const MOUTH_CORNER_Z = -0.02;

export const EYE = { x: 0.335, y: 0.245, z: 0.3, r: 0.082 };
export const JAW_PIVOT = [0, -0.12, -0.16];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** meia-largura interna da boca (até a gengiva) ao longo do focinho */
export const mouthHalfW = (z) => 0.25 - 0.1 * clamp01(z / 1.3);
/** abóbada do palato: sobe no meio, encontra a gengiva nas bordas */
export function palateLift(x, z) {
  if (z < MOUTH_CORNER_Z) return 0;
  const u = clamp01(1 - (Math.abs(x) / mouthHalfW(z)) ** 2);
  return 0.09 * u * clamp01((z - MOUTH_CORNER_Z) / 0.2); // (rugas só na cor: em relevo viravam degraus)
}
/** assoalho da boca: rebaixado entre as gengivas (onde a língua fica) */
export function floorDrop(x, z) {
  if (z < MOUTH_CORNER_Z - 0.1) return 0;
  const u = clamp01(1 - (Math.abs(x) / (mouthHalfW(z) * 0.92)) ** 2);
  return 0.11 * Math.sqrt(u) * clamp01((z + 0.1) / 0.28);
}
/** língua: larga atrás, afina na ponta, sobe do assoalho com sulco no meio */
export function tongue(x, y, z) {
  const zt = Math.min(1.0, Math.max(-0.25, z));
  const k = (zt + 0.25) / 1.25; // 0 atrás, 1 na ponta
  // dorso ~1,5 cm abaixo da linha da boca; ponta um pouco mais baixa
  const top = mouthY(z) - 0.015 - 0.02 * k;
  let d = roundCone(x / 1.0, (y - top + 0.05) / 0.42, z, 0, 0, -0.22, 0, 0, 1.02, 0.17, 0.085) * 0.42; // larga e achatada: lê como língua, não bastão
  d = smax(d, -capsule(x, y, z, 0, top + 0.01, -0.15, 0, top + 0.002, 0.95, 0.014), 0.018); // sulco central
  return d;
}

export function headBody(x, y, z) {
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, 0, 0.18, -0.2, 0.48, 0.44, 0.64); // crânio mais largo
  // focinho: largo na base (junto aos olhos), afina e achata na ponta
  d = smin(d, roundCone(x / 0.92, (y - 0.03) / 0.8 + 0.03, z, 0, 0.06, 0.05, 0, 0.02, 1.4, 0.4, 0.17) * 0.8, 0.2);
  d = smin(d, ellipsoid(x, y, z, 0, 0.1, 1.4, 0.18, 0.09, 0.14), 0.08); // ponta achatada
  d = smin(d, ellipsoid(ax, y, z, 0.095, 0.2, 1.48, 0.055, 0.042, 0.055), 0.035); // aros das narinas
  d = smin(d, capsule(x, y, z, 0, 0.19, 0.4, 0, 0.22, 1.28, 0.08), 0.1); // dorso do focinho
  d = smin(d, ellipsoid(ax, y, z, 0.095, 0.185, 1.44, 0.07, 0.055, 0.085), 0.045); // asas das narinas
  // sobrancelhas pesadas que encobrem os olhos (olhar severo)
  d = smin(d, roundCone(ax, y, z, 0.07, 0.34, 0.55, 0.48, 0.43, -0.02, 0.06, 0.095), 0.08);
  d = smin(d, ellipsoid(ax, y, z, 0.33, 0.34, 0.35, 0.12, 0.045, 0.12), 0.035); // pálpebra superior
  d = smin(d, ellipsoid(ax, y, z, 0.38, 0.0, -0.04, 0.22, 0.26, 0.38), 0.12); // maçãs/bochechas
  d = smin(d, roundCone(ax, y, z, 0.32, -0.05, 0.0, 0.18, -0.07, 1.28, 0.08, 0.048), 0.06); // lábio superior
  d = smin(d, roundCone(x, y, z, 0, 0.1, -0.35, 0, -0.1, -1.35, 0.48, 0.38), 0.16); // pescoço mais grosso
  d = smin(d, ellipsoid(ax, y, z, 0.17, 0.24, 0.88, 0.075, 0.05, 0.2), 0.05); // rugas do focinho
  // órbitas e narinas
  d = smax(d, -ellipsoid(ax, y, z, EYE.x + 0.01, EYE.y, EYE.z + 0.02, 0.1, 0.085, 0.11), 0.035);
  d = smax(d, -ellipsoid(ax, y, z, 0.095, 0.23, 1.49, 0.032, 0.04, 0.045), 0.018); // narinas p/ cima
  return d + (fbm(x * 7, y * 7, z * 7) - 0.5) * 0.012;
}

export function headUpper(x, y, z) {
  // volume da boca (abaixo do palato, à frente do canto); canto arredondado (comissura, sem degrau)
  const cut = smax(y - mouthY(z) - palateLift(x, z), MOUTH_CORNER_Z - z, 0.06);
  return smax(headBody(x, y, z), -cut, 0.022);
}

/** mandíbula; `carve = false` sem a cavidade da boca (para achar a borda onde vão os dentes) */
export function jaw(x, y, z, carve = true) {
  const ax = Math.abs(x);
  let d = roundCone(x / 1.1, (y + 0.2) / 0.62 - 0.2, z, 0, -0.2, -0.3, 0, -0.2, 1.3, 0.29, 0.15) * 0.62;
  d = smin(d, ellipsoid(x, y, z, 0, -0.27, 1.15, 0.16, 0.1, 0.16), 0.08); // queixo
  d = smin(d, roundCone(ax, y, z, 0.27, -0.155, 0.0, 0.165, -0.15, 1.22, 0.065, 0.045), 0.05); // lábio inferior
  d = smin(d, ellipsoid(x, y, z, 0, -0.3, 0.25, 0.2, 0.08, 0.4), 0.1); // papada/garganta
  d += (fbm(x * 7 + 3, y * 7, z * 7) - 0.5) * 0.01;
  const top = (xx, zz) => mouthY(zz) - 0.006 - (carve ? floorDrop(xx, zz) : 0);
  d = smax(d, y - top(x, z), 0.018); // gengivas nas bordas, assoalho rebaixado no meio
  // traseira arredondada que sobe para dentro das bochechas (articulação escondida)
  d = smin(d, ellipsoid(Math.abs(x), y, z, 0.24, -0.16, -0.22, 0.13, 0.13, 0.2), 0.12);
  d = smax(d, -0.5 - z, 0.14);
  d = smax(d, y - top(x, z), 0.018);
  return carve ? smin(d, tongue(x, y, z), 0.02) : d;
}

// ── cores ──
const C = {
  // paleta da referência: verde-limão vivo, barriga pêssego
  top: hex('#2d8a29'), mid: hex('#4cb83a'), side: hex('#80d457'), belly: hex('#f0c28c'), bellyShade: hex('#c99a62'),
  socket: hex('#123a12'), nose: hex('#3a9a30'),
  // boca: cada tecido com cor própria (lábio escuro, gengiva rosada, palato vinho com rugas,
  // língua rosa com o meio mais claro, assoalho e garganta escurecendo para dar profundidade)
  lip: hex('#1f4a1a'), lipInner: hex('#c46870'), gum: hex('#e87888'), palate: hex('#c04455'), rugae: hex('#8a2838'),
  tongue: hex('#f08098'), tongueHi: hex('#ffc0cc'), floor: hex('#6a1c2a'), throat: hex('#100206'),
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

/** fundo da boca escurece só bem na garganta (mantém palato/língua legíveis) */
const depth = (z, c) => lerp3(C.throat, c, ss(-0.45, 0.05, z));

export function headColor(p, n) {
  const [x, y, z] = p;
  const roof = mouthY(z) + palateLift(x, z);
  // palato: qualquer superfície voltada para baixo à frente do canto e perto da linha da boca
  if (z > MOUTH_CORNER_Z - 0.1 && n[1] < 0.15 && y < roof + 0.04 && y > mouthY(z) - 0.08) {
    const edge = Math.abs(x) / mouthHalfW(z);
    const rug = z > 0.3 && z < 1.2 ? ss(0.4, 1, Math.sin(z * 26)) * (1 - ss(0.4, 0.85, edge)) : 0;
    let c = lerp3(C.palate, C.rugae, rug * 0.5);
    c = lerp3(c, C.gum, ss(0.55, 0.86, edge));
    c = lerp3(c, C.lipInner, ss(0.9, 1.1, edge));
    return [...depth(z, c), 1];
  }
  const ex = Math.abs(x) - EYE.x, ey = y - EYE.y, ez = z - EYE.z;
  const de = Math.hypot(ex, ey, ez);
  // barriga só no pescoço/crânio; focinho de baixo fica verde (pêssego confundia com a boca)
  const bellyAmt = ss(-0.45, -0.8, n[1]) * ss(0.1, -0.4, y) * (1 - ss(0.15, 0.55, z));
  let c = skinColor(p, n, bellyAmt);
  if (de < 0.2) c = lerp3(C.socket, c, ss(0.12, 0.2, de));
  if (z > 1.25 && y > 0.05) c = lerp3(c, C.nose, 0.5);
  const lipD = Math.abs(y - mouthY(z));
  if (z > MOUTH_CORNER_Z && lipD < 0.06) c = lerp3(C.lip, c, ss(0.0, 0.06, lipD));
  // faixa de gengiva externa no lábio (visível com a boca entreaberta)
  if (z > MOUTH_CORNER_Z && y < mouthY(z) + 0.02 && y > mouthY(z) - 0.04 && n[1] < 0.4)
    c = lerp3(c, C.gum, ss(0.02, 0.0, lipD) * 0.85);
  return c;
}

export function jawColor(p, n) {
  const [x, y, z] = p;
  const td = tongue(x, y, z);
  if (td < 0.018 && n[1] > -0.35) {
    // língua: rosa claro no dorso, sulco escuro, laterais um pouco mais fundas
    const mid = 1 - ss(0.015, 0.1, Math.abs(x));
    const groove = 1 - ss(0.003, 0.018, Math.abs(x));
    let c = lerp3(C.tongue, C.tongueHi, mid * 0.7 * ss(0.15, 0.85, n[1]));
    c = lerp3(c, C.floor, groove * 0.55 + (1 - ss(0.1, 0.7, n[1])) * 0.25);
    return [...depth(z, c), 1];
  }
  const edge = Math.abs(x) / mouthHalfW(z);
  // dentro da boca pela POSIÇÃO: as paredes da calha (assoalho → gengiva) são quase verticais e,
  // filtradas pela normal, saíam com escamas de pele
  if (z > MOUTH_CORNER_Z - 0.15 && y > mouthY(z) - 0.14 && (edge < 1.02 || (edge < 1.3 && n[1] > 0.3))) {
    // assoalho (escuro) → gengiva nas bordas → borda interna do lábio
    let c = lerp3(C.floor, C.gum, ss(0.65, 0.9, edge));
    c = lerp3(c, C.lipInner, ss(0.95, 1.15, edge));
    return [...depth(z, c), 1];
  }
  // papada: menos pêssego perto da boca (senão a mandíbula “vira” o palato na foto de baixo)
  const bellyAmt = ss(0.0, -0.6, n[1]) * (1 - ss(0.2, 0.7, z) * ss(-0.05, -0.2, y));
  let c = skinColor(p, n, bellyAmt);
  const lipD = Math.abs(y - mouthY(z));
  if (lipD < 0.05) c = lerp3(C.lip, c, ss(0.0, 0.05, lipD));
  if (z > MOUTH_CORNER_Z && lipD < 0.055 && n[1] > -0.2)
    c = lerp3(c, C.gum, ss(0.03, 0.0, lipD) * 0.75);
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
