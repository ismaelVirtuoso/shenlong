import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSkiaReady } from '@/features/scene/useSkiaReady';

export default function RootLayout() {
  const ready = useSkiaReady();
  return (
    <SafeAreaProvider>
      <StatusBar style="light" hidden />
      <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 440 : undefined, alignSelf: 'center', backgroundColor: '#04050c' }}>
        {ready && <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#04050c' } }} />}
      </View>
    </SafeAreaProvider>
  );
}
