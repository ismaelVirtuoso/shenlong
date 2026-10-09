import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { controller } from './controller';
import { Overlay } from './Overlay';
import { Scene } from '@/features/scene/Scene';

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
      <Scene />
      <Overlay />
    </View>
  );
}
