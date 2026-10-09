import { useMemo } from 'react';
import { Circle, Group, LinearGradient, Oval, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { clamp, lerp, smooth } from './math';
import type { Layout, SceneValues } from './types';

const TAU = Math.PI * 2;

/** Posição das estrelas (unidades do raio da esfera) para N = 1..7 */
function starCenters(n: number): { x: number; y: number }[] {
  if (n === 1) return [{ x: 0, y: 0 }];
  const out: { x: number; y: number }[] = [];
  if (n === 7) out.push({ x: 0, y: 0 });
  const ring = n === 7 ? 6 : n;
  const rad = n === 2 ? 0.42 : n === 7 ? 0.52 : 0.46;
  const start = n === 3 ? -Math.PI / 2 : n === 5 ? -Math.PI / 2 : n === 4 ? Math.PI / 4 : 0;
  for (let k = 0; k < ring; k++) out.push({ x: Math.cos(start + (k * TAU) / ring) * rad, y: Math.sin(start + (k * TAU) / ring) * rad });
  return out;
}

function starsPath(n: number) {
  const p = Skia.PathBuilder.Make();
  const r = n === 1 ? 0.5 : n <= 3 ? 0.3 : n <= 5 ? 0.25 : 0.2;
  for (const c of starCenters(n)) {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? r : r * 0.42;
      const x = c.x + Math.cos(a) * rr;
      const y = c.y + Math.sin(a) * rr;
      if (k === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.close();
  }
  return p.build();
}

interface Pose {
  x: number;
  y: number;
  s: number;
  a: number;
}

/** Pose da esfera i em função do estágio (altar → órbita → pilar → anel de repouso). */
function pose(i: number, t: number, S: SceneValues, L: Layout): Pose {
  'worklet';
  const { W, H, cx, altarY } = L;
  const rb = W * 0.075;
  const intro = S.intro.value;
  const summon = S.summon.value;
  const appear = S.appear.value;

  // ALTAR: centro + 6 em elipse (perspectiva: as da frente maiores)
  const k = i === 0 ? -1 : i - 1;
  const ang = k < 0 ? 0 : (k * TAU) / 6 + 0.5;
  const rx = k < 0 ? 0 : W * 0.28;
  const ry = rx * 0.4;
  const depth = k < 0 ? 0 : Math.sin(ang);
  const float = Math.sin(t * 0.0012 + i * 1.7) * 6 + 4;
  const inK = smooth(i * 0.09, i * 0.09 + 0.4, intro);
  const ax = cx + Math.cos(ang) * rx;
  const ay = altarY - rb * 0.6 + Math.sin(ang) * ry - float - (1 - inK) * H * 0.25;
  const as = (0.9 + depth * 0.18) * inK;

  // ÓRBITA / COLAPSO NO PILAR
  const s1 = smooth(0, 0.42, summon);
  const s2 = smooth(0.52, 0.97, summon);
  const spin = t * 0.001 * (1.2 + 7 * summon * summon);
  const th = (i * TAU) / 7 + spin;
  const orbR = W * 0.34 * (1 - s2 * 0.95);
  const ocx = cx;
  const ocy = lerp(H * 0.5, H * 0.38, s2);
  const ox = ocx + Math.cos(th) * orbR;
  const oy = ocy + Math.sin(th) * orbR * 0.38 - s1 * 10;
  const oscl = lerp(1.05, 0.45, s2) * (0.92 + 0.12 * Math.sin(th));
  const sx = lerp(ax, ox, s1);
  const sy = lerp(ay, oy, s1);
  let ss = lerp(as, oscl, s1);
  let sa = 1 - smooth(0.96, 1, summon) * (1 - smooth(0, 0.2, appear));

  // ANEL DE REPOUSO (dragão presente)
  const r = smooth(0.35, 1, appear);
  const bth = (i * TAU) / 7 + t * 0.0006;
  const bx = cx + Math.cos(bth) * W * 0.33;
  const by = H * 0.8 + Math.sin(bth) * W * 0.07;
  const bs = 0.62 + 0.14 * Math.sin(bth);
  const x = lerp(sx, bx, r);
  const y = lerp(sy, by, r);
  ss = lerp(ss, bs, r);
  sa = Math.max(sa, smooth(0.3, 0.5, appear));
  return { x, y, s: ss * rb, a: clamp(sa, 0, 1) };
}

function Ball({ i, S, L }: { i: number; S: SceneValues; L: Layout }) {
  const stars = useMemo(() => starsPath(i + 1), [i]);
  const p = useDerivedValue(() => pose(i, S.clock.value, S, L));
  const transform = useDerivedValue(() => [{ translateX: p.value.x }, { translateY: p.value.y }, { scale: Math.max(0.001, p.value.s) }]);
  const opacity = useDerivedValue(() => p.value.a);
  const glowColors = useDerivedValue(() => {
    const e = clamp(0.28 + S.glow.value * 0.6 + S.summon.value * 0.3 + S.wish.value * 0.5, 0, 1);
    return [`rgba(255,180,50,${(0.75 * e).toFixed(3)})`, `rgba(255,120,20,${(0.28 * e).toFixed(3)})`, 'rgba(255,100,0,0)'];
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Circle cx={0} cy={0} r={2.6}>
        <RadialGradient c={vec(0, 0)} r={2.6} colors={glowColors} positions={[0, 0.4, 1]} />
      </Circle>
      <Circle cx={0} cy={0} r={1}>
        <RadialGradient c={vec(-0.35, -0.4)} r={1.5} colors={['#fff6cc', '#ffbf3a', '#e56d10', '#8e3006']} positions={[0, 0.3, 0.7, 1]} />
      </Circle>
      <Path path={stars} color="#cf1d17" opacity={0.95} />
      <Oval x={-0.62} y={-0.72} width={0.55} height={0.32} color="rgba(255,255,255,0.55)" />
    </Group>
  );
}

export function Balls({ S, L }: { S: SceneValues; L: Layout }) {
  return (
    <>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Ball key={i} i={i} S={S} L={L} />
      ))}
    </>
  );
}

/** Altar de pedra sob as esferas; some quando o dragão emerge. */
export function Altar({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, cx, altarY } = L;
  const opacity = useDerivedValue(() => (1 - smooth(0, 0.35, S.appear.value)) * smooth(0, 0.4, S.intro.value));
  const ringColor = useDerivedValue(() => {
    const e = clamp(0.3 + S.glow.value * 0.6 + S.summon.value * 0.5 + 0.15 * Math.sin(S.clock.value / 500), 0, 1);
    return `rgba(255,190,70,${e.toFixed(3)})`;
  });
  const floorGlow = useDerivedValue(() => {
    const e = clamp(0.25 + S.glow.value * 0.55 + S.summon.value * 0.45, 0, 1);
    return [`rgba(255,150,40,${(0.55 * e).toFixed(3)})`, 'rgba(255,100,20,0)'];
  });
  const rw = W * 0.5;
  return (
    <Group opacity={opacity}>
      <Oval x={cx - rw * 1.15} y={altarY - rw * 0.4} width={rw * 2.3} height={rw * 0.8}>
        <RadialGradient c={vec(cx, altarY)} r={rw * 1.15} colors={floorGlow} transform={[{ translateY: 0 }]} />
      </Oval>
      <Oval x={cx - rw} y={altarY - rw * 0.2} width={rw * 2} height={rw * 0.5}>
        <LinearGradient start={vec(0, altarY - rw * 0.2)} end={vec(0, altarY + rw * 0.3)} colors={['#4a4056', '#241d30', '#120e1a']} />
      </Oval>
      <Oval x={cx - rw * 0.9} y={altarY - rw * 0.15} width={rw * 1.8} height={rw * 0.42} style="stroke" strokeWidth={2.5} color={ringColor} />
      <Oval x={cx - rw * 0.62} y={altarY - rw * 0.085} width={rw * 1.24} height={rw * 0.27} style="stroke" strokeWidth={1.5} color={ringColor} opacity={0.6} />
    </Group>
  );
}
