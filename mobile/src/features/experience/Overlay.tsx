import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LONG_PRESS_MS } from '@/core/config';
import { controller } from './controller';
import { micLevel, useStore } from './store';

const GOLD = '#f6c945';

export function Overlay() {
  const insets = useSafeAreaInsets();
  const phase = useStore((s) => s.m.phase);
  const caption = useStore((s) => s.caption);
  const micDenied = useStore((s) => s.micDenied);

  const showMic = phase === 'altar' || phase === 'listening';
  const showCaption =
    !!caption && (phase === 'greeting' || phase === 'speaking' || phase === 'thinking' || phase === 'listening' || phase === 'goodbye');

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      delayLongPress={LONG_PRESS_MS}
      onPress={() => (phase === 'boot' ? void controller.start() : controller.tap())}
      onLongPress={() => controller.longPressInvoke()}
      accessibilityLabel="Shenlong"
    >
      <View pointerEvents="none" style={[styles.fill, { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 12 }]}>
        {phase === 'boot' && <Boot />}
        {phase === 'altar' && <Altar micDenied={micDenied} />}

        <View style={styles.bottom}>
          {showCaption && caption && <Bubble key={caption.id} who={caption.who} text={caption.text} />}
          {phase === 'thinking' && <Text style={styles.status}>Shenlong está ouvindo…</Text>}
          {showMic && <MicOrb />}
        </View>
      </View>
    </Pressable>
  );
}

function Boot() {
  const pulse = usePulse();
  return (
    <Animated.View entering={FadeIn.duration(1500).delay(600)} style={styles.bootWrap}>
      <Text style={styles.title}>SHENLONG</Text>
      <Text style={styles.subtitle}>Seu desejo, minha missão.</Text>
      <View style={{ flex: 1 }} />
      <Text style={styles.bootText}>As sete Esferas do Dragão estão diante de você…</Text>
      <Animated.Text style={[styles.tap, pulse]}>Toque para continuar</Animated.Text>
    </Animated.View>
  );
}

function Altar({ micDenied }: { micDenied: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(900)} exiting={FadeOut.duration(400)} style={styles.altarWrap}>
      <View style={{ flex: 1 }} />
      <Text style={styles.say}>{micDenied ? 'Segure a tela para chamar' : 'Diga em voz alta:'}</Text>
      {!micDenied && <Text style={styles.quote}>“Shenlong, apareça!”</Text>}
      <Text style={styles.hint}>{micDenied ? 'O microfone está desligado' : 'ou segure a tela por um instante'}</Text>
    </Animated.View>
  );
}

function Bubble({ who, text }: { who: 'shenlong' | 'user'; text: string }) {
  const user = who === 'user';
  return (
    <Animated.View
      entering={FadeIn.duration(350)}
      exiting={FadeOut.duration(250)}
      style={[styles.bubble, user ? styles.bubbleUser : styles.bubbleDragon]}
    >
      <Text style={[styles.bubbleText, user && { color: '#dff0ff' }]}>{text}</Text>
    </Animated.View>
  );
}

const BARS = 11;
function MicOrb() {
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.6,
    transform: [{ scale: 1 + ring.value * 0.7 + micLevel.value * 0.3 }],
  }));
  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + micLevel.value * 0.22 }] }));
  return (
    <View style={styles.micRow}>
      <Bars flip />
      <View style={styles.orbWrap}>
        <Animated.View style={[styles.orbRing, ringStyle]} />
        <Animated.View style={[styles.orb, orbStyle]}>
          <View style={styles.micBody} />
          <View style={styles.micArc} />
          <View style={styles.micStem} />
        </Animated.View>
      </View>
      <Bars />
    </View>
  );
}

function Bars({ flip }: { flip?: boolean }) {
  return (
    <View style={styles.bars}>
      {Array.from({ length: BARS }, (_, i) => (
        <Bar key={i} i={flip ? BARS - 1 - i : i} />
      ))}
    </View>
  );
}

function Bar({ i }: { i: number }) {
  const style = useAnimatedStyle(() => {
    const edge = 1 - Math.abs(i - (BARS - 1) / 2) / (BARS / 2);
    const wob = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 140 + i * 1.3));
    return { height: 4 + (6 + micLevel.value * 34) * edge * wob, opacity: 0.35 + micLevel.value * 0.65 };
  });
  return <Animated.View style={[styles.bar, style]} />;
}

function usePulse() {
  const v = useSharedValue(0.4);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0.4, { duration: 1100 })), -1);
  }, [v]);
  return useAnimatedStyle(() => ({ opacity: v.value }));
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: 22 },
  bottom: { position: 'absolute', left: 22, right: 22, bottom: 0, paddingBottom: 36, alignItems: 'center', gap: 18 },
  bootWrap: { flex: 1, alignItems: 'center' },
  title: { marginTop: 24, color: GOLD, fontSize: 40, fontWeight: '800', letterSpacing: 6, textShadowColor: '#ff8a00', textShadowRadius: 18 },
  subtitle: { color: '#9bb7ff', fontStyle: 'italic', fontSize: 15, marginTop: 4 },
  bootText: { color: '#f3e9d2', fontSize: 17, textAlign: 'center', lineHeight: 24, textShadowColor: '#000', textShadowRadius: 8, marginBottom: 20 },
  tap: { color: '#fff', fontSize: 14, letterSpacing: 2, marginBottom: 56 },
  altarWrap: { flex: 1, alignItems: 'center' },
  say: { color: '#f3e9d2', fontSize: 16, textShadowColor: '#000', textShadowRadius: 8 },
  quote: { color: GOLD, fontSize: 30, fontWeight: '700', marginTop: 6, textAlign: 'center', textShadowColor: '#ff8a00', textShadowRadius: 14 },
  hint: { color: '#9aa3c4', fontSize: 12, marginTop: 8, marginBottom: 150 },
  status: { color: '#bcd6ff', fontSize: 15, letterSpacing: 1 },
  bubble: { maxWidth: '100%', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 22, borderWidth: 1 },
  bubbleDragon: { backgroundColor: 'rgba(8,14,10,0.72)', borderColor: 'rgba(246,201,69,0.45)' },
  bubbleUser: { backgroundColor: 'rgba(20,60,120,0.78)', borderColor: 'rgba(120,180,255,0.5)' },
  bubbleText: { color: '#fff7e0', fontSize: 18, lineHeight: 25, textAlign: 'center' },
  micRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44 },
  bar: { width: 3, borderRadius: 2, backgroundColor: '#56b4ff' },
  orbWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  orbRing: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#56b4ff' },
  orb: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: '#56b4ff', backgroundColor: 'rgba(10,30,70,0.8)', alignItems: 'center', justifyContent: 'center' },
  micBody: { width: 14, height: 24, borderRadius: 7, borderWidth: 2.5, borderColor: '#cfe6ff', marginTop: -6 },
  micArc: { position: 'absolute', top: 29, width: 24, height: 14, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 2.5, borderTopWidth: 0, borderColor: '#cfe6ff' },
  micStem: { position: 'absolute', top: 44, width: 2.5, height: 6, backgroundColor: '#cfe6ff' },
});
