import { useMemo } from 'react';
import { Group, Image, Oval, RadialGradient, vec } from '@shopify/react-native-skia';
import { PixelRatio } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { cloud, rockSpire, type Shape } from './art/landscape';
import { rasterize, recordShapes } from './art/record';
import { rand } from './math';
import type { Layout, SceneValues } from './types';

/**
 * Primeiro plano estilo anime: pilares de rocha com musgo, nuvens fofas à deriva e névoa.
 * Tudo estático gravado como SkPicture; por quadro só muda a translação (barato).
 */
export function Foreground({ S, L }: { S: SceneValues; L: Layout }) {
  const { W, H } = L;
  const pr = Math.min(2, PixelRatio.get());
  // texturas pré-renderizadas (rochas cobrem só a faixa de baixo da tela)
  const band = (pic: ReturnType<typeof recordShapes>) => rasterize(pic, -W * 0.1, H * 0.66, W * 1.2, H * 0.4, pr);
  const rocksBack = useMemo(() => band(recordShapes([...rockSpire(W * 0.34, W * 0.6, H * 0.84, H * 1.05, -6)], W, H)), [W, H]);
  const rocksFront = useMemo(
    () => band(recordShapes([...rockSpire(-W * 0.06, W * 0.3, H * 0.72, H * 1.05, 10), ...rockSpire(W * 0.72, W * 1.06, H * 0.79, H * 1.05, -12)], W, H)),
    [W, H],
  );
  const clouds = useMemo(() => {
    const defs = [
      { x: 0.2, y: 0.83, w: 0.55, front: false },
      { x: 0.78, y: 0.87, w: 0.5, front: false },
      { x: 0.5, y: 0.95, w: 0.7, front: true },
      { x: 0.08, y: 0.97, w: 0.45, front: true },
      { x: 0.92, y: 0.99, w: 0.5, front: true },
    ];
    return defs.map((d, i) => ({
      ...d,
      pic: rasterize(recordShapes(cloud(0, 0, d.w * W) as Shape[], W, H), -d.w * W * 0.62, -d.w * W * 0.3, d.w * W * 1.24, d.w * W * 0.5, pr),
      cw: d.w * W,
      sp: 0.012 + rand(i + 3) * 0.012,
      ph: rand(i + 9) * 6,
    }));
  }, [W, H]);

  const drift = (sp: number, ph: number, x: number, y: number) =>
    useDerivedValue(() => {
      const t = S.clock.value / 1000;
      return [{ translateX: x * W + Math.sin(t * sp * 6 + ph) * W * 0.05 }, { translateY: y * H + Math.sin(t * 0.4 + ph) * 3 }];
    });
  const tr = clouds.map((c) => drift(c.sp, c.ph, c.x, c.y));
  // névoa: faixas largas e suaves, mais densas quando o dragão está presente
  const mistOpacity = useDerivedValue(() => 0.35 + 0.35 * S.appear.value);
  const mistT = useDerivedValue(() => [{ translateX: Math.sin(S.clock.value / 9000) * W * 0.12 }]);

  return (
    <>
      {clouds.filter((c) => !c.front).map((c, i) => (
        <Group key={`b${i}`} transform={tr[clouds.indexOf(c)]!}>
          <Image image={c.pic} x={-c.cw * 0.62} y={-c.cw * 0.3} width={c.cw * 1.24} height={c.cw * 0.5} />
        </Group>
      ))}
      <Image image={rocksBack} x={-W * 0.1} y={H * 0.66} width={W * 1.2} height={H * 0.4} />
      <Group opacity={mistOpacity} transform={mistT}>
        <Oval x={-W * 0.3} y={H * 0.8} width={W * 1.6} height={H * 0.16}>
          <RadialGradient c={vec(W * 0.5, H * 0.88)} r={W * 0.8} colors={['rgba(225,240,255,0.75)', 'rgba(200,225,255,0)']} />
        </Oval>
      </Group>
      <Image image={rocksFront} x={-W * 0.1} y={H * 0.66} width={W * 1.2} height={H * 0.4} />
      {clouds.filter((c) => c.front).map((c, i) => (
        <Group key={`f${i}`} transform={tr[clouds.indexOf(c)]!}>
          <Image image={c.pic} x={-c.cw * 0.62} y={-c.cw * 0.3} width={c.cw * 1.24} height={c.cw * 0.5} />
        </Group>
      ))}
      <Group opacity={mistOpacity}>
        <Oval x={-W * 0.2} y={H * 0.9} width={W * 1.4} height={H * 0.14}>
          <RadialGradient c={vec(W * 0.5, H * 0.97)} r={W * 0.75} colors={['rgba(235,245,255,0.8)', 'rgba(210,230,255,0)']} />
        </Oval>
      </Group>
    </>
  );
}
