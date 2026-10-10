import { useMemo } from 'react';
import { BlurMask, Circle, Fill, Group, LinearGradient, Oval, Path, Points, RadialGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { RELEASE } from './bridge';
import { clamp, rand, smooth } from './math';
import { tailAnchor } from './anchor';
import { launchPoint, launchU, releaseCenter } from './release';
import type { Layout, SceneValues } from './types';

const TAU = Math.PI * 2;

/** 0..1: força do pilar de luz (sobe com a invocação, some quando o dragão está formado) */
const pillar = (S: SceneValues) => {
  'worklet';
  return smooth(0.3, 0.92, S.summon.value) * (1 - smooth(0.15, 0.85, S.appear.value));
};

/** O pilar nasce das esferas unidas (onde o dragão vai surgir, ver anchor.ts). */
export function Pillar({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H, cx } = L;
  const baseY = useDerivedValue(() => tailAnchor.value.y * H);

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
        const y = baseY.value - u * (baseY.value - H * 0.04);
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
      return { x: cx - rw, y: baseY.value - rw * 0.2 - p * H * 0.18, w: rw * 2, h: rw * 0.4, a: (1 - p) * clamp(S.summon.value * 1.4, 0, 1) * (1 - smooth(0.1, 0.6, S.appear.value)) };
    });
  const r0 = ring(0), r1 = ring(1), r2 = ring(2);
  const pillarH = useDerivedValue(() => baseY.value + 20);
  const coreH = useDerivedValue(() => baseY.value + 10);

  return (
    <>
      {/* brilho de chão sob o pilar */}
      <Group opacity={pillarOpacity}>
        <Rect x={pillarX} y={0} width={pillarW} height={pillarH}>
          <LinearGradient start={vec(cx - W * 0.12, 0)} end={vec(cx + W * 0.12, 0)} colors={['rgba(255,200,80,0)', 'rgba(255,225,120,0.8)', 'rgba(255,255,235,0.95)', 'rgba(255,225,120,0.8)', 'rgba(255,200,80,0)']} />
          {L.q.blur && <BlurMask blur={18} style="normal" />}
        </Rect>
        <Rect x={coreX} y={0} width={coreW} height={coreH} color="rgba(255,255,255,0.95)">
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

/**
 * Saída após o desejo (montada só nela): aura dourada enquanto o dragão vira ouro, clarão quando
 * ele vira as esferas, o brilho único da fusão e um rastro de luz para cada esfera lançada.
 */
export function Release({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H } = L;
  const c = releaseCenter(L);
  const aura = useDerivedValue(() => {
    const f = S.release.value;
    return smooth(0, RELEASE.gold, f) * (1 - smooth(RELEASE.burst, RELEASE.burst + 0.08, f));
  });
  const auraColors = useDerivedValue(() => [`rgba(255,200,80,${(0.45 * aura.value).toFixed(3)})`, 'rgba(255,150,30,0)']);
  const flashColor = useDerivedValue(() => {
    const f = S.release.value;
    const k = smooth(RELEASE.burst - 0.05, RELEASE.burst, f) * (1 - smooth(RELEASE.burst, RELEASE.burst + 0.1, f));
    return `rgba(255,236,170,${(0.92 * k).toFixed(3)})`;
  });
  // o brilho único: nasce quando as esferas se fundem e pulsa antes de lançá-las
  const orb = useDerivedValue(() => {
    const f = S.release.value;
    return smooth(RELEASE.merge, RELEASE.launch - 0.02, f) * (1 - smooth(RELEASE.launch + 0.02, RELEASE.launch + 0.12, f));
  });
  const orbR = useDerivedValue(() => W * (0.06 + 0.26 * orb.value) * (1 + 0.08 * Math.sin(S.clock.value / 70)));
  const orbColors = useDerivedValue(() => {
    const a = orb.value;
    return [`rgba(255,255,240,${a.toFixed(3)})`, `rgba(255,214,90,${(0.85 * a).toFixed(3)})`, 'rgba(255,140,20,0)'];
  });
  return (
    <>
      <Circle cx={c.x} cy={c.y} r={H * 0.5}>
        <RadialGradient c={vec(c.x, c.y)} r={H * 0.5} colors={auraColors} />
      </Circle>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Trail key={i} i={i} S={S} L={L} />
      ))}
      <Circle cx={c.x} cy={c.y} r={orbR}>
        <RadialGradient c={vec(c.x, c.y)} r={orbR} colors={orbColors} positions={[0, 0.35, 1]} />
      </Circle>
      <Fill color={flashColor} />
    </>
  );
}

/**
 * Brilho dourado intenso das sete esferas unidas na ponta da cauda: acende quando elas se juntam
 * na invocação e some quando são absorvidas na saída dourada.
 */
export function TailGlow({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H } = L;
  const k = useDerivedValue(() => {
    const pulse = 0.88 + 0.12 * Math.sin(S.clock.value / 260) + 0.25 * S.wish.value;
    return smooth(0.8, 1, S.summon.value) * (1 - smooth(0.04, RELEASE.burst, S.release.value)) * pulse;
  });
  const c = useDerivedValue(() => vec(tailAnchor.value.x * W, tailAnchor.value.y * H));
  const haloR = useDerivedValue(() => W * (0.4 + 0.05 * k.value));
  const haloColors = useDerivedValue(() => {
    const a = clamp(k.value, 0, 1.2);
    return [`rgba(255,244,200,${(0.95 * a).toFixed(3)})`, `rgba(255,200,70,${(0.7 * a).toFixed(3)})`, `rgba(255,150,30,${(0.28 * a).toFixed(3)})`, 'rgba(255,120,0,0)'];
  });
  const coreColors = useDerivedValue(() => {
    const a = clamp(k.value, 0, 1);
    return [`rgba(255,255,245,${(0.95 * a).toFixed(3)})`, `rgba(255,230,140,${(0.6 * a).toFixed(3)})`, 'rgba(255,200,80,0)'];
  });
  const flareW = useDerivedValue(() => W * (0.55 + 0.1 * k.value));
  const flareX = useDerivedValue(() => tailAnchor.value.x * W - flareW.value / 2);
  const flareY = useDerivedValue(() => tailAnchor.value.y * H - 3);
  const flareOpacity = useDerivedValue(() => 0.85 * clamp(k.value, 0, 1));
  return (
    <>
      <Group blendMode="plus">
        <Circle c={c} r={haloR}>
          <RadialGradient c={c} r={haloR} colors={haloColors} positions={[0, 0.14, 0.42, 1]} />
        </Circle>
        <Circle c={c} r={W * 0.15}>
          <RadialGradient c={c} r={W * 0.15} colors={coreColors} />
        </Circle>
        <Oval x={flareX} y={flareY} width={flareW} height={6} color="rgba(255,236,170,1)" opacity={flareOpacity}>
          {L.q.blur && <BlurMask blur={4} style="normal" />}
        </Oval>
      </Group>
    </>
  );
}

const TRAIL_SAMPLES = 14;
/** Rastro de luz da esfera i: arco do centro até onde ela está, afinando e sumindo na cauda. */
function Trail({ i, S, L }: { i: number; S: SceneValues; L: Layout }) {
  const path = useDerivedValue(() => {
    const p = Skia.PathBuilder.Make();
    const f = S.release.value;
    const u = launchU(i, f);
    if (u <= 0) return p.build();
    const u0 = Math.max(0, u - 0.4);
    for (let k = 0; k <= TRAIL_SAMPLES; k++) {
      const q = launchPoint(i, u0 + ((u - u0) * k) / TRAIL_SAMPLES, S.seed.value, L);
      if (k) p.lineTo(q.x, q.y);
      else p.moveTo(q.x, q.y);
    }
    return p.build();
  });
  const opacity = useDerivedValue(() => {
    const u = launchU(i, S.release.value);
    return u > 0 ? 1 - smooth(0.75, 1, u) : 0;
  });
  return (
    <Group opacity={opacity}>
      <Path path={path} style="stroke" strokeWidth={16} strokeCap="round" color="rgba(255,170,40,0.35)">
        {L.q.blur && <BlurMask blur={8} style="normal" />}
      </Path>
      <Path path={path} style="stroke" strokeWidth={5} strokeCap="round" color="rgba(255,226,130,0.95)" />
      <Path path={path} style="stroke" strokeWidth={1.6} strokeCap="round" color="#fffbe8" />
    </Group>
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
