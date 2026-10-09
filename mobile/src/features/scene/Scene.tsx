import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { Canvas, Group, useCanvasRef } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { PROFILES } from '@/core/quality';
import { Altar, Balls } from './Balls';
import { Dragon } from './Dragon';
import { Energy, Lightning } from './Energy';
import { useSceneValues } from './drive';
import { FrontClouds, Sky } from './Sky';
import { useSceneStore } from './bridge';
import type { Layout } from './types';

export function Scene() {
  const win = useWindowDimensions();
  const W = Platform.OS === 'web' ? Math.min(win.width, 440) : win.width; // web = só p/ depurar o visual
  const H = win.height;
  const quality = useSceneStore((s) => s.quality);
  const S = useSceneValues();
  const ref = useCanvasRef();

  const L: Layout = useMemo(() => {
    const Rh = Math.min(W * 0.25, H * 0.15);
    return { W, H, cx: W / 2, hy: H * 0.31, Rh, altarY: H * 0.7, q: PROFILES[quality] };
  }, [W, H, quality]);

  // tremor de câmera: cresce com a invocação e explode nos trovões
  const shake = useDerivedValue(() => {
    const t = S.clock.value;
    const ramp = S.summon.value > 0 && S.appear.value < 0.3 ? Math.pow(S.summon.value, 3) * 2.2 : 0;
    const a = ramp + S.shake.value * 9;
    return [{ translateX: Math.sin(t * 0.09) * a }, { translateY: Math.cos(t * 0.11) * a }];
  });

  return (
    <Canvas ref={ref} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }}>
      <Group transform={shake}>
        <Sky S={S} L={L} />
        <Altar S={S} L={L} />
        <Energy S={S} L={L} />
        <Dragon S={S} L={L} />
        <FrontClouds S={S} L={L} />
        <Balls S={S} L={L} />
      </Group>
      <Lightning S={S} L={L} />
    </Canvas>
  );
}
