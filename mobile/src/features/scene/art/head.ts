/**
 * Cabeça do Shenlong em estilo anime (vista frontal), desenhada em vetor.
 * Fonte única: o app desenha com Skia; tools/art/preview gera SVG/PNG para revisão.
 * Espaço 1000×1000, eixo de simetria em x=500.
 */
import { chain, ellipse, mirrorX, smooth, symmetric, taper, toD, tuft, type Pt } from './geom';

export const C = {
  ink: '#0c1d0e',
  green: '#3d9c3e',
  greenShade: '#24692b',
  greenLight: '#67c75c',
  tuft: '#7ad66b',
  tuftShade: '#47a446',
  mane: '#2c7a32',
  maneShade: '#1d5a24',
  horn: '#6a4422',
  hornShade: '#3f2713',
  hornLight: '#94643a',
  socket: '#0d230f',
  mouth: '#4a0c17',
  tongue: '#b9465f',
  teeth: '#f6f2e2',
  belly: '#d8c98a',
  bellyShade: '#a8975b',
  whisker: '#e3c24c',
};

/** parte: o app anima 'jaw' (desce) e 'mouth' (estica) separadamente */
export interface Layer {
  d: string;
  fill?: string;
  stroke?: string;
  sw?: number;
  part: 'back' | 'head' | 'mouth' | 'jaw';
}

const both = (pts: Pt[]) => [pts, pts.map(mirrorX).reverse()];
const L: Layer[] = [];
const add = (pts: Pt[], fill: string | undefined, part: Layer['part'], stroke: string | undefined = C.ink, sw = 6) =>
  L.push({ d: toD(pts), fill, stroke, sw, part });
const addBoth = (pts: Pt[], fill: string | undefined, part: Layer['part'], stroke: string | undefined = C.ink, sw = 6) =>
  both(pts).forEach((p) => add(p, fill, part, stroke, sw));
const line = (pts: Pt[], stroke: string, sw: number, part: Layer['part'] = 'head') =>
  L.push({ d: toD(pts, false), stroke, sw, part });

// ── juba traseira: coroa de espinhos atrás do crânio ──
{
  const pts: Pt[] = [];
  const n = 15;
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * (195 + (150 * i) / n)) / 180;
    const r0 = 250, r1 = 250 + (i % 2 ? 60 : 150 + 40 * Math.sin(i * 1.7));
    pts.push([500 + Math.cos(a) * r0 * 1.15, 470 + Math.sin(a) * r0]);
    if (i < n) {
      const am = (Math.PI * (195 + (150 * (i + 0.5)) / n)) / 180;
      pts.push([500 + Math.cos(am) * r1 * 1.15, 470 + Math.sin(am) * r1]);
    }
  }
  pts.push([500 + 290, 560], [500 - 290, 560]);
  add(pts, C.mane, 'back');
}

// ── chifres (galhada marrom) ──
{
  const beam = smooth([[580, 335], [598, 240], [640, 130], [690, 12]], false, 12);
  const tine1 = smooth([[612, 205], [668, 178], [735, 172]], false, 8);
  const tine2 = smooth([[645, 118], [628, 74], [598, 40]], false, 8);
  for (const [c, w0] of [[beam, 74], [tine1, 38], [tine2, 32]] as [Pt[], number][]) {
    addBoth(taper(c, w0, 6, true), C.horn, 'back');
  }
  // lado sombreado da galhada (cel) + nós
  addBoth(taper(smooth([[598, 330], [612, 240], [648, 140], [688, 30]], false, 10), 26, 2, true), C.hornShade, 'back', undefined);
  for (const y of [305, 275, 245, 215]) line([[572 + (320 - y) * 0.18, y], [616 + (320 - y) * 0.2, y - 8]], C.ink, 4, 'back');
  for (const y of [305, 275, 245, 215]) line([mirrorX([572 + (320 - y) * 0.18, y]), mirrorX([616 + (320 - y) * 0.2, y - 8])], C.ink, 4, 'back');
}

// ── tufos laterais (bochechas) e das sobrancelhas: pelo verde-claro espetado ──
{
  const cheek = tuft([752, 530], [-40, -20, 0, 18, 36, 55], [190, 225, 245, 215, 180, 140], 50, -20);
  cheek.forEach((p) => addBoth(p, C.tuft, 'back'));
  const cheekLow = tuft([735, 630], [20, 42, 62], [150, 135, 105], 42, -10);
  cheekLow.forEach((p) => addBoth(p, C.tuftShade, 'back'));
  const brow = tuft([745, 368], [-80, -60, -42, -24], [150, 185, 170, 130], 40, 14);
  brow.forEach((p) => addBoth(p, C.tuft, 'back'));
}

// ── crânio + bochechas + focinho (silhueta) ──
const skullHalf = chain([
  [[500, 296], [575, 292], [650, 314], [712, 350]],
  [[712, 350], [752, 375], [782, 425], [784, 490]],
  [[784, 490], [786, 570], [748, 640], [700, 688]],
  [[700, 688], [680, 722], [668, 752], [640, 772]],
  [[640, 772], [600, 786], [550, 788], [500, 788]],
]);
add(symmetric(skullHalf), C.green, 'head');

// sombras chapadas (cel): bochechas baixas e laterais do focinho
addBoth(
  smooth([[782, 520], [766, 610], [712, 690], [672, 760], [650, 700], [700, 620], [748, 548]], true, 8),
  C.greenShade, 'head', undefined,
);
// testa: brilho de luz vindo de cima (cel), sem contorno
add(smooth([[500, 304], [580, 312], [640, 340], [600, 360], [500, 352], [400, 360], [360, 340], [420, 312]], true, 8), C.greenLight, 'head', undefined);

// escamas da testa/bochechas (traços em "U")
{
  const marks: Pt[][] = [];
  const u = (x: number, y: number, s: number) => smooth([[x - s, y - s * 0.4], [x, y + s * 0.5], [x + s, y - s * 0.4]], false, 6);
  for (const [x, y] of [[470, 330], [530, 330], [500, 365], [445, 380], [555, 380], [470, 410], [530, 410]] as Pt[]) marks.push(u(x, y, 16));
  for (const [x, y] of [[700, 470], [735, 500], [715, 545], [745, 575], [690, 600]] as Pt[]) {
    marks.push(u(x, y, 15));
    marks.push(u(1000 - x, y, 15));
  }
  marks.forEach((m) => line(m, C.greenShade, 5));
}

// ── órbitas e olhos (o app desenha o brilho vermelho por cima) ──
export const EYE = { cx: 612, cy: 486, rx: 54, ry: 17, rot: -0.36 };
addBoth(ellipse(EYE.cx + 2, EYE.cy + 6, EYE.rx + 16, EYE.ry + 14, EYE.rot, 28), C.socket, 'head', undefined);
addBoth(ellipse(EYE.cx, EYE.cy, EYE.rx, EYE.ry, EYE.rot, 28), '#7a0c08', 'head', C.ink, 5);

// ── sobrancelhas: crista pesada em V (expressão severa) ──
{
  const brow: Pt[] = [[508, 478], [540, 440], [610, 405], [690, 372], [770, 348], [790, 372], [760, 400], [690, 432], [620, 458], [548, 492], [520, 500]];
  addBoth(brow, C.green, 'head');
  addBoth([[530, 470], [560, 440], [620, 412], [700, 382], [768, 360], [776, 372], [700, 398], [620, 430], [560, 462]], C.greenLight, 'head', undefined);
  // sombra que a sobrancelha projeta sobre o olho
  addBoth([[530, 498], [620, 462], [700, 436], [756, 408], [740, 430], [690, 455], [615, 482], [548, 508]], C.greenShade, 'head', undefined);
}

// ── focinho: ponte do nariz + narinas ──
{
  const muzzle = symmetric(chain([
    [[500, 470], [545, 470], [570, 520], [590, 570]],
    [[590, 570], [630, 590], [668, 625], [660, 670]],
    [[660, 670], [640, 706], [575, 712], [500, 708]],
  ]));
  add(muzzle, C.green, 'head');
  addBoth(smooth([[590, 575], [640, 600], [662, 640], [650, 676], [615, 650], [600, 610]], true, 6), C.greenShade, 'head', undefined);
  add(smooth([[500, 482], [532, 498], [548, 560], [530, 612], [500, 620], [470, 612], [452, 560], [468, 498]], true, 8), C.greenLight, 'head', undefined);
  // rugas do nariz
  for (const y of [515, 540, 565, 590]) line(smooth([[474, y], [500, y + 8], [526, y]], false, 6), C.greenShade, 5);
  // narinas (largas, na frente do focinho)
  addBoth(ellipse(574, 652, 40, 21, 0.4, 24), C.socket, 'head', C.ink, 5);
  addBoth(smooth([[536, 622], [592, 610], [640, 632], [630, 660]], false, 6), undefined, 'head', C.ink, 7);
}

// ── boca: interior (estica ao abrir), presas superiores, mandíbula (desce) ──
export const MOUTH_TOP = 772;
add(symmetric(chain([[[500, MOUTH_TOP - 4], [580, MOUTH_TOP - 6], [640, MOUTH_TOP - 10], [668, MOUTH_TOP - 22]], [[668, MOUTH_TOP - 22], [660, MOUTH_TOP + 50], [600, MOUTH_TOP + 90], [500, MOUTH_TOP + 95]]])), C.mouth, 'mouth', C.ink, 6);
add(symmetric(chain([[[500, MOUTH_TOP + 40], [550, MOUTH_TOP + 42], [590, MOUTH_TOP + 55], [600, MOUTH_TOP + 72]], [[600, MOUTH_TOP + 72], [580, MOUTH_TOP + 88], [540, MOUTH_TOP + 92], [500, MOUTH_TOP + 92]]])), C.tongue, 'mouth', undefined);

// presas superiores (penduradas no lábio)
{
  const fang = (x: number, len: number, w: number) => taper(smooth([[x, MOUTH_TOP - 6], [x + 3, MOUTH_TOP + len * 0.6], [x - 4, MOUTH_TOP + len]], false, 6), w, 0);
  for (const [x, len, w] of [[610, 98, 32], [560, 48, 20], [648, 44, 18], [526, 36, 16]] as [number, number, number][]) {
    addBoth(fang(x, len, w), C.teeth, 'head', C.ink, 4);
  }
}

// mandíbula inferior com dentes (o app a desloca para baixo ao falar)
export const JAW_TOP = 830;
{
  const jaw = symmetric(chain([
    [[500, JAW_TOP + 22], [560, JAW_TOP + 22], [625, JAW_TOP + 10], [672, JAW_TOP - 18]],
    [[672, JAW_TOP - 18], [690, JAW_TOP + 25], [660, JAW_TOP + 85], [610, JAW_TOP + 108]],
    [[610, JAW_TOP + 108], [570, JAW_TOP + 125], [540, JAW_TOP + 130], [500, JAW_TOP + 130]],
  ]));
  add(jaw, C.green, 'jaw');
  add(symmetric(chain([[[500, JAW_TOP + 85], [560, JAW_TOP + 84], [610, JAW_TOP + 70], [640, JAW_TOP + 50]], [[640, JAW_TOP + 50], [610, JAW_TOP + 100], [560, JAW_TOP + 118], [500, JAW_TOP + 120]]])), C.greenShade, 'jaw', undefined);
  const tooth = (x: number, len: number, w: number) => taper(smooth([[x, JAW_TOP + 24], [x - 2, JAW_TOP + 24 - len * 0.6], [x + 3, JAW_TOP + 24 - len]], false, 6), w, 0);
  for (const [x, len, w] of [[588, 40, 22], [540, 26, 16], [630, 28, 15]] as [number, number, number][]) addBoth(tooth(x, len, w), C.teeth, 'jaw', C.ink, 4);
  // tufos do queixo
  tuft([640, JAW_TOP + 90], [40, 62, 84], [80, 95, 70], 30, 8).forEach((p) => addBoth(p, C.tuftShade, 'jaw'));
}

export const HEAD_LAYERS: Layer[] = L;

/** Âncoras (espaço 1000×1000) para o app: olhos com brilho, raiz dos bigodes, pescoço. */
export const ANCHORS = {
  eyeR: [EYE.cx, EYE.cy] as Pt,
  eyeL: mirrorX([EYE.cx, EYE.cy]),
  whiskerR: [668, 730] as Pt,
  whiskerL: mirrorX([668, 730]),
  neck: [500, 820] as Pt,
};
