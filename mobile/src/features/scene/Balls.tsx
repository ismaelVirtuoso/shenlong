import { useMemo } from 'react';
import { Circle, Group, LinearGradient, Oval, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { RELEASE } from './bridge';
import { clamp, lerp, smooth } from './math';
import { tailAnchor } from './anchor';
import { launchPoint, launchU, releaseCenter, spinAngle } from './release';
import { starCenters, starOutline } from './stars';
import type { Layout, SceneValues } from './types';

const TAU = Math.PI * 2;

function starsPath(n: number) {
  const p = Skia.PathBuilder.Make();
  for (const c of starCenters(n)) {
    starOutline(c.x, c.y).forEach(([x, y], k) => (k ? p.lineTo(x, y) : p.moveTo(x, y)));
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

/**
 * Saída após o desejo: as esferas da ponta da cauda são absorvidas pela luz dourada do dragão, renascem
 * do clarão girando no centro, se fundem num único brilho e são lançadas pelo planeta.
 */
function releasePose(i: number, f: number, rest: Pose, seed: number, L: Layout): Pose {
  'worklet';
  const rb = L.W * 0.075;
  const c = releaseCenter(L);
  if (f < RELEASE.burst) {
    const k = smooth(0.04, RELEASE.burst, f);
    return { x: lerp(rest.x, c.x, k * k), y: lerp(rest.y, c.y, k * k), s: rest.s * (1 - 0.6 * k), a: rest.a * (1 - smooth(0.12, RELEASE.burst, f)) };
  }
  if (f < RELEASE.launch) {
    const grow = smooth(RELEASE.burst, RELEASE.burst + 0.07, f);
    const fuse = smooth(RELEASE.merge - 0.04, RELEASE.launch - 0.02, f);
    const R = L.W * 0.26 * grow * (1 - fuse);
    const a = spinAngle(i, f);
    const depth = Math.sin(a);
    return {
      x: c.x + Math.cos(a) * R,
      y: c.y + depth * R * 0.42,
      s: rb * (0.72 + 0.2 * depth) * grow * (1 - 0.7 * fuse),
      a: 1 - fuse,
    };
  }
  const u = launchU(i, f);
  const p = launchPoint(i, u, seed, L);
  return { x: p.x, y: p.y, s: rb * lerp(0.55, 0.12, u), a: smooth(RELEASE.launch, RELEASE.launch + 0.02, f) * (1 - smooth(0.85, 1, u)) };
}

/** Pose da esfera i em função do estágio (altar → órbita → unidas na ponta da cauda). */
function pose(i: number, t: number, S: SceneValues, L: Layout): Pose {
  'worklet';
  const { W, H, cx, altarY } = L;
  const rb = W * 0.075;
  const intro = S.intro.value;
  const summon = S.summon.value;

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

  // ÓRBITA, depois se unem onde o dragão vai nascer (a ponta da cauda, ver anchor.ts)
  const anchor = tailAnchor.value;
  const gx = anchor.x * W;
  const gy = anchor.y * H;
  const s1 = smooth(0, 0.42, summon);
  const s2 = smooth(0.52, 0.97, summon);
  const spin = t * 0.001 * (1.2 + 7 * summon * summon);
  const th = (i * TAU) / 7 + spin;
  const orbR = W * 0.34 * (1 - s2 * 0.9);
  const ocx = lerp(cx, gx, s2);
  const ocy = lerp(H * 0.5, gy, s2);
  const ox = ocx + Math.cos(th) * orbR;
  const oy = ocy + Math.sin(th) * orbR * 0.38 - s1 * 10 * (1 - s2);
  const oscl = lerp(1.05, 0.6, s2) * (0.92 + 0.12 * Math.sin(th));
  const sx = lerp(ax, ox, s1);
  const sy = lerp(ay, oy, s1);
  const ss = lerp(as, oscl, s1);

  // UNIDAS NA PONTA DA CAUDA (dragão presente): uma no centro e seis em volta, em perspectiva,
  // girando devagar dentro do brilho dourado
  const r = smooth(0.85, 1, summon);
  const ck = i === 0 ? -1 : i - 1;
  const cth = (ck * TAU) / 6 + t * 0.0004;
  const cr = ck < 0 ? 0 : rb * 0.72;
  const cdepth = ck < 0 ? 1 : Math.sin(cth);
  const bob = Math.sin(t * 0.0011 + i * 1.3) * 1.5;
  const x = lerp(sx, gx + Math.cos(cth) * cr, r);
  const y = lerp(sy, gy + Math.sin(cth) * cr * 0.42 + bob, r);
  const s = lerp(ss, 0.5 * (0.9 + 0.12 * cdepth), r);
  const a = 1;

  const f = S.release.value;
  if (f > 0) return releasePose(i, f, { x, y, s: s * rb, a }, S.seed.value, L);
  return { x, y, s: s * rb, a };
}

function Ball({ i, S, L }: { i: number; S: SceneValues; L: Layout }) {
  const stars = useMemo(() => starsPath(i + 1), [i]);
  const p = useDerivedValue(() => pose(i, S.clock.value, S, L));
  const transform = useDerivedValue(() => [{ translateX: p.value.x }, { translateY: p.value.y }, { scale: Math.max(0.001, p.value.s) }]);
  const opacity = useDerivedValue(() => p.value.a);
  const glowColors = useDerivedValue(() => {
    const e = clamp(0.28 + S.glow.value * 0.6 + S.summon.value * 0.3 + S.appear.value * 0.4 + S.wish.value * 0.5 + (S.release.value > 0 ? 0.6 : 0), 0, 1);
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
