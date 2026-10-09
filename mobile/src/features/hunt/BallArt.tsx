import { useMemo } from 'react';
import { Canvas, Circle, Oval, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { starCenters, starOutline } from '@/features/scene/stars';

/** Esfera do Dragão (n estrelas) com brilho, desenhada em Skia. */
export function BallArt({ stars, size, glow = 1, dim = false }: { stars: number; size: number; glow?: number; dim?: boolean }) {
  const c = size / 2, r = size * 0.3;
  const starPath = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    for (const s of starCenters(stars)) {
      starOutline(s.x, s.y).forEach(([x, y], k) => (k ? p.lineTo(c + x * r, c + y * r) : p.moveTo(c + x * r, c + y * r)));
      p.close();
    }
    return p.build();
  }, [stars, c, r]);
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      {glow > 0 && (
        <Circle cx={c} cy={c} r={size / 2}>
          <RadialGradient c={vec(c, c)} r={size / 2} colors={[`rgba(255,190,60,${0.75 * glow})`, `rgba(255,140,20,${0.3 * glow})`, 'rgba(255,120,0,0)']} positions={[0.45, 0.65, 1]} />
        </Circle>
      )}
      <Circle cx={c} cy={c} r={r}>
        <RadialGradient c={vec(c - r * 0.35, c - r * 0.4)} r={r * 1.5} colors={dim ? ['#6b6157', '#4a3f35', '#2a221c'] : ['#fff6cc', '#ffbf3a', '#e56d10', '#8e3006']} />
      </Circle>
      <Path path={starPath} color={dim ? '#3a2a24' : '#cf1d17'} />
      <Oval x={c - r * 0.62} y={c - r * 0.72} width={r * 0.55} height={r * 0.32} color={dim ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)'} />
    </Canvas>
  );
}
