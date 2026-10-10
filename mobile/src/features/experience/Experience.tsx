import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { useAudioRecorder } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { controller } from './controller';
import { Overlay } from './Overlay';
import { Scene } from '@/features/scene/Scene';
import { HuntScreen } from '@/features/hunt/HuntScreen';
import { useStore as usePhaseStore } from '@/features/experience/store';
import { DragonView } from '@/features/dragon3d/DragonView';
import { REC_OPTIONS } from '@/features/voice/recording';

export default function Experience() {
  useKeepAwake();
  const recorder = useAudioRecorder(REC_OPTIONS);

  useEffect(() => {
    controller.attach(recorder);
  }, [recorder]);

  useEffect(() => {
    controller.openingMusic();
    // só "background" de verdade: no iOS, "inactive" é transitório (alerta do sistema, central de
    // notificações, Control Center) e não deve derrubar a invocação nem desligar o microfone
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') controller.background();
      else if (s === 'active') controller.openingMusic();
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
