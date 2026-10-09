import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { controller } from './controller';
import { Overlay } from './Overlay';
import { Scene } from '@/features/scene/Scene';
import { HuntScreen } from '@/features/hunt/HuntScreen';
import { useStore as usePhaseStore } from '@/features/experience/store';
import { DragonView } from '@/features/dragon3d/DragonView';

const REC_OPTIONS = { ...RecordingPresets.LOW_QUALITY, sampleRate: 16000, numberOfChannels: 1, isMeteringEnabled: true };

export default function Experience() {
  useKeepAwake();
  const recorder = useAudioRecorder(REC_OPTIONS);

  useEffect(() => {
    controller.attach(recorder);
  }, [recorder]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') controller.background();
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#04050c' }}>
      <DragonView />
      <HuntLayer />
    </View>
  );
}

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
