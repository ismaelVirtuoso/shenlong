import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, Circle, RadialGradient, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { hap } from '@/audio/haptics';
import { playSfx } from '@/audio/sfx';
import { BallArt } from './BallArt';

/** Duração da apresentação antes de ir sozinho ao altar (ms). */
export const GATHER_MS = 4200;

/**
 * As 7 esferas reunidas: sobem do inventário, giram e se encaixam no arranjo clássico
 * (1 no centro + 6 ao redor), o brilho pulsa e o app segue sozinho para o altar — já ouvindo.
 */
export function Gathered({ onDone }: { onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const cx = W / 2, cy = H * 0.42;
  const ball = Math.min(W * 0.24, 110);
  const ring = ball * 1.12;
  const t = useSharedValue(0); // 0 → 1: chegada e encaixe
  const glow = useSharedValue(0);

  useEffect(() => {
    playSfx('gather', { volume: 0.9 });
    hap.success();
    t.value = withTiming(1, { duration: 1900, easing: Easing.out(Easing.cubic) });
    glow.value = withDelay(1500, withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.55, { duration: 650 })), -1));
    const h = setTimeout(() => hap.heavy(), 1900);
    const d = setTimeout(onDone, GATHER_MS);
    return () => {
      clearTimeout(h);
      clearTimeout(d);
    };
  }, []);

  const glowR = useDerivedValue(() => ring * (1.9 + 0.5 * glow.value));
  const glowColors = useDerivedValue(() => [
    `rgba(255,200,80,${(0.55 * glow.value).toFixed(3)})`,
    `rgba(255,140,20,${(0.25 * glow.value).toFixed(3)})`,
    'rgba(255,120,0,0)',
  ]);

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.fill}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle cx={cx} cy={cy} r={glowR}>
          <RadialGradient c={vec(cx, cy)} r={glowR} colors={glowColors} />
        </Circle>
      </Canvas>
      {[1, 2, 3, 4, 5, 6, 7].map((s) => (
        <GatherBall key={s} stars={s} t={t} cx={cx} cy={cy} H={H} W={W} ring={ring} size={ball} />
      ))}
      <Animated.View entering={FadeIn.delay(1300).duration(700)} style={[styles.textBox, { top: cy + ring + ball * 0.9 }]}>
        <Text style={styles.title}>As 7 Esferas do Dragão estão reunidas!</Text>
        <Text style={styles.sub}>Prepare-se… chame o dragão.</Text>
      </Animated.View>
    </Animated.View>
  );
}

function GatherBall(p: { stars: number; t: SharedValue<number>; cx: number; cy: number; W: number; H: number; ring: number; size: number }) {
  const { stars, t, cx, cy, W, H, ring, size } = p;
  const k = stars - 1;
  // destino: 7 estrelas no centro, as outras em anel (ordem horária a partir do topo)
  const ang = -Math.PI / 2 + (k * Math.PI * 2) / 6;
  const tx = stars === 7 ? cx : cx + Math.cos(ang) * ring;
  const ty = stars === 7 ? cy : cy + Math.sin(ang) * ring;
  // origem: inventário no rodapé
  const sx = W / 2 + (k - 3) * 46;
  const sy = H - 70;
  const style = useAnimatedStyle(() => {
    const u = Math.min(1, Math.max(0, t.value * 1.35 - k * 0.05));
    // espiral: chega girando em volta do centro
    const swirl = (1 - u) * 2.2;
    const ox = interpolate(u, [0, 1], [sx, tx]), oy = interpolate(u, [0, 1], [sy, ty]);
    const dx = ox - cx, dy = oy - cy;
    const x = cx + dx * Math.cos(swirl) - dy * Math.sin(swirl);
    const y = cy + dx * Math.sin(swirl) + dy * Math.cos(swirl);
    const s = interpolate(u, [0, 0.7, 0.85, 1], [0.35, 1.1, 0.95, 1]);
    return { transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }, { scale: s }], opacity: Math.min(1, u * 4) };
  });
  return (
    <Animated.View style={[styles.ball, { width: size, height: size }, style]} pointerEvents="none">
      <BallArt stars={stars} size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#081018' },
  ball: { position: 'absolute', left: 0, top: 0 },
  textBox: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  title: { color: '#ffd23a', fontSize: 25, fontWeight: '900', textAlign: 'center', textShadowColor: '#ff7a00', textShadowRadius: 12 },
  sub: { color: '#fff', fontSize: 17, marginTop: 10, textAlign: 'center' },
});
