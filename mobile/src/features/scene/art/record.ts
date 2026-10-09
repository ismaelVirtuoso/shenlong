import { PaintStyle, Skia, StrokeCap, StrokeJoin, type SkImage, type SkPicture } from '@shopify/react-native-skia';
import type { Layer } from './head';
import type { Shape } from './landscape';
import type { Pt } from './geom';

function paints(fill?: string, stroke?: string, sw = 0) {
  const f = fill ? Skia.Paint() : null;
  if (f && fill) {
    f.setAntiAlias(true);
    f.setColor(Skia.Color(fill));
  }
  const s = stroke && sw > 0 ? Skia.Paint() : null;
  if (s && stroke) {
    s.setAntiAlias(true);
    s.setColor(Skia.Color(stroke));
    s.setStyle(PaintStyle.Stroke);
    s.setStrokeWidth(sw);
    s.setStrokeJoin(StrokeJoin.Round);
    s.setStrokeCap(StrokeCap.Round);
  }
  return { f, s };
}

/**
 * Grava camadas vetoriais como SkPicture (uma vez, no JS): desenhar a cabeça inteira
 * por quadro vira uma única operação barata. Sequências de mesma `part` viram uma picture cada,
 * preservando a ordem (o app anima mandíbula/boca separadamente).
 */
export interface Run {
  part: Layer['part'];
  picture: SkPicture;
  /** limites (com folga p/ o contorno) no espaço da arte */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function recordLayers(layers: Layer[]): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < layers.length) {
    const part = layers[i]!.part;
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(-600, -600, 2200, 2200));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    while (i < layers.length && layers[i]!.part === part) {
      const l = layers[i]!;
      const path = Skia.Path.MakeFromSVGString(l.d);
      if (path) {
        const { f, s } = paints(l.fill, l.stroke, l.sw);
        if (f) canvas.drawPath(path, f);
        if (s) canvas.drawPath(path, s);
        const b = path.getBounds();
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      i++;
    }
    const m = 8;
    runs.push({ part, picture: rec.finishRecordingAsPicture(), x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m });
  }
  return runs;
}

export function shapePath(pts: Pt[]) {
  const b = Skia.PathBuilder.Make();
  pts.forEach((p, k) => (k ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1])));
  b.close();
  return b.build();
}

export function recordShapes(shapes: Shape[], w: number, h: number): SkPicture {
  const rec = Skia.PictureRecorder();
  const canvas = rec.beginRecording(Skia.XYWHRect(-w, -h, w * 3, h * 3));
  for (const sh of shapes) {
    const path = shapePath(sh.pts);
    const { f, s } = paints(sh.fill, sh.stroke, sh.sw ?? 0);
    if (f) canvas.drawPath(path, f);
    if (s) canvas.drawPath(path, s);
  }
  return rec.finishRecordingAsPicture();
}

/**
 * Rasteriza uma picture (uma vez, na CPU) numa imagem na resolução do aparelho.
 * Desenhar a textura por quadro é muito mais barato do que re-tesselar centenas de caminhos.
 */
export function rasterize(pic: SkPicture, x: number, y: number, w: number, h: number, scale: number): SkImage | null {
  const W = Math.max(1, Math.ceil(w * scale)), H = Math.max(1, Math.ceil(h * scale));
  const surf = Skia.Surface.Make(W, H);
  if (!surf) return null;
  const c = surf.getCanvas();
  c.scale(scale, scale);
  c.translate(-x, -y);
  c.drawPicture(pic);
  surf.flush();
  return surf.makeImageSnapshot();
}
