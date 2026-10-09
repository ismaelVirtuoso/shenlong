import { useMemo } from 'react';
import { BlendMode, Circle, Group, Image, Oval, Path, Picture, RadialGradient, Skia, VertexMode, vec, type SkPoint } from '@shopify/react-native-skia';
import { PixelRatio } from 'react-native';
import { interpolateColor, useDerivedValue } from 'react-native-reanimated';
import { ANCHORS, C, EYE, HEAD_LAYERS, JAW_TOP, MOUTH_TOP } from './art/head';
import { ARM_LAYERS } from './art/arm';
import { rasterize, recordLayers } from './art/record';
import { clamp, smooth } from './math';
import type { Layout, SceneValues } from './types';

/**
 * Trajetória do corpo (fração de W, H), da raiz (sob as nuvens) até o pescoço (atrás da cabeça).
 * O corpo se enrola em volta da cabeça como no anime: sobe pela direita, passa por trás dos
 * chifres no alto e desce pela esquerda até o pescoço.
 */
const CTRL: [number, number][] = [
  [0.52, 1.14], [0.5, 0.93], [0.4, 0.79], [0.53, 0.67], [0.72, 0.6], [0.91, 0.47], [0.99, 0.27], [0.83, 0.08],
  [0.5, 0.02], [0.18, 0.08], [0.02, 0.25], [0.09, 0.45], [0.33, 0.52], [0.5, 0.47],
];
const M = 110; // amostras da trajetória
const K = 60; // anéis do corpo
const BELLY = -1; // barriga virada para dentro do anel (para a cabeça); dorso e espinhos para fora

interface Body {
  n: number;
  x: number[];
  y: number[];
  w: number[];
  tx: number[];
  ty: number[];
  hx: number;
  hy: number;
  rot: number;
}

export function AnimeDragon({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H } = L;
  const hs = (W * 0.84) / 1000; // escala da arte da cabeça
  // arte estática → texturas na resolução do aparelho (uma vez)
  const px = Math.min(1.25, hs * PixelRatio.get());
  const head = useMemo(
    () => recordLayers(HEAD_LAYERS).map((r) => ({ ...r, image: rasterize(r.picture, r.x, r.y, r.w, r.h, px) })),
    [px],
  );
  const arm = useMemo(() => {
    const r = recordLayers(ARM_LAYERS)[0]!;
    return { ...r, image: rasterize(r.picture, r.x, r.y, r.w, r.h, px * 1.2) };
  }, [px]);

  const body = useDerivedValue<Body>(() => {
    const t = S.clock.value / 1000;
    const ap = S.appear.value;
    // pontos de controle com ondulação (menor perto do pescoço e da raiz)
    const N = CTRL.length;
    const cx: number[] = [], cy: number[] = [];
    for (let i = 0; i < N; i++) {
      const k = i === 0 || i === N - 1 ? 0 : 1;
      cx.push(CTRL[i]![0] * W + k * Math.sin(t * 0.8 + i * 1.3) * W * 0.012);
      cy.push(CTRL[i]![1] * H + k * Math.cos(t * 0.65 + i * 1.1) * W * 0.012);
    }
    // Catmull-Rom uniforme → tabela de comprimento de arco
    const px: number[] = [], py: number[] = [], len: number[] = [];
    let acc = 0;
    for (let j = 0; j < M; j++) {
      const g = (j / (M - 1)) * (N - 1);
      const s = Math.min(N - 2, Math.floor(g));
      const u = g - s;
      const i0 = Math.max(0, s - 1), i3 = Math.min(N - 1, s + 2);
      const u2 = u * u, u3 = u2 * u;
      const f0 = -0.5 * u3 + u2 - 0.5 * u, f1 = 1.5 * u3 - 2.5 * u2 + 1, f2 = -1.5 * u3 + 2 * u2 + 0.5 * u, f3 = 0.5 * u3 - 0.5 * u2;
      const x = cx[i0]! * f0 + cx[s]! * f1 + cx[s + 1]! * f2 + cx[i3]! * f3;
      const y = cy[i0]! * f0 + cy[s]! * f1 + cy[s + 1]! * f2 + cy[i3]! * f3;
      if (j > 0) acc += Math.hypot(x - px[j - 1]!, y - py[j - 1]!);
      px.push(x); py.push(y); len.push(acc);
    }
    const total = acc;
    const ah = total * ap; // posição da cabeça ao longo do caminho
    const ds = total / (K - 1);
    const x: number[] = [], y: number[] = [], w: number[] = [];
    let j = M - 1;
    for (let k = 0; k < K; k++) {
      const a = ah - k * ds;
      if (a < 0) break;
      while (j > 0 && len[j - 1]! > a) j--;
      const j0 = Math.max(0, j - 1);
      const f = (a - len[j0]!) / (len[j]! - len[j0]! || 1);
      x.push(px[j0]! + (px[j]! - px[j0]!) * f);
      y.push(py[j0]! + (py[j]! - py[j0]!) * f);
      const s01 = (k * ds) / total;
      w.push(W * (0.094 + 0.016 * smooth(0, 0.15, s01) - 0.024 * smooth(0.75, 1, s01)) * (0.96 + 0.04 * Math.sin(t * 2 + k * 0.4)));
    }
    const n = x.length;
    const tx: number[] = [], ty: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      const dx = x[b]! - x[a]!, dy = y[b]! - y[a]!;
      const l = Math.hypot(dx, dy) || 1;
      tx.push(dx / l); ty.push(dy / l);
    }
    // cabeça: na ponta do corpo; o "queixo" aponta para o corpo que vem atrás
    const front = smooth(0.8, 0.98, ap);
    const trav = n > 1 ? Math.atan2(-tx[0]!, ty[0]!) : 0;
    const tilt = 0.05 * Math.sin(t * 0.7) + 0.06 * S.listen.value * Math.sin(t * 1.1) + 0.08 * S.think.value * Math.sin(t * 0.5) + 0.1 * S.poke.value * Math.sin(t * 22);
    const rot = clamp(trav, -1.1, 1.1) * (1 - front) + tilt;
    const sc = hs * (0.55 + 0.45 * smooth(0.25, 1, ap)) * (1 + 0.012 * Math.sin(t * 1.6) + 0.05 * S.wish.value);
    const nx = n ? x[0]! : W / 2, ny = n ? y[0]! : H * 1.2;
    // centro da cabeça = pescoço + (0, -320) no espaço da arte, girado
    const off = 320 * sc;
    return { n, x, y, w, tx, ty, hx: nx + Math.sin(rot) * off, hy: ny - Math.cos(rot) * off + Math.sin(t * 0.9) * 4 * front, rot };
  });

  const vis = useDerivedValue(() => (S.appear.value > 0.003 ? 1 : 0));
  // "serpente de luz" ao surgir → cores do dragão ao assentar
  const light = useDerivedValue(() => 1 - smooth(0.55, 0.92, S.appear.value));

  // ── corpo: malhas de triângulos (drawVertices) gravadas numa SkPicture por quadro ──
  // Caminhos dinâmicos complexos caem no rasterizador por software do Skia em muitos aparelhos
  // (máscara na CPU do tamanho da tela, por camada). Faixas de triângulos vão direto para a GPU.
  const STRIP = VertexMode.TriangleStrip, TRIS = VertexMode.Triangles, MODE = BlendMode.Dst;
  const bodyPic = useDerivedValue(() => {
    const b = body.value;
    const t = S.clock.value / 1000;
    const li = light.value;
    const rec = Skia.PictureRecorder();
    const cv = rec.beginRecording(Skia.XYWHRect(-W, -H, W * 3, H * 3));
    if (b.n >= 2) {
      const paint = (c: string, a = 1) => {
        const p = Skia.Paint();
        p.setColor(Skia.Color(c));
        p.setAlphaf(a);
        return p;
      };
      // faixa entre dois deslocamentos laterais (frações da largura local + px extras)
      const band = (a0: number, a1: number, e0 = 0, e1 = 0) => {
        const pts: SkPoint[] = [];
        for (let k = 0; k < b.n; k++) {
          const nx = -b.ty[k]!, ny = b.tx[k]!, w = b.w[k]!;
          const o0 = a0 * w + e0, o1 = a1 * w + e1;
          pts.push({ x: b.x[k]! + nx * o0, y: b.y[k]! + ny * o0 }, { x: b.x[k]! + nx * o1, y: b.y[k]! + ny * o1 });
        }
        return pts;
      };
      const draw = (pts: SkPoint[], mode: VertexMode, p: ReturnType<typeof Skia.Paint>, colors?: Float32Array[]) => {
        if (pts.length < 3) return;
        cv.drawVertices(Skia.MakeVertices(mode, pts, null, colors), MODE, p);
      };
      const ink = interpolateColor(li, [0, 1], [C.ink, '#d8ff7a']);
      const green = interpolateColor(li, [0, 1], [C.green, '#f6ffc8']);
      const bellyC = interpolateColor(li, [0, 1], [C.belly, '#ffffff']);
      const solid = 1 - li;
      // aura: borda do corpo (opaca) → fora (transparente), sem blur
      const e = clamp(0.45 + 0.35 * li + 0.3 * S.wish.value + 0.08 * Math.sin(t * 2), 0, 1);
      const aIn = Skia.Color(`rgba(200,255,80,${(0.7 * e).toFixed(3)})`), aOut = Skia.Color('rgba(200,255,80,0)');
      for (const side of [1, -1]) {
        const pts = band(side * 1.0, side * 1.75, side * 2, side * 26);
        const cols: Float32Array[] = [];
        for (let k = 0; k < pts.length; k += 2) cols.push(aIn, aOut);
        draw(pts, STRIP, paint('#ffffff'), cols);
      }
      // espinhos do dorso (nanquim maior por baixo) + escamas + segmentos da barriga
      const finInk: SkPoint[] = [], finFill: SkPoint[] = [], scales: SkPoint[] = [], lines: SkPoint[] = [];
      for (let k = 1; k < b.n; k++) {
        const w = b.w[k]!, tx = b.tx[k]!, ty = b.ty[k]!, nx = -ty * BELLY, ny = tx * BELLY, x = b.x[k]!, y = b.y[k]!;
        if (k >= 3 && k < b.n - 2 && k % 2 === 1) {
          const dx = -nx, dy = -ny, bx = x + dx * w * 0.8, by = y + dy * w * 0.8;
          const len = w * (0.62 + 0.18 * Math.sin(k * 1.7)) * (1 + 0.08 * Math.sin(t * 3 + k));
          const tri = (arr: SkPoint[], ex: number) =>
            arr.push(
              { x: bx - tx * (w * 0.34 + ex), y: by - ty * (w * 0.34 + ex) },
              { x: bx + dx * (len + ex * 1.8) + tx * (w * 0.42 + ex), y: by + dy * (len + ex * 1.8) + ty * (w * 0.42 + ex) },
              { x: bx + tx * (w * 0.32 + ex), y: by + ty * (w * 0.32 + ex) },
            );
          tri(finInk, 3.5);
          tri(finFill, 0);
        }
        for (let q = 0; q < 2; q++) {
          const o = -(0.14 + 0.34 * q + (k % 2) * 0.17) * w, sz = w * 0.17;
          const qx = x + nx * o, qy = y + ny * o;
          scales.push(
            { x: qx - nx * sz, y: qy - ny * sz },
            { x: qx + tx * sz * 0.9, y: qy + ty * sz * 0.9 },
            { x: qx + nx * sz, y: qy + ny * sz },
          );
        }
        if (k % 2 === 0) {
          const h = 1.5, a0 = 0.14 * w, a1 = 0.92 * w, sk = w * 0.1;
          const p1 = { x: x + nx * a0 - tx * h, y: y + ny * a0 - ty * h }, p2 = { x: x + nx * a1 - tx * h + tx * sk, y: y + ny * a1 - ty * h + ty * sk };
          const p3 = { x: x + nx * a1 + tx * h + tx * sk, y: y + ny * a1 + ty * h + ty * sk }, p4 = { x: x + nx * a0 + tx * h, y: y + ny * a0 + ty * h };
          lines.push(p1, p2, p3, p1, p3, p4);
        }
      }
      draw(finInk, TRIS, paint(ink));
      draw(finFill, TRIS, paint(C.tuft));
      draw(band(1, -1, 4.5, -4.5), STRIP, paint(ink));
      draw(band(1, -1), STRIP, paint(green));
      if (solid > 0.01) {
        draw(band(-BELLY * 0.42, -BELLY * 0.74), STRIP, paint(C.greenLight, solid));
        draw(band(BELLY * 0.93, BELLY * 0.7), STRIP, paint(C.greenShade, solid));
        draw(scales, TRIS, paint('#1a5221', solid));
      }
      draw(band(BELLY * 0.12, BELLY * 0.93, -BELLY * 3, BELLY * 3), STRIP, paint(ink));
      draw(band(BELLY * 0.12, BELLY * 0.93), STRIP, paint(bellyC));
      draw(lines, TRIS, paint(ink));
    }
    return rec.finishRecordingAsPicture();
  });

  // ── cabeça ──
  const headT = useDerivedValue(() => {
    const b = body.value;
    const s = Math.max(0.0001, hs * (0.55 + 0.45 * smooth(0.25, 1, S.appear.value)) * (1 + 0.012 * Math.sin(S.clock.value / 625) + 0.05 * S.wish.value) * vis.value);
    return [{ translateX: b.hx }, { translateY: b.hy }, { rotate: b.rot }, { scale: s }, { translateX: -500 }, { translateY: -500 }];
  });
  const open = useDerivedValue(() => {
    const t = S.clock.value;
    const env = Math.abs(Math.sin(t * 0.0155)) * (0.6 + 0.4 * Math.sin(t * 0.0071 + 2));
    return clamp(S.speak.value * (0.15 + 0.75 * env) + 0.65 * S.wish.value + 0.2 * S.poke.value, 0, 1);
  });
  const jawT = useDerivedValue(() => [{ translateY: open.value * 95 }]);
  const mouthT = useDerivedValue(() => [
    { translateY: MOUTH_TOP }, { scaleY: 1 + (open.value * 95) / (JAW_TOP + 40 - MOUTH_TOP) }, { translateY: -MOUTH_TOP },
  ]);

  // olhos acesos: halo largo + íris com núcleo amarelo + reflexo
  const glow = useDerivedValue(() => {
    const t = S.clock.value / 1000;
    return clamp(0.55 + 0.35 * smooth(0.6, 1, S.appear.value) + 0.45 * S.speak.value + 0.9 * S.wish.value + 0.5 * S.listen.value * S.mic.value + 0.08 * Math.sin(t * 3.1), 0, 1.6);
  });
  const haloColors = useDerivedValue(() => {
    const g = glow.value;
    return [`rgba(255,70,50,${clamp(g, 0, 1).toFixed(3)})`, `rgba(235,20,12,${clamp(0.75 * g, 0, 1).toFixed(3)})`, `rgba(200,0,0,${clamp(0.3 * g, 0, 1).toFixed(3)})`, 'rgba(200,0,0,0)'];
  });
  const haloR = useDerivedValue(() => EYE.rx * (1.9 + 0.9 * glow.value));
  const glint = useDerivedValue(() => clamp(0.35 + 0.5 * (glow.value - 0.6), 0, 1));
  const irisColors = useDerivedValue(() => {
    const g = clamp(glow.value, 0, 1.2);
    return [g > 1 ? '#ffffff' : '#ffe8d0', interpolateColor(clamp(g, 0, 1), [0, 1], ['#d0201a', '#ff3a22']), '#a80606'];
  });

  // bigodes dourados (espaço da arte, acompanham a cabeça)
  const whisker = (side: number) =>
    useDerivedValue(() => {
      const t = S.clock.value / 1000;
      const [ax, ay] = side > 0 ? ANCHORS.whiskerR : ANCHORS.whiskerL;
      const p = Skia.PathBuilder.Make();
      p.moveTo(ax, ay);
      const w1 = Math.sin(t * 1.3 + side) * 40, w2 = Math.sin(t * 1.0 + side * 2) * 70, w3 = Math.sin(t * 1.6 + side) * 90;
      p.cubicTo(ax + side * 140, ay - 30 + w1, ax + side * 280, ay + 90 + w2, ax + side * 400, ay + 60 + w2 * 0.5);
      p.cubicTo(ax + side * 520, ay + 30 + w3 * 0.3, ax + side * 600, ay + 260 + w3, ax + side * 720, ay + 380 + w3 * 0.8);
      return p.build();
    });
  const wr = whisker(1), wl = whisker(-1);

  // braços com garras, abertos dos lados (como na referência)
  const armVis = useDerivedValue(() => smooth(0.85, 1, S.appear.value));
  const armR = useDerivedValue(() => {
    const t = S.clock.value / 1000;
    const s = Math.max(0.0001, hs * 1.2 * (0.6 + 0.4 * armVis.value) * armVis.value); // Picture ignora opacidade de grupo: some por escala
    return [{ translateX: W * 0.74 }, { translateY: H * 0.6 }, { rotate: 0.2 + 0.06 * Math.sin(t * 1.2) }, { scale: s }];
  });
  const armL = useDerivedValue(() => {
    const t = S.clock.value / 1000;
    const s = Math.max(0.0001, hs * 1.2 * (0.6 + 0.4 * armVis.value) * armVis.value);
    return [{ translateX: W * 0.27 }, { translateY: H * 0.53 }, { rotate: -0.25 - 0.06 * Math.sin(t * 1.2 + 1) }, { scaleX: -s }, { scaleY: s }];
  });

  const burst = useMemo(() => {
    const R = W * 1.3;
    const rec = Skia.PictureRecorder();
    const c = rec.beginRecording(Skia.XYWHRect(-R, -R, 2 * R, 2 * R));
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setShader(Skia.Shader.MakeRadialGradient(vec(0, 0), W * 1.1, [Skia.Color('rgba(255,255,200,1)'), Skia.Color('rgba(220,255,120,0.5)'), Skia.Color('rgba(180,255,80,0)')], null, 0));
    const p = Skia.PathBuilder.Make();
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, da = (Math.PI / n) * (0.35 + 0.3 * ((i * 7) % 3) / 2);
      p.moveTo(0, 0);
      p.lineTo(Math.cos(a - da) * W * 1.3, Math.sin(a - da) * W * 1.3);
      p.lineTo(Math.cos(a + da) * W * 1.3, Math.sin(a + da) * W * 1.3);
      p.close();
    }
    c.drawPath(p.build(), paint);
    return { image: rasterize(rec.finishRecordingAsPicture(), -R, -R, 2 * R, 2 * R, 0.5), R };
  }, [W]);
  const burstT = useDerivedValue(() => [{ translateX: W * 0.5 }, { translateY: H * 0.33 }, { rotate: S.clock.value / 20000 }]);
  const burstOpacity = useDerivedValue(() => 0.18 * smooth(0.7, 1, S.appear.value) + 0.25 * S.wish.value);

  return (
    <Group opacity={vis}>
      <Group transform={burstT} opacity={burstOpacity}>
        <Image image={burst.image} x={-burst.R} y={-burst.R} width={2 * burst.R} height={2 * burst.R} />
      </Group>
      <Picture picture={bodyPic} />
      {/* braços */}
      <Group opacity={armVis}>
        <Group transform={armL}>
          <Image image={arm.image} x={arm.x} y={arm.y} width={arm.w} height={arm.h} />
        </Group>
        <Group transform={armR}>
          <Image image={arm.image} x={arm.x} y={arm.y} width={arm.w} height={arm.h} />
        </Group>
      </Group>
      {/* cabeça */}
      <Group transform={headT}>
        {head.map((r, i) => {
          const img = <Image image={r.image} x={r.x} y={r.y} width={r.w} height={r.h} />;
          return r.part === 'jaw' ? (
            <Group key={i} transform={jawT}>{img}</Group>
          ) : r.part === 'mouth' ? (
            <Group key={i} transform={mouthT}>{img}</Group>
          ) : (
            <Group key={i}>{img}</Group>
          );
        })}
        {[ANCHORS.eyeR, ANCHORS.eyeL].map(([x, y], i) => (
          <Group key={i}>
            <Circle cx={x} cy={y} r={haloR} blendMode="screen">
              <RadialGradient c={vec(x, y)} r={haloR} colors={haloColors} positions={[0, 0.25, 0.55, 1]} />
            </Circle>
            {/* brilho horizontal (glint de anime) */}
            <Group transform={[{ translateX: x }, { translateY: y }, { rotate: i === 0 ? EYE.rot * 0.6 : -EYE.rot * 0.6 }]}>
              <Oval x={-EYE.rx * 2.6} y={-7} width={EYE.rx * 5.2} height={14} blendMode="screen" opacity={glint}>
                <RadialGradient c={vec(0, 0)} r={EYE.rx * 2.6} colors={['rgba(255,220,180,0.95)', 'rgba(255,80,40,0.5)', 'rgba(255,40,20,0)']} />
              </Oval>
            </Group>
            <Group transform={[{ translateX: x }, { translateY: y }, { rotate: i === 0 ? EYE.rot : -EYE.rot }]}>
              <Oval x={-EYE.rx * 0.92} y={-EYE.ry * 0.82} width={EYE.rx * 1.84} height={EYE.ry * 1.64}>
                <RadialGradient c={vec(0, 0)} r={EYE.rx * 0.95} colors={irisColors} positions={[0, 0.4, 1]} />
              </Oval>
              <Oval x={-EYE.rx * 0.92} y={-EYE.ry * 0.82} width={EYE.rx * 1.84} height={EYE.ry * 1.64} style="stroke" strokeWidth={5} color={C.ink} />
              <Oval x={-EYE.rx * 0.5} y={-EYE.ry * 0.35} width={EYE.rx} height={EYE.ry * 0.7} blendMode="screen">
                <RadialGradient c={vec(0, 0)} r={EYE.rx * 0.5} colors={['rgba(255,255,230,1)', 'rgba(255,230,150,0)']} />
              </Oval>
            </Group>
          </Group>
        ))}
        {[wr, wl].map((w, i) => (
          <Group key={i}>
            <Path path={w} style="stroke" strokeWidth={22} strokeCap="round" color={C.ink} />
            <Path path={w} style="stroke" strokeWidth={13} strokeCap="round" color={C.whisker} />
          </Group>
        ))}
      </Group>
    </Group>
  );
}
