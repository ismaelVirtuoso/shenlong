import { useMemo } from 'react';
import { BlurMask, LinearGradient, Path, Points, Rect, Skia, vec } from '@shopify/react-native-skia';
import { interpolateColor, useDerivedValue } from 'react-native-reanimated';
import { clamp, rand, smooth } from './math';
import type { Layout, SceneValues } from './types';

/** 0 = noite do altar · 1 = tempestade da invocação · 2 = dragão presente (verde/dourado) */
const mood = (S: SceneValues) => {
  'worklet';
  return clamp(S.summon.value * 0.9 + S.appear.value * 1.1, 0, 2);
};

export function Sky({ S, L }: { S: SceneValues; L: Layout }) {
  const colors = useDerivedValue(() => {
    const m = mood(S);
    return [
      interpolateColor(m, [0, 1, 2], ['#02030a', '#05071c', '#03150f']),
      interpolateColor(m, [0, 1, 2], ['#080d2a', '#16215f', '#0c3d2d']),
      interpolateColor(m, [0, 1, 2], ['#1d0f1e', '#4d2412', '#946016']),
    ];
  });

  const stars = useMemo(
    () => Array.from({ length: 70 }, (_, i) => vec(rand(i + 1) * L.W, rand(i + 99) * L.H * 0.62)),
    [L.W, L.H],
  );
  const starOpacity = useDerivedValue(() => {
    const tw = 0.65 + 0.35 * Math.sin(S.clock.value / 700);
    return tw * (1 - smooth(0.4, 1.3, mood(S))) * 0.9;
  });

  // nuvens do fundo: um único Path de círculos, com blur
  const back = useMemo(
    () => Array.from({ length: L.q.clouds }, (_, i) => ({ x: rand(i + 7), y: 0.1 + rand(i + 21) * 0.5, r: 0.16 + rand(i + 33) * 0.16, sp: 0.00005 + rand(i + 5) * 0.0001, ph: rand(i) * 6 })),
    [L.q.clouds],
  );
  const backPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const t = S.clock.value;
    for (const c of back) {
      const x = c.x * L.W + Math.sin(t * c.sp + c.ph) * L.W * 0.12;
      p.addCircle(x, c.y * L.H, c.r * L.W);
    }
    return p;
  });
  const backColor = useDerivedValue(() =>
    interpolateColor(mood(S), [0, 1, 2], ['#10143a', '#2a2f78', '#1d5a46']),
  );
  const backOpacity = useDerivedValue(() => 0.25 + 0.3 * smooth(0, 1, mood(S)));

  return (
    <>
      <Rect x={0} y={0} width={L.W} height={L.H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, L.H)} colors={colors} positions={[0, 0.55, 1]} />
      </Rect>
      <Points points={stars} mode="points" color="#ffffff" style="stroke" strokeWidth={2} strokeCap="round" opacity={starOpacity} />
      <Path path={backPath} color={backColor} opacity={backOpacity}>
        {L.q.blur && <BlurMask blur={48} style="normal" />}
      </Path>
    </>
  );
}

/** Nuvens da frente (base da tela): escondem a raiz do dragão e brilham dourado por baixo. */
export function FrontClouds({ S, L }: { S: SceneValues; L: Layout }) {
  const blobs = useMemo(
    () => Array.from({ length: Math.max(4, L.q.clouds) }, (_, i) => ({ x: (i + 0.5) / Math.max(4, L.q.clouds), r: 0.2 + rand(i + 50) * 0.12, sp: 0.00008 + rand(i + 60) * 0.00012, ph: rand(i + 70) * 6 })),
    [L.q.clouds],
  );
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const t = S.clock.value;
    for (const c of blobs) p.addCircle(c.x * L.W + Math.sin(t * c.sp + c.ph) * L.W * 0.07, L.H * 1.0 + Math.cos(t * c.sp * 1.3 + c.ph) * 12, c.r * L.W);
    return p;
  });
  const color = useDerivedValue(() => interpolateColor(mood(S), [0, 1, 2], ['#1a1530', '#3a2a55', '#55391a']));
  const rim = useDerivedValue(() => {
    const e = 0.15 + 0.5 * S.glow.value * (1 - S.appear.value) + 0.55 * S.appear.value;
    return `rgba(255,170,60,${(0.55 * e).toFixed(3)})`;
  });
  return (
    <>
      <Path path={path} color={rim} transform={[{ translateY: -14 }]}>
        {L.q.blur && <BlurMask blur={26} style="normal" />}
      </Path>
      <Path path={path} color={color} opacity={0.95}>
        {L.q.blur && <BlurMask blur={16} style="normal" />}
      </Path>
    </>
  );
}
