import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  Path,
  PathOp,
  RadialGradient,
  RoundedRect,
  Skia,
  SweepGradient,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { BallSpot } from './geo';

interface Props {
  balls: BallSpot[];
  x: number;
  y: number;
  heading: number;
  /** alcance da tela do radar (m, do centro à borda) */
  range: number;
  /** largura do aparelho (a altura é 1,16×, por causa do botão) */
  size: number;
  /** botão do topo (como no anime: muda a escala) */
  onButton?: () => void;
}

const INK = '#23262b';

/**
 * Radar do Dragão no formato do anime: aparelho redondo branco (contorno de traço), botão no topo
 * como a coroa de um cronômetro, tela verde quadriculada com reflexo de vidro e esferas piscando.
 */
export function DragonRadar({ balls, x, y, heading, range, size, onButton }: Props) {
  const W = size;
  const top = size * 0.16; // espaço do botão
  const c = { x: W / 2, y: top + W / 2 };
  const R = W / 2 - 3; // carcaça
  const r = R * 0.76; // tela verde
  const clock = useClock();
  const press = useSharedValue(0);
  const sweep = useDerivedValue(() => [
    { translateX: c.x },
    { translateY: c.y },
    { rotate: (clock.value / 1600) % (Math.PI * 2) },
    { translateX: -c.x },
    { translateY: -c.y },
  ]);
  // piscar em degraus, como o LCD do anime
  const blink = useDerivedValue(() => (Math.floor(clock.value / 450) % 2 ? 0.35 : 1));
  const capT = useDerivedValue(() => [{ translateY: press.value * W * 0.025 }]);

  const grid = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const n = 8;
    for (let i = 1; i < n; i++) {
      const o = -r + (2 * r * i) / n;
      p.moveTo(c.x + o, c.y - r);
      p.lineTo(c.x + o, c.y + r);
      p.moveTo(c.x - r, c.y + o);
      p.lineTo(c.x + r, c.y + o);
    }
    return p.build();
  }, [c.x, c.y, r]);
  const clip = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    p.addCircle(c.x, c.y, r);
    return p.build();
  }, [c.x, c.y, r]);
  const glare = useMemo(() => {
    // reflexo curvo do vidro (lua crescente no canto superior esquerdo)
    const p = Skia.PathBuilder.Make();
    p.addCircle(c.x - r * 0.12, c.y - r * 0.14, r * 0.9);
    const q = Skia.PathBuilder.Make();
    q.addCircle(c.x + r * 0.05, c.y + r * 0.04, r * 0.92);
    return Skia.Path.MakeFromOp(p.build(), q.build(), PathOp.Difference) ?? q.build();
  }, [c.x, c.y, r]);
  const user = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const s = W * 0.032;
    p.moveTo(c.x, c.y - s * 1.3);
    p.lineTo(c.x + s, c.y + s);
    p.lineTo(c.x - s, c.y + s);
    p.close();
    return p.build();
  }, [c.x, c.y, W]);

  // heading-up: o que está à frente aparece para cima
  const h = (heading * Math.PI) / 180;
  const blips = balls
    .filter((b) => !b.collected)
    .map((b) => {
      const dx = b.x - x,
        dy = b.y - y;
      const sx = dx * Math.cos(h) - dy * Math.sin(h);
      const sy = -(dx * Math.sin(h) + dy * Math.cos(h));
      let px = (sx / range) * r,
        py = (sy / range) * r;
      const l = Math.hypot(px, py);
      const edge = l > r - 10;
      if (edge) {
        px *= (r - 10) / l;
        py *= (r - 10) / l;
      }
      return { stars: b.stars, px: c.x + px, py: c.y + py, edge };
    });

  const bw = W * 0.15, bh = top * 0.42; // tampa do botão
  return (
    <View style={{ width: W, height: top + W }}>
      <Canvas style={{ width: W, height: top + W }}>
        {/* botão (coroa): haste + tampa */}
        <RoundedRect x={c.x - W * 0.05} y={top * 0.45} width={W * 0.1} height={top * 0.75} r={3}>
          <LinearGradient start={vec(c.x - W * 0.05, 0)} end={vec(c.x + W * 0.05, 0)} colors={['#8e969e', '#f4f6f7', '#7c848c']} />
        </RoundedRect>
        <RoundedRect x={c.x - W * 0.05} y={top * 0.45} width={W * 0.1} height={top * 0.75} r={3} style="stroke" strokeWidth={2.5} color={INK} />
        <Group transform={capT}>
          <RoundedRect x={c.x - bw / 2} y={top * 0.06} width={bw} height={bh} r={bh * 0.35}>
            <LinearGradient start={vec(0, top * 0.06)} end={vec(0, top * 0.06 + bh)} colors={['#ffffff', '#d6dbe0', '#9aa3ab']} />
          </RoundedRect>
          <RoundedRect x={c.x - bw / 2} y={top * 0.06} width={bw} height={bh} r={bh * 0.35} style="stroke" strokeWidth={3} color={INK} />
        </Group>

        {/* carcaça branca com bisel */}
        <Circle cx={c.x} cy={c.y} r={R}>
          <RadialGradient c={vec(c.x - R * 0.35, c.y - R * 0.4)} r={R * 1.5} colors={['#ffffff', '#eef0ee', '#c9cdd0', '#9ea5ab']} positions={[0, 0.35, 0.75, 1]} />
        </Circle>
        <Circle cx={c.x} cy={c.y} r={R} style="stroke" strokeWidth={3.5} color={INK} />
        <Circle cx={c.x} cy={c.y} r={R * 0.88} style="stroke" strokeWidth={2} color="rgba(35,38,43,0.35)" />
        {/* moldura escura da tela */}
        <Circle cx={c.x} cy={c.y} r={r + R * 0.055} color="#2f3a40" />
        <Circle cx={c.x} cy={c.y} r={r + R * 0.055} style="stroke" strokeWidth={2.5} color={INK} />

        {/* tela verde */}
        <Circle cx={c.x} cy={c.y} r={r}>
          <RadialGradient c={vec(c.x, c.y)} r={r} colors={['#9cf07e', '#58c24a', '#2b8a30']} />
        </Circle>
        <Group clip={clip}>
          <Path path={grid} style="stroke" strokeWidth={1.4} color="rgba(20,80,25,0.5)" />
          <Line p1={vec(c.x - r, c.y)} p2={vec(c.x + r, c.y)} strokeWidth={2} color="rgba(20,80,25,0.65)" />
          <Line p1={vec(c.x, c.y - r)} p2={vec(c.x, c.y + r)} strokeWidth={2} color="rgba(20,80,25,0.65)" />
          <Group transform={sweep}>
            <Circle cx={c.x} cy={c.y} r={r}>
              <SweepGradient c={vec(c.x, c.y)} colors={['rgba(230,255,210,0)', 'rgba(230,255,210,0)', 'rgba(230,255,210,0.35)']} positions={[0, 0.85, 1]} />
            </Circle>
          </Group>
          {/* esferas: pontos amarelos piscando (na borda se estiverem fora do alcance) */}
          {blips.map((b) => (
            <Group key={b.stars} opacity={blink}>
              <Circle cx={b.px} cy={b.py} r={b.edge ? 8 : 12}>
                <RadialGradient c={vec(b.px, b.py)} r={b.edge ? 10 : 17} colors={['#fffbd0', '#ffc928', 'rgba(255,170,0,0)']} />
              </Circle>
              <Circle cx={b.px} cy={b.py} r={b.edge ? 4.5 : 6.5} color="#ffe14a" />
              <Circle cx={b.px} cy={b.py} r={b.edge ? 4.5 : 6.5} style="stroke" strokeWidth={1.5} color="#7a5a00" />
            </Group>
          ))}
          <Path path={user} color="#e8231a" />
          <Path path={user} style="stroke" strokeWidth={2} color={INK} />
          {/* reflexo do vidro */}
          <Path path={glare} color="rgba(255,255,255,0.22)" />
        </Group>
      </Canvas>
      {onButton && (
        <Pressable
          accessibilityLabel="Botão do radar"
          hitSlop={16}
          onPress={() => {
            press.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 140 }));
            onButton();
          }}
          style={{ position: 'absolute', left: c.x - bw, top: 0, width: bw * 2, height: top * 1.1 }}
        />
      )}
    </View>
  );
}
