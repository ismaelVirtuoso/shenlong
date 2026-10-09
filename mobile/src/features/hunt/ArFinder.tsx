import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hap } from '@/audio/haptics';
import { playSfx } from '@/audio/sfx';
import { BallArt } from './BallArt';
import { bearing, dist } from './geo';
import { useHunt } from './store';
import { camHeading, camPitch, tracker } from './tracker';

/** Distância máxima para conseguir pegar a esfera tocando nela (m). */
export const REACH = 2.2;
const SIZE = 200;
const H_FOV = 34, V_FOV = 64, EYE = 1.1;

/**
 * Câmera com a esfera "no ambiente": RA por sensores (bússola + inclinação). A esfera fica presa à
 * direção real dela e no chão (perto = olhar para baixo). Ancoragem em superfícies (ARKit/ARCore)
 * exigiria um build próprio; isto funciona no Expo Go.
 */
export function ArFinder({ stars, onCollected, onClose }: { stars: number; onCollected: () => void; onClose: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const ball = useHunt((s) => s.balls.find((b) => b.stars === stars));
  const px = useHunt((s) => s.x), py = useHunt((s) => s.y);
  const [msg, setMsg] = useState('');
  const collecting = useRef(false);

  // rumo/distância até a esfera (UI thread lê para projetar a 60 fps)
  const bBearing = useSharedValue(0), bDist = useSharedValue(5);
  const d = ball ? dist(px, py, ball.x, ball.y) : 99;
  useEffect(() => {
    if (!ball) return;
    const b = bearing(px, py, ball.x, ball.y);
    bBearing.value = b;
    bDist.value = withTiming(d, { duration: 300 });
    tracker.face(b); // sem bússola: a esfera aparece à frente
  }, [ball, px, py, d, bBearing, bDist]);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) void requestPerm();
  }, [perm, requestPerm]);

  const pop = useSharedValue(1);
  const fly = useSharedValue(0);
  const ballStyle = useAnimatedStyle(() => {
    const rel = ((((bBearing.value - camHeading.value) % 360) + 540) % 360) - 180;
    const elev = (-Math.atan2(EYE, Math.max(bDist.value, 0.3)) * 180) / Math.PI;
    const x = W / 2 + (rel / H_FOV) * W;
    const y = H / 2 - ((elev - camPitch.value) / V_FOV) * H;
    const s = Math.min(1.6, Math.max(0.45, 1.4 / Math.max(bDist.value, 0.6))) * pop.value;
    const bob = Math.sin(Date.now() / 400) * 6;
    // ao coletar: voa até a bolsa (embaixo, no centro) e some
    const fx = x + (W / 2 - x) * fly.value, fy = y + bob + (H - 90 - y - bob) * fly.value;
    return { transform: [{ translateX: fx - SIZE / 2 }, { translateY: fy - SIZE / 2 }, { scale: s * (1 - 0.7 * fly.value) }], opacity: 1 - fly.value * 0.6 };
  });
  const leftHint = useAnimatedStyle(() => {
    const rel = ((((bBearing.value - camHeading.value) % 360) + 540) % 360) - 180;
    return { opacity: rel < -H_FOV / 2 ? 1 : 0 };
  });
  const rightHint = useAnimatedStyle(() => {
    const rel = ((((bBearing.value - camHeading.value) % 360) + 540) % 360) - 180;
    return { opacity: rel > H_FOV / 2 ? 1 : 0 };
  });

  const tap = () => {
    if (collecting.current) return;
    if (d > REACH) {
      setMsg(`Chegue mais perto (${d.toFixed(1)} m)`);
      hap.light();
      return;
    }
    collecting.current = true;
    hap.success();
    playSfx('chime');
    pop.value = withSequence(withSpring(1.35, { damping: 6 }), withTiming(1, { duration: 150 }));
    fly.value = withTiming(1, { duration: 900 });
    setMsg(`Você pegou a esfera de ${stars} ${stars > 1 ? 'estrelas' : 'estrela'}!`);
    setTimeout(onCollected, 1200);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {perm?.granted ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0b1020' }]} />
      )}
      <Animated.View style={[styles.ball, ballStyle]}>
        <Pressable onPress={tap} style={{ width: SIZE, height: SIZE }} hitSlop={20}>
          <BallArt stars={stars} size={SIZE} />
        </Pressable>
      </Animated.View>
      <Animated.Text style={[styles.edge, { left: 12 }, leftHint]}>◀︎</Animated.Text>
      <Animated.Text style={[styles.edge, { right: 12 }, rightHint]}>▶︎</Animated.Text>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Text style={styles.title}>Esfera de {stars} {stars > 1 ? 'estrelas' : 'estrela'}</Text>
        <Text style={styles.sub}>{msg || (d <= REACH ? 'Procure pela câmera e toque na esfera!' : `Está a ${d.toFixed(1)} m — chegue mais perto`)}</Text>
        {!perm?.granted && <Text style={styles.sub}>(câmera sem permissão: a esfera aparece mesmo assim)</Text>}
      </View>
      <Pressable onPress={onClose} style={[styles.close, { bottom: insets.bottom + 24 }]}>
        <Text style={styles.closeText}>Voltar ao radar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ball: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE },
  edge: { position: 'absolute', top: '45%', fontSize: 44, color: '#ffd23a', textShadowColor: '#000', textShadowRadius: 8 },
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  title: { color: '#ffd23a', fontSize: 22, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 8 },
  sub: { color: '#fff', fontSize: 15, marginTop: 4, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 6 },
  close: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: '#ffd23a' },
  closeText: { color: '#ffd23a', fontSize: 16, fontWeight: '700' },
});
