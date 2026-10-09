import { useMemo } from 'react';
import { Circle, LinearGradient, Points, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { interpolateColor, useDerivedValue } from 'react-native-reanimated';
import { clamp, rand, smooth } from './math';
import type { Layout, SceneValues } from './types';

/** 0 = noite do altar · 1 = tempestade da invocação · 2 = Shenlong presente (luz verde) */
const mood = (S: SceneValues) => {
  'worklet';
  return clamp(S.summon.value * 0.9 + S.appear.value * 1.1, 0, 2);
};

/** Céu estilo anime: noite → tempestade → o brilho verde-limão do dragão tomando o céu. */
export function Backdrop({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H } = L;
  const colors = useDerivedValue(() => {
    const m = mood(S);
    return [
      interpolateColor(m, [0, 1, 2], ['#03040c', '#070a1e', '#0b2a10']),
      interpolateColor(m, [0, 1, 2], ['#0a1030', '#1a2460', '#1e5a1c']),
      interpolateColor(m, [0, 1, 2], ['#1c1430', '#3a2a50', '#2e4e2a']),
    ];
  });
  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => vec(rand(i + 1) * W, rand(i + 99) * H * 0.62)), [W, H]);
  const starOpacity = useDerivedValue(() => (0.65 + 0.35 * Math.sin(S.clock.value / 700)) * (1 - smooth(0.4, 1.3, mood(S))));
  // brilho do dragão: verde-limão intenso atrás da cabeça e do corpo (como na referência)
  const glowColors = useDerivedValue(() => {
    const a = S.appear.value;
    const e = clamp(0.25 * S.summon.value * (1 - a) + 0.9 * smooth(0.4, 1, a) + 0.3 * S.wish.value + 0.06 * Math.sin(S.clock.value / 700), 0, 1);
    return [`rgba(220,255,90,${(0.95 * e).toFixed(3)})`, `rgba(150,230,50,${(0.6 * e).toFixed(3)})`, `rgba(40,120,20,${(0.25 * e).toFixed(3)})`, 'rgba(10,40,10,0)'];
  });
  return (
    <>
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={colors} positions={[0, 0.55, 1]} />
      </Rect>
      <Points points={stars} mode="points" color="#ffffff" style="stroke" strokeWidth={2} strokeCap="round" opacity={starOpacity} />
      <Circle cx={W * 0.5} cy={H * 0.34} r={W * 1.05}>
        <RadialGradient c={vec(W * 0.5, H * 0.34)} r={W * 1.05} colors={glowColors} positions={[0, 0.3, 0.65, 1]} />
      </Circle>
    </>
  );
}
