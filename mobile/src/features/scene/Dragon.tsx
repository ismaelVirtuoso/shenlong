import { useMemo } from 'react';
import {
  BlurMask, Circle, Group, LinearGradient, Oval, Path, RadialGradient, RoundedRect, Skia, vec,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { clamp, lerp, rand, smooth } from './math';
import type { Layout, SceneValues } from './types';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** SVG de meia-forma (metade direita, x ≥ 0) → espelha em x. Só comandos absolutos M L C Q Z. */
function mirror(d: string): string {
  return d.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_, x: string, y: string) => `${-parseFloat(x)},${y}`);
}
const both = (d: string) => {
  const p = Skia.Path.MakeFromSVGString(d)!;
  const m = Skia.Path.MakeFromSVGString(mirror(d))!;
  return { r: p, l: m };
};

// ── formas estáticas do rosto (unidades: 1 = meia-largura da cabeça) ──
const HEAD = both('M-0.02,-1.0 C0.55,-1.0 1.0,-0.62 1.04,-0.1 C1.07,0.32 0.92,0.55 0.66,0.64 C0.5,0.78 0.28,0.86 -0.02,0.86 Z');
const JAW = both('M-0.02,0.6 L0.66,0.6 C0.64,0.98 0.36,1.3 -0.02,1.34 Z');
const HORN = both('M0.35,-0.78 C0.55,-1.25 0.85,-1.55 1.22,-1.9 C1.07,-1.45 1.0,-1.15 0.87,-0.8 Z');
const HORN2 = both('M0.78,-1.18 C0.95,-1.24 1.2,-1.28 1.5,-1.16 C1.22,-1.06 1.02,-1.02 0.86,-0.98 Z');
const BROW = both('M0.06,-0.22 C0.34,-0.44 0.7,-0.52 0.99,-0.34');
const BROW_HI = both('M0.1,-0.3 C0.36,-0.5 0.7,-0.57 0.97,-0.42');
const EYE = both('M0.16,0.02 Q0.45,-0.28 0.78,-0.22 Q0.52,0.14 0.16,0.02 Z');
const EYE_C = { x: 0.47, y: -0.08 };
const FANGS = (() => {
  const p = Skia.Path.Make();
  const xs = [0.16, 0.32, 0.5];
  const len = [0.14, 0.26, 0.15];
  xs.forEach((x, i) => {
    for (const sx of [1, -1]) {
      const edge = 0.86 - 0.45 * x * x;
      p.moveTo(sx * (x - 0.055), edge - 0.02);
      p.lineTo(sx * (x + 0.055), edge - 0.02);
      p.lineTo(sx * x, edge + len[i]!);
      p.close();
    }
  });
  return p;
})();
const RIDGE = Skia.Path.MakeFromSVGString('M0,-0.98 L0,-0.25')!;

// ── geometria do corpo (espinha) ──
function spine(v: number, t: number, L: Layout) {
  'worklet';
  const { W, H, cx, hy, Rh } = L;
  const top = hy + Rh * 0.5;
  const bottom = H * 1.06;
  const amp = W * 0.36 * smooth(0, 0.3, v);
  const ph = v * TAU * 1.3 - t * 0.0009;
  return {
    x: cx + amp * Math.sin(ph),
    y: top + v * (bottom - top) + amp * 0.1 * Math.cos(ph),
    ph,
  };
}

interface Geo {
  xs: number[];
  ys: number[];
  ws: number[];
  tx: number[];
  ty: number[];
  hx: number;
  hy: number;
  rot: number;
  scale: number;
  vis: number;
  jaw: number;
  blink: number;
  mouthEnv: number;
}

export function Dragon({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H, cx, hy, Rh } = L;
  const N = L.q.segments;

  const geo = useDerivedValue<Geo>(() => {
    const t = S.clock.value;
    const p = S.appear.value;
    const vh = 1 - p;
    const xs: number[] = [], ys: number[] = [], ws: number[] = [], tx: number[] = [], ty: number[] = [];
    for (let k = 0; k < N; k++) {
      const v = vh + (1 - vh) * (k / (N - 1));
      const a = spine(v, t, L);
      const b = spine(Math.min(1, v + 0.004), t, L);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      xs.push(a.x); ys.push(a.y);
      ws.push(Rh * (0.52 - 0.2 * v) * (0.9 + 0.14 * Math.cos(a.ph)));
      tx.push(dx / len); ty.push(dy / len);
    }
    // cabeça acompanha o início da espinha; vira para frente ao final da aparição
    const travel = clamp(Math.atan2(-tx[0]!, ty[0]!), -0.8, 0.8);
    const front = smooth(0.62, 1, p);
    const listenTilt = 0.1 * S.listen.value * Math.sin(t * 0.0009);
    const think = S.think.value;
    const rot = -travel * (1 - front) + listenTilt + think * 0.07 * Math.sin(t * 0.004) + S.poke.value * 0.12 * Math.sin(t * 0.03);
    const breathe = 1 + 0.012 * Math.sin(t * 0.0017) + 0.02 * S.speak.value * Math.abs(Math.sin(t * 0.008));
    const scale = Rh * lerp(0.7, 1, smooth(0, 0.8, p)) * breathe * (1 + 0.08 * S.wish.value + 0.04 * S.poke.value);
    const env = Math.abs(Math.sin(t * 0.0155)) * (0.6 + 0.4 * Math.sin(t * 0.0071 + 2));
    const jaw = 0.02 + S.speak.value * (0.08 + 0.32 * env) + 0.05 * S.poke.value + 0.08 * S.wish.value;
    const ph = (t / 1000) % 4.4;
    const blink = ph < 0.16 ? Math.abs(ph - 0.08) / 0.08 : 1;
    return {
      xs, ys, ws, tx, ty,
      hx: xs[0]!, hy: ys[0]! + (hy - spine(0, t, L).y) * front + Math.sin(t * 0.0011) * 5 * front,
      rot, scale, vis: smooth(0, 0.06, p), jaw, blink, mouthEnv: env,
    };
  });

  // ── corpo ──
  const bodyPath = useDerivedValue(() => {
    const g = geo.value;
    const p = Skia.Path.Make();
    for (let k = 0; k < N; k++) p.addCircle(g.xs[k]!, g.ys[k]!, g.ws[k]!);
    return p;
  });
  const ribs = useDerivedValue(() => {
    const g = geo.value;
    const p = Skia.Path.Make();
    for (let k = 2; k < N; k += 2) {
      const w = g.ws[k]!, x = g.xs[k]!, y = g.ys[k]!, tx = g.tx[k]!, ty = g.ty[k]!;
      const nx = -ty, ny = tx;
      p.moveTo(x - nx * w * 0.82, y - ny * w * 0.82);
      p.quadTo(x + tx * w * 0.38, y + ty * w * 0.38, x + nx * w * 0.82, y + ny * w * 0.82);
    }
    return p;
  });
  const rim = useDerivedValue(() => {
    const g = geo.value;
    const p = Skia.Path.Make();
    for (let k = 0; k < N; k++) {
      const w = g.ws[k]!;
      const x = g.xs[k]! - g.ty[k]! * w * 0.6, y = g.ys[k]! + g.tx[k]! * w * 0.6; // lado esquerdo (luz)
      if (k === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    return p;
  });
  const shade = useDerivedValue(() => {
    const g = geo.value;
    const p = Skia.Path.Make();
    for (let k = 0; k < N; k++) {
      const w = g.ws[k]!;
      const x = g.xs[k]! + g.ty[k]! * w * 0.72, y = g.ys[k]! - g.tx[k]! * w * 0.72; // lado direito (sombra)
      if (k === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    return p;
  });
  const spikes = useDerivedValue(() => {
    const g = geo.value;
    const t = S.clock.value / 1000;
    const p = Skia.Path.Make();
    for (let k = 1; k < N; k += 2) {
      const w = g.ws[k]!, tx = g.tx[k]!, ty = g.ty[k]!;
      const nx = -ty, ny = tx; // aponta p/ esquerda; espinhos ficam à direita (-n)
      const bx = g.xs[k]! - nx * w * 0.92, by = g.ys[k]! - ny * w * 0.92;
      const len = w * (0.55 + 0.3 * Math.sin(k * 0.9 + t * 3));
      const sway = Math.sin(k + t * 2.4) * w * 0.25;
      p.moveTo(bx - tx * w * 0.3, by - ty * w * 0.3);
      p.lineTo(bx - nx * len + tx * (sway + w * 0.45), by - ny * len + ty * (sway + w * 0.45));
      p.lineTo(bx + tx * w * 0.3, by + ty * w * 0.3);
      p.close();
    }
    return p;
  });

  // ── cabeça: partes animadas ──
  const headTransform = useDerivedValue(() => [
    { translateX: geo.value.hx }, { translateY: geo.value.hy }, { rotate: geo.value.rot }, { scale: geo.value.scale },
  ]);
  const vis = useDerivedValue(() => geo.value.vis);
  const awake = useDerivedValue(() => smooth(0.6, 1, S.appear.value));

  const mane = (scaleLen: number, thick: number, seed: number) =>
    useDerivedValue(() => {
      const t = S.clock.value / 1000;
      const p = Skia.Path.Make();
      const M = 17;
      for (let i = 0; i < M; i++) {
        const a = lerp(-218, 38, i / (M - 1)) * DEG;
        const bx = Math.cos(a) * 0.98, by = Math.sin(a) * 0.9;
        const len = (0.55 + 0.5 * rand(i + seed) + 0.1 * Math.sin(t * 3 + i * 1.3) + 0.12 * S.speak.value + 0.2 * S.wish.value) * scaleLen;
        const dir = a + 0.14 * Math.sin(t * 1.9 + i);
        const tipx = bx + Math.cos(dir) * len, tipy = by + Math.sin(dir) * len;
        const px = -Math.sin(a) * thick, py = Math.cos(a) * thick;
        p.moveTo(bx - px, by - py);
        p.quadTo(bx + Math.cos(dir) * len * 0.5 - px * 0.9 + Math.sin(dir) * 0.08, by + Math.sin(dir) * len * 0.5 - py * 0.9, tipx, tipy);
        p.quadTo(bx + Math.cos(dir) * len * 0.5 + px * 0.9, by + Math.sin(dir) * len * 0.5 + py * 0.9, bx + px, by + py);
        p.close();
      }
      return p;
    });
  const maneOuter = mane(1.0, 0.17, 3);
  const maneInner = mane(0.62, 0.11, 40);

  const whisker = (sx: number, row: number) =>
    useDerivedValue(() => {
      const t = S.clock.value / 1000;
      const w1 = Math.sin(t * 1.6 + row * 2 + sx) * 0.18;
      const w2 = Math.sin(t * 1.3 + row * 3 + 1) * 0.28;
      const w3 = Math.sin(t * 1.9 + row) * 0.3;
      const y0 = row === 0 ? 0.42 : 0.72;
      const p = Skia.Path.Make();
      p.moveTo(sx * 0.6, y0);
      p.cubicTo(sx * 1.2, y0 - 0.25 + w1, sx * 1.55, y0 + 0.55 + w2, sx * (1.95 + 0.1 * row), y0 + 0.32 + w3);
      return p;
    });
  const wk = [whisker(1, 0), whisker(-1, 0), whisker(1, 1), whisker(-1, 1)];

  const eyeT = useDerivedValue(() => {
    const open = clamp(geo.value.blink * lerp(1, 0.55, S.think.value) * (1 + 0.15 * S.listen.value), 0.05, 1.2);
    return [{ translateX: EYE_C.x }, { translateY: EYE_C.y }, { scaleY: open }, { translateX: -EYE_C.x }, { translateY: -EYE_C.y }];
  });
  const eyeTL = useDerivedValue(() => {
    const open = clamp(geo.value.blink * lerp(1, 0.55, S.think.value) * (1 + 0.15 * S.listen.value), 0.05, 1.2);
    return [{ translateX: -EYE_C.x }, { translateY: EYE_C.y }, { scaleY: open }, { translateX: EYE_C.x }, { translateY: -EYE_C.y }];
  });
  const eyeGlow = useDerivedValue(() => {
    const e = clamp(0.25 + 0.5 * S.appear.value + 0.45 * S.speak.value + 0.5 * S.wish.value - 0.15 * S.listen.value, 0, 1);
    return [`rgba(255,40,20,${(0.85 * e).toFixed(3)})`, `rgba(255,70,20,${(0.3 * e).toFixed(3)})`, 'rgba(255,60,20,0)'];
  });
  const pupilOff = useDerivedValue(() => Math.sin(S.clock.value / 1700) * 0.05 + S.listen.value * Math.sin(S.clock.value / 700) * 0.03);
  const jawT = useDerivedValue(() => [{ translateY: geo.value.jaw }]);
  const mouthH = useDerivedValue(() => 0.62 + geo.value.jaw * 1.1);

  // ── aura, anel de escuta, orbe de "pensando" ──
  const auraColors = useDerivedValue(() => {
    const e = awake.value;
    const s = 0.7 + 0.3 * S.speak.value + 0.5 * S.wish.value;
    return [`rgba(255,210,80,${(0.5 * e * Math.min(1, s)).toFixed(3)})`, `rgba(80,230,130,${(0.16 * e).toFixed(3)})`, 'rgba(40,200,100,0)'];
  });
  const auraC = useDerivedValue(() => vec(geo.value.hx, geo.value.hy));
  const listenR = useDerivedValue(() => Rh * (1.7 + S.mic.value * 0.35));
  const listenColor = useDerivedValue(() => `rgba(100,190,255,${(S.listen.value * (0.25 + 0.7 * S.mic.value)).toFixed(3)})`);
  const listenR2 = useDerivedValue(() => Rh * (2.0 + S.mic.value * 0.55));
  const listenColor2 = useDerivedValue(() => `rgba(100,190,255,${(S.listen.value * 0.35 * S.mic.value).toFixed(3)})`);
  const thinkPos = useDerivedValue(() => {
    const a = S.clock.value / 600;
    return vec(geo.value.hx + Math.cos(a) * Rh * 1.55, geo.value.hy + Math.sin(a) * Rh * 0.5 - Rh * 0.2);
  });
  const thinkOpacity = useDerivedValue(() => S.think.value);

  const bodyGrad = useMemo(() => ({ start: vec(0, hy), end: vec(0, H) }), [hy, H]);
  const bodyGlow = useDerivedValue(() => `rgba(255,205,80,${(0.28 * awake.value).toFixed(3)})`);

  return (
    <Group opacity={vis}>
      <Circle c={auraC} r={Rh * 3.4}>
        <RadialGradient c={auraC} r={Rh * 3.4} colors={auraColors} positions={[0, 0.45, 1]} />
      </Circle>
      {L.q.blur && (
        <Path path={bodyPath} color={bodyGlow}>
          <BlurMask blur={26} style="normal" />
        </Path>
      )}
      <Path path={spikes}>
        <LinearGradient start={vec(0, hy)} end={vec(W, H)} colors={['#ffe066', '#ff9a2a', '#e0471a']} />
      </Path>
      <Path path={bodyPath}>
        <LinearGradient start={bodyGrad.start} end={bodyGrad.end} colors={['#2fb356', '#177a36', '#0b4a22']} />
      </Path>
      <Path path={shade} style="stroke" strokeWidth={Rh * 0.2} strokeCap="round" strokeJoin="round" color="rgba(0,25,10,0.35)">
        {L.q.blur && <BlurMask blur={6} style="normal" />}
      </Path>
      <Path path={ribs} style="stroke" strokeWidth={2} strokeCap="round" color="rgba(200,255,150,0.30)" />
      <Path path={rim} style="stroke" strokeWidth={Rh * 0.075} strokeCap="round" strokeJoin="round" color="rgba(215,255,185,0.42)">
        {L.q.blur && <BlurMask blur={2.5} style="normal" />}
      </Path>

      {/* ── cabeça (espaço unitário) ── */}
      <Group transform={headTransform}>
        <Path path={maneOuter}>
          <RadialGradient c={vec(0, 0)} r={2} colors={['#ffcf3a', '#ff7a1c', '#b3280c']} positions={[0.35, 0.65, 1]} />
        </Path>
        <Path path={maneInner}>
          <RadialGradient c={vec(0, 0)} r={1.5} colors={['#fff2a0', '#ffc02e', '#ff7a1c']} positions={[0.4, 0.7, 1]} />
        </Path>
        {[HORN, HORN2].map((h, i) => (
          <Group key={i}>
            <Path path={h.r}>
              <LinearGradient start={vec(0.4, -0.8)} end={vec(1.3, -1.9)} colors={['#b8802a', '#f3d27a', '#fff6d0']} />
            </Path>
            <Path path={h.l}>
              <LinearGradient start={vec(-0.4, -0.8)} end={vec(-1.3, -1.9)} colors={['#b8802a', '#f3d27a', '#fff6d0']} />
            </Path>
          </Group>
        ))}
        {wk.map((w, i) => (
          <Group key={i}>
            <Path path={w} style="stroke" strokeWidth={0.16} strokeCap="round" color="rgba(255,160,40,0.35)">
              {L.q.blur && <BlurMask blur={0.08} style="normal" />}
            </Path>
            <Path path={w} style="stroke" strokeWidth={0.065} strokeCap="round" color="#f2cf5a" />
          </Group>
        ))}

        {/* interior da boca + mandíbula */}
        <RoundedRect x={-0.62} y={0.58} width={1.24} height={mouthH} r={0.2}>
          <LinearGradient start={vec(0, 0.6)} end={vec(0, 1.3)} colors={['#14040a', '#7a1428']} />
        </RoundedRect>
        <Group transform={jawT}>
          <Path path={JAW.r}>
            <LinearGradient start={vec(0, 0.6)} end={vec(0, 1.34)} colors={['#1f8a40', '#0d4d23']} />
          </Path>
          <Path path={JAW.l}>
            <LinearGradient start={vec(0, 0.6)} end={vec(0, 1.34)} colors={['#1f8a40', '#0d4d23']} />
          </Path>
        </Group>

        {/* crânio + focinho */}
        {[HEAD.r, HEAD.l].map((h, i) => (
          <Path key={i} path={h}>
            <RadialGradient c={vec(0, -0.35)} r={1.35} colors={['#58d472', '#2aa24c', '#146e2d', '#0a3d1b']} positions={[0, 0.35, 0.75, 1]} />
          </Path>
        ))}
        <Oval x={-0.42} y={0.26} width={0.84} height={0.66}>
          <RadialGradient c={vec(0, 0.5)} r={0.5} colors={['rgba(150,245,150,0.5)', 'rgba(150,245,150,0)']} />
        </Oval>
        <Path path={RIDGE} style="stroke" strokeWidth={0.05} color="rgba(10,80,30,0.55)" strokeCap="round" />
        <Oval x={-0.25} y={0.62} width={0.15} height={0.1} color="#052a10" />
        <Oval x={0.1} y={0.62} width={0.15} height={0.1} color="#052a10" />
        {[BROW, BROW_HI].map((b, i) => (
          <Group key={i}>
            <Path path={b.r} style="stroke" strokeWidth={i === 0 ? 0.15 : 0.035} strokeCap="round" color={i === 0 ? '#0a4520' : '#7aea96'} />
            <Path path={b.l} style="stroke" strokeWidth={i === 0 ? 0.15 : 0.035} strokeCap="round" color={i === 0 ? '#0a4520' : '#7aea96'} />
          </Group>
        ))}

        {/* olhos */}
        <Circle cx={EYE_C.x} cy={EYE_C.y} r={0.55}>
          <RadialGradient c={vec(EYE_C.x, EYE_C.y)} r={0.55} colors={eyeGlow} positions={[0, 0.4, 1]} />
        </Circle>
        <Circle cx={-EYE_C.x} cy={EYE_C.y} r={0.55}>
          <RadialGradient c={vec(-EYE_C.x, EYE_C.y)} r={0.55} colors={eyeGlow} positions={[0, 0.4, 1]} />
        </Circle>
        <Group transform={eyeT}>
          <Path path={EYE.r}>
            <RadialGradient c={vec(EYE_C.x, EYE_C.y)} r={0.36} colors={['#fff4a8', '#ff3b1c', '#8e0808']} positions={[0, 0.45, 1]} />
          </Path>
          <Oval x={EYE_C.x - 0.03 + 0} y={EYE_C.y - 0.1} width={0.06} height={0.2} color="#0a0000" />
        </Group>
        <Group transform={eyeTL}>
          <Path path={EYE.l}>
            <RadialGradient c={vec(-EYE_C.x, EYE_C.y)} r={0.36} colors={['#fff4a8', '#ff3b1c', '#8e0808']} positions={[0, 0.45, 1]} />
          </Path>
          <Oval x={-EYE_C.x - 0.03} y={EYE_C.y - 0.1} width={0.06} height={0.2} color="#0a0000" />
        </Group>

        <Path path={FANGS} color="#f6f0d8" />
      </Group>

      {/* anel azul: Shenlong ouve a voz */}
      <Circle c={auraC} r={listenR} style="stroke" strokeWidth={3} color={listenColor}>
        {L.q.blur && <BlurMask blur={5} style="normal" />}
      </Circle>
      <Circle c={auraC} r={listenR2} style="stroke" strokeWidth={2} color={listenColor2} />
      {/* orbe de energia: Shenlong pensa */}
      <Group opacity={thinkOpacity}>
        <Circle c={thinkPos} r={Rh * 0.28}>
          <RadialGradient c={thinkPos} r={Rh * 0.28} colors={['#ffffff', '#ffd23a', 'rgba(255,150,30,0)']} />
        </Circle>
      </Group>
    </Group>
  );
}
