import { useMemo } from 'react';
import { BlurMask, Path, Skia } from '@shopify/react-native-skia';
import { interpolateColor, useDerivedValue } from 'react-native-reanimated';
import { clamp, rand } from './math';
import type { Layout, SceneValues } from './types';

/** 0 = noite do altar · 1 = tempestade da invocação · 2 = dragão presente (verde/dourado) */
const mood = (S: SceneValues) => {
  'worklet';
  return clamp(S.summon.value * 0.9 + S.appear.value * 1.1, 0, 2);
};

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
