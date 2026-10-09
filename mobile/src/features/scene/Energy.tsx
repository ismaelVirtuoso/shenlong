import { useMemo } from 'react';
import { BlurMask, Circle, Fill, Group, LinearGradient, Oval, Path, Points, RadialGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { clamp, rand, smooth } from './math';
import type { Layout, SceneValues } from './types';

const TAU = Math.PI * 2;

/** 0..1: força do pilar de luz (sobe com a invocação, some quando o dragão está formado) */
const pillar = (S: SceneValues) => {
  'worklet';
  return smooth(0.3, 0.92, S.summon.value) * (1 - smooth(0.15, 0.85, S.appear.value));
};

export function Pillar({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H, cx, altarY } = L;

  // ── pilar ──
  const pillarW = useDerivedValue(() => W * (0.05 + 0.2 * pillar(S)));
  const pillarX = useDerivedValue(() => cx - pillarW.value / 2);
  const pillarOpacity = useDerivedValue(() => clamp(pillar(S) * 1.2, 0, 1));
  const coreW = useDerivedValue(() => pillarW.value * 0.32);
  const coreX = useDerivedValue(() => cx - coreW.value / 2);

  // ── hélices douradas girando em volta do pilar ──
  const STRANDS = 3;
  const PER = L.q.blur ? 34 : 20;
  const helix = useDerivedValue(() => {
    const t = S.clock.value / 1000;
    const pts: { x: number; y: number }[] = [];
    const amp = W * (0.1 + 0.1 * smooth(0.4, 1, S.summon.value));
    for (let s = 0; s < STRANDS; s++) {
      for (let k = 0; k < PER; k++) {
        const u = k / (PER - 1);
        const y = altarY - u * (altarY - H * 0.04);
        const a = u * 9 + t * 3.2 + (s * TAU) / STRANDS;
        pts.push({ x: cx + Math.sin(a) * amp * (0.35 + 0.65 * Math.sin(u * Math.PI)), y });
      }
    }
    return pts;
  });
  const helixOpacity = useDerivedValue(() => clamp(pillar(S) * 1.3, 0, 1));

  // ── ondas de energia subindo do altar ──
  const ring = (k: number) =>
    useDerivedValue(() => {
      const p = (S.clock.value / 2200 + k / 3) % 1;
      const rw = W * (0.1 + 0.55 * p);
      return { x: cx - rw, y: altarY - rw * 0.2 - p * H * 0.18, w: rw * 2, h: rw * 0.4, a: (1 - p) * clamp(S.summon.value * 1.4, 0, 1) * (1 - smooth(0.1, 0.6, S.appear.value)) };
    });
  const r0 = ring(0), r1 = ring(1), r2 = ring(2);

  return (
    <>
      {/* brilho de chão sob o pilar */}
      <Group opacity={pillarOpacity}>
        <Rect x={pillarX} y={0} width={pillarW} height={altarY + 20}>
          <LinearGradient start={vec(cx - W * 0.12, 0)} end={vec(cx + W * 0.12, 0)} colors={['rgba(255,200,80,0)', 'rgba(255,225,120,0.8)', 'rgba(255,255,235,0.95)', 'rgba(255,225,120,0.8)', 'rgba(255,200,80,0)']} />
          {L.q.blur && <BlurMask blur={18} style="normal" />}
        </Rect>
        <Rect x={coreX} y={0} width={coreW} height={altarY + 10} color="rgba(255,255,255,0.95)">
          {L.q.blur && <BlurMask blur={6} style="normal" />}
        </Rect>
      </Group>
      <Group opacity={helixOpacity}>
        <Points points={helix} mode="points" color="rgba(255,215,100,0.95)" style="stroke" strokeWidth={6} strokeCap="round">
          {L.q.blur && <BlurMask blur={3} style="solid" />}
        </Points>
      </Group>
      {[r0, r1, r2].map((r, i) => (
        <RingOval key={i} r={r} />
      ))}
    </>
  );
}

/** Brasas subindo (sempre presentes; mais intensas com energia). */
export function Embers({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H } = L;
  // ── brasas: sobem sempre; mais intensas com energia ──
  const N = L.q.particles;
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ x: rand(i + 1), y: rand(i + 200), sp: 0.015 + rand(i + 400) * 0.05, sw: 0.5 + rand(i + 600) * 1.5, ph: rand(i + 800) * 6 })), [N]);
  const energy = (): number => {
    'worklet';
    return clamp(Math.max(0.28 + S.glow.value * 0.4, S.summon.value * (1 - S.appear.value) * 1.1, S.appear.value * 0.6, S.wish.value), 0, 1);
  };
  const embersA = useDerivedValue(() => {
    const t = S.clock.value / 1000;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < seeds.length; i += 2) {
      const s = seeds[i]!;
      out.push({ x: s.x * W + Math.sin(t * s.sw + s.ph) * 22, y: H - (((s.y + t * s.sp) % 1) * H * 1.05) });
    }
    return out;
  });
  const embersB = useDerivedValue(() => {
    const t = S.clock.value / 1000;
    const out: { x: number; y: number }[] = [];
    for (let i = 1; i < seeds.length; i += 2) {
      const s = seeds[i]!;
      out.push({ x: s.x * W + Math.sin(t * s.sw + s.ph) * 30, y: H - (((s.y + t * s.sp * 1.4) % 1) * H * 1.05) });
    }
    return out;
  });
  const emberOpacity = useDerivedValue(() => 0.25 + 0.75 * energy());

  return (
    <>
      <Points points={embersA} mode="points" color="#ffd36b" style="stroke" strokeWidth={3.2} strokeCap="round" opacity={emberOpacity} />
      <Points points={embersB} mode="points" color="#ff9a3a" style="stroke" strokeWidth={5.5} strokeCap="round" opacity={emberOpacity} />
    </>
  );
}

/** Onda de choque dourada do desejo concedido (montada só durante o efeito). */
export function WishWave({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, cx } = L;
  // ── onda de choque do desejo concedido (sai da cabeça) ──
  const waveR = useDerivedValue(() => W * 0.15 + (1 - S.wish.value) * W * 1.1);
  const waveColor = useDerivedValue(() => `rgba(255,220,110,${(S.wish.value * 0.9).toFixed(3)})`);
  const waveW = useDerivedValue(() => 4 + S.wish.value * 10);

  return (
    <Circle cx={cx} cy={L.hy} r={waveR} style="stroke" strokeWidth={waveW} color={waveColor}>
      {L.q.blur && <BlurMask blur={6} style="normal" />}
    </Circle>
  );
}

function RingOval({ r }: { r: ReturnType<typeof useDerivedValue<{ x: number; y: number; w: number; h: number; a: number }>> }) {
  const x = useDerivedValue(() => r.value.x);
  const y = useDerivedValue(() => r.value.y);
  const w = useDerivedValue(() => r.value.w);
  const h = useDerivedValue(() => r.value.h);
  const o = useDerivedValue(() => r.value.a);
  return <Oval x={x} y={y} width={w} height={h} style="stroke" strokeWidth={3} color="rgba(255,215,110,1)" opacity={o} />;
}

/** Raio + flash de tela (montado só enquanto há relâmpago/desejo). */
export function Bolt({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H, cx } = L;
  const bolt = useDerivedValue(() => {
    const seed = S.boltSeed.value;
    const p = Skia.PathBuilder.Make();
    const side = rand(seed * 3.1) > 0.5 ? 1 : -1;
    let x = cx + side * (W * (0.15 + rand(seed) * 0.3));
    let y = -10;
    p.moveTo(x, y);
    const tx = cx + (rand(seed + 5) - 0.5) * W * 0.3;
    const ty = H * 0.62;
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      x = lerp2(x, tx, 0.18) + (rand(seed * 10 + i) - 0.5) * W * 0.16 * (1 - u * 0.5);
      y = u * ty;
      p.lineTo(x, y);
      if (i === 5 || i === 9) {
        // ramificação
        let bx = x, by = y;
        p.moveTo(bx, by);
        for (let j = 1; j <= 4; j++) {
          bx += (rand(seed * 20 + i * 7 + j) - 0.3) * W * 0.12 * side;
          by += H * 0.045;
          p.lineTo(bx, by);
        }
        p.moveTo(x, y);
      }
    }
    return p.build();
  });
  const boltOpacity = useDerivedValue(() => clamp(S.flash.value * 1.4, 0, 1));
  const flashColor = useDerivedValue(() => `rgba(200,225,255,${(S.flash.value * 0.42).toFixed(3)})`);
  return (
    <>
      <Group opacity={boltOpacity}>
        <Path path={bolt} style="stroke" strokeWidth={10} color="rgba(150,190,255,0.55)" strokeJoin="round">
          {L.q.blur && <BlurMask blur={10} style="normal" />}
        </Path>
        <Path path={bolt} style="stroke" strokeWidth={3} color="#ffffff" strokeJoin="round" strokeCap="round" />
      </Group>
      <Fill color={flashColor} />
    </>
  );
}

const VIGNETTE = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.62)'];
/** Vinheta estática (escurece as bordas). */
export function Vignette({ L }: { L: Layout }) {
  const { W, H, cx } = L;
  return (
    <Rect x={0} y={0} width={W} height={H}>
      <RadialGradient c={vec(cx, H * 0.48)} r={H * 0.78} colors={VIGNETTE} positions={[0, 0.55, 1]} />
    </Rect>
  );
}

function lerp2(a: number, b: number, k: number) {
  'worklet';
  return a + (b - a) * k;
}
