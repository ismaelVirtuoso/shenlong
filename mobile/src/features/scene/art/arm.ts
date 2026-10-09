/** Braço com garras (estilo anime), em coordenadas locais: ombro em (0,0), apontando para +x. Unidades da arte (cabeça = 1000). */
import { C, type Layer } from './head';
import { ellipse, smooth, taper, toD, tuft, type Pt } from './geom';

const L: Layer[] = [];
const add = (pts: Pt[], fill: string | undefined, stroke: string | undefined = C.ink, sw = 6) =>
  L.push({ d: toD(pts), fill, stroke, sw, part: 'head' });

// espinho do cotovelo (atrás)
tuft([135, 75], [120, 145], [70, 55], 28, 6).forEach((p) => add(p, C.tuftShade));
// braço e antebraço
add(taper(smooth([[0, 0], [70, 40], [140, 70]], false, 10), 84, 64), C.green);
add(taper(smooth([[140, 70], [210, 70], [270, 50]], false, 10), 64, 54), C.green);
// faixa ventral (placas) no antebraço
add(taper(smooth([[150, 92], [210, 92], [262, 74]], false, 8), 18, 14), C.belly, C.ink, 4);
// escamas em traço
for (const [x, y] of [[50, 18], [95, 40], [180, 52], [225, 46]] as Pt[])
  L.push({ d: toD(smooth([[x - 12, y - 5], [x, y + 6], [x + 12, y - 5]], false, 5), false), stroke: C.greenShade, sw: 4, part: 'head' });
// mão
add(ellipse(300, 52, 48, 36, -0.2, 24), C.green);
// dedos + garras
for (const [a, len] of [[-50, 70], [-20, 82], [10, 80], [40, 64]] as [number, number][]) {
  const r = (a * Math.PI) / 180;
  const base: Pt = [300 + Math.cos(r) * 28, 52 + Math.sin(r) * 22];
  const tip: Pt = [base[0] + Math.cos(r) * len, base[1] + Math.sin(r) * len];
  add(taper(smooth([base, [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 - 4], tip], false, 6), 26, 20), C.green);
  const cr = r + 0.6;
  const claw: Pt[] = smooth([tip, [tip[0] + Math.cos(r) * 26, tip[1] + Math.sin(r) * 26], [tip[0] + Math.cos(cr) * 44, tip[1] + Math.sin(cr) * 44]], false, 8);
  add(taper(claw, 20, 0), '#f1ecd6', C.ink, 4);
}

export const ARM_LAYERS: Layer[] = L;
