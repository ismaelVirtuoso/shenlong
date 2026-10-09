import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hap } from '@/audio/haptics';
import { playSfx } from '@/audio/sfx';
import { ArFinder, REACH } from './ArFinder';
import { BallArt } from './BallArt';
import { angleDiff, bearing, nearestUncollected } from './geo';
import { DragonRadar } from './Radar';
import { Gathered } from './Gathered';
import { collect, collectedCount, useHunt } from './store';
import { tracker } from './tracker';

/**
 * Radar do Dragão: encontre as 7 esferas espalhadas ao redor (~100 m²). Perto de uma, abra a câmera
 * e toque nela. Com as 7, chama `onComplete` (libera a invocação por voz).
 */
export function HuntScreen({ onComplete }: { onComplete: () => void }) {
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { balls, x, y, heading, accuracy, scatteredAt, guided } = useHunt();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!scatteredAt) return;
    const t = setTimeout(() => setNow(Date.now()), 5200);
    return () => clearTimeout(t);
  }, [scatteredAt]);
  const scattered = scatteredAt > 0 && now - scatteredAt < 5000;
  const [ar, setAr] = useState<number | null>(null);
  const [range, setRange] = useState(8);
  const count = collectedCount(balls);
  const near = nearestUncollected(balls, x, y);
  const close = !!near && near.d <= REACH;

  // liga o radar (clique do botão + "bwiip")
  useEffect(() => {
    if (count < 7) playSfx('radarOn', { volume: 0.7 });
  }, []);

  // bipe do radar: mais rápido quanto mais perto (vibra quando dá para pegar)
  useEffect(() => {
    if (!near || ar != null) return;
    const period = near.d < 1.5 ? 450 : near.d < REACH ? 900 : near.d < 5 ? 1800 : 2700;
    const t = setInterval(() => {
      playSfx('radar', { volume: near.d < REACH ? 0.7 : near.d < 5 ? 0.45 : 0.3 });
      if (near.d < REACH) hap.light();
    }, period);
    return () => clearInterval(t);
  }, [near?.ball.stars, Math.round((near?.d ?? 99) * 2), ar]);

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = close
      ? withRepeat(withSequence(withTiming(1.08, { duration: 500 }), withTiming(1, { duration: 500 })), -1)
      : withTiming(1);
  }, [close, pulse]);
  const camBtn = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  if (ar != null) {
    return (
      <>
        <ArFinder
          stars={ar}
          onClose={() => setAr(null)}
          onCollected={() => {
            const n = collect(ar);
            setAr(null);
            if (n < 7) playSfx('chime');
          }}
        />
        {__DEV__ && <DevPad />}
      </>
    );
  }

  if (count >= 7) return <Gathered onDone={onComplete} />;
  const rel = near ? angleDiff(bearing(x, y, near.ball.x, near.ball.y), heading) : 0;
  const dir = !near
    ? ''
    : Math.abs(rel) < 25
      ? 'em frente'
      : rel > 0
        ? rel > 120
          ? 'atrás de você'
          : 'à direita'
        : rel < -120
          ? 'atrás de você'
          : 'à esquerda';
  const size = Math.min(W * 0.86, 380);

  return (
    <View style={[styles.fill, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>RADAR DO DRAGÃO</Text>
      <Text style={styles.count}>Esferas: {count}/7</Text>
      {scattered && (
        <Animated.Text entering={FadeIn.duration(500)} style={styles.banner}>
          As Esferas do Dragão se espalharam! Encontre-as de novo…
        </Animated.Text>
      )}
      <View style={{ marginTop: 4 }}>
        <DragonRadar
          balls={balls}
          x={x}
          y={y}
          heading={heading}
          range={range}
          size={size}
          onButton={() => {
            playSfx('radarOn', { volume: 0.6 });
            hap.light();
            setRange((r) => (r === 8 ? 16 : r === 16 ? 4 : 8));
          }}
        />
      </View>
      <Text style={styles.hint}>
        {near
          ? close
            ? 'A esfera está bem perto! Abra a câmera e procure.'
            : `A mais próxima está a ${near.d.toFixed(1)} m, ${dir}.`
          : ''}
      </Text>
      <Text style={styles.small}>
        {guided
          ? 'Ande pela casa segurando o aparelho: o radar te leva até a esfera.'
          : 'Ande devagar segurando o celular e vire para onde a esfera está.'}{' '}
        Aperte o botão do radar para mudar a escala ({range} m).
        {accuracy != null ? ` GPS ±${Math.round(accuracy)} m` : ''}
      </Text>
      <Animated.View style={camBtn}>
        <Pressable
          onPress={() => near && (close || __DEV__) && setAr(near.ball.stars)}
          style={[styles.cta, !close && styles.ctaOff]}
        >
          <Text style={styles.ctaText}>{close ? 'Procurar com a câmera' : 'Chegue mais perto…'}</Text>
        </Pressable>
      </Animated.View>
      <View style={[styles.inventory, { bottom: insets.bottom + 14 }]}>
        {balls.map((b) => (
          <BallArt key={b.stars} stars={b.stars} size={42} glow={b.collected ? 0.6 : 0} dim={!b.collected} />
        ))}
      </View>
      {__DEV__ && <DevPad />}
    </View>
  );
}

/** Simulação (só em dev / emulador): anda e gira sem sair do lugar. */
export function DevPad() {
  return (
    <View style={styles.pad}>
      <Pad label="↺" onPress={() => tracker.turn(-30)} />
      <Pad label="↑" onPress={() => tracker.step(0.6)} />
      <Pad label="↻" onPress={() => tracker.turn(30)} />
    </View>
  );
}
const Pad = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.padBtn}>
    <Text style={{ color: '#fff', fontSize: 18 }}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: '#081018',
  },
  title: {
    color: '#ffd23a',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: '#ff7a00',
    textShadowRadius: 10,
  },
  count: { color: '#cfe8ff', fontSize: 16, marginTop: 2 },
  banner: {
    color: '#ffd23a',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  hint: {
    color: '#fff',
    fontSize: 17,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
    minHeight: 44,
  },
  small: {
    color: '#8aa0b8',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  cta: {
    marginTop: 16,
    backgroundColor: '#ff9a1a',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#ffe08a',
  },
  ctaOff: { backgroundColor: '#3a4652', borderColor: '#5a6672' },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  inventory: { position: 'absolute', flexDirection: 'row', gap: 4 },
  doneTitle: {
    color: '#ffd23a',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 20,
    textShadowColor: '#ff7a00',
    textShadowRadius: 12,
  },
  inventoryBig: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 12,
  },
  doneSub: {
    color: '#fff',
    fontSize: 17,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pad: {
    position: 'absolute',
    right: 10,
    bottom: 80,
    flexDirection: 'row',
    gap: 6,
  },
  padBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
