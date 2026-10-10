import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAudioRecorder } from 'expo-audio';
import { REC_OPTIONS } from '@/features/voice/recording';
import { controller } from './controller';
import { Overlay } from './Overlay';
import { Scene } from '@/features/scene/Scene';
import { HuntScreen } from '@/features/hunt/HuntScreen';
import { useStore as usePhaseStore } from '@/features/experience/store';
import { DragonView } from '@/features/dragon3d/DragonView';
import { useStore } from './store';
import type { Phase } from '@/core/machine';
import { downgrade } from '@/core/quality';
import { collect, newHunt, useHunt } from '@/features/hunt/store';
import { nearestUncollected } from '@/features/hunt/geo';

const PHASES: Phase[] = ['boot', 'hunt', 'altar', 'summoning', 'appearing', 'greeting', 'listening', 'thinking', 'speaking', 'goodbye', 'disappearing'];

/** Tela de desenvolvimento: pula para qualquer fase da experiência (abra /debug). */
export default function Debug() {
  const { phase, wishes, release } = useLocalSearchParams<{ phase?: string; wishes?: string; release?: string }>();
  const quality = useStore((s) => s.quality);
  // abrir /debug direto também liga o microfone (dá para testar a voz em altar/listening)
  const recorder = useAudioRecorder(REC_OPTIONS);
  useEffect(() => {
    controller.attach(recorder);
  }, [recorder]);
  useEffect(() => {
    if (release) {
      // dragão presente e, depois, a saída dourada de desejo concedido
      controller.debugGoto('greeting', 1);
      const t = setTimeout(() => controller.debugGoto('disappearing', 1), 6000);
      return () => clearTimeout(t);
    }
    if (phase && (PHASES as string[]).includes(phase)) controller.debugGoto(phase as Phase, Number(wishes ?? 0) || 0);
    else if (Platform.OS === 'web') {
      // web: toca a invocação sozinha para conferir a cena sem interação
      const t = setTimeout(() => controller.debugGoto('summoning'), 2500);
      return () => clearTimeout(t);
    }
  }, [phase, wishes, release]);
  const st = useStore.getState();
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DragonView />
      <HuntLayer />
      <View style={{ position: 'absolute', top: 36, left: 0, right: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {PHASES.map((p) => (
            <Btn key={p} label={p} onPress={() => controller.debugGoto(p)} />
          ))}
          <Btn label="+1 esfera" onPress={() => { const n = nearestUncollected(useHunt.getState().balls, 0, 0); if (n) collect(n.ball.stars); }} />
          <Btn label="7 esferas" onPress={() => useHunt.getState().balls.forEach((b) => collect(b.stars))} />
          <Btn label="espalhar" onPress={() => newHunt(null)} />
          <Btn label="bolt" onPress={() => st.bump('bolt', { boltBig: true })} />
          <Btn label="wish" onPress={() => st.bump('wish')} />
          <Btn label="saída dourada" onPress={() => controller.debugGoto('disappearing', 1)} />
          <Btn label="speak" onPress={() => st.set({ speaking: !useStore.getState().speaking })} />
          <Btn label={`q:${quality}`} onPress={() => st.set({ quality: downgrade(quality) })} />
        </ScrollView>
      </View>
    </View>
  );
}

const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={{ backgroundColor: 'rgba(0,0,0,0.6)', margin: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 }}>
    <Text style={{ color: '#fff', fontSize: 11 }}>{label}</Text>
  </Pressable>
);

/** Na caçada o app vira o Radar do Dragão (tela própria); fora dela, cena 2D + interface. */
function HuntLayer() {
  const phase = usePhaseStore((s) => s.m.phase);
  if (phase === 'hunt') return <HuntScreen onComplete={() => controller.huntComplete()} />;
  return (
    <>
      <Scene />
      <Overlay />
    </>
  );
}
