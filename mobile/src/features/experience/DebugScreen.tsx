import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { controller } from './controller';
import { Overlay } from './Overlay';
import { Scene } from '@/features/scene/Scene';
import { useStore } from './store';
import type { Phase } from '@/core/machine';
import { downgrade } from '@/core/quality';

const PHASES: Phase[] = ['boot', 'altar', 'summoning', 'appearing', 'greeting', 'listening', 'thinking', 'speaking', 'goodbye', 'disappearing'];

/** Tela de desenvolvimento: pula para qualquer fase da experiência (abra /debug). */
export default function Debug() {
  const { phase } = useLocalSearchParams<{ phase?: string }>();
  const quality = useStore((s) => s.quality);
  useEffect(() => {
    if (phase && (PHASES as string[]).includes(phase)) controller.debugGoto(phase as Phase);
    else if (Platform.OS === 'web') {
      // web: toca a invocação sozinha para conferir a cena sem interação
      const t = setTimeout(() => controller.debugGoto('summoning'), 2500);
      return () => clearTimeout(t);
    }
  }, [phase]);
  const st = useStore.getState();
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Scene />
      <Overlay />
      <View style={{ position: 'absolute', top: 36, left: 0, right: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {PHASES.map((p) => (
            <Btn key={p} label={p} onPress={() => controller.debugGoto(p)} />
          ))}
          <Btn label="bolt" onPress={() => st.bump('bolt', { boltBig: true })} />
          <Btn label="wish" onPress={() => st.bump('wish')} />
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
