// Dynamic config: lets EAS inject EXPO_PUBLIC_API_URL per profile (see eas.json).
const BUNDLE_ID = 'br.com.vover.shenlong'; // placeholder — change before store submission (see docs/PLANO.md §8)

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  name: 'Shenlong',
  slug: 'shenlong',
  scheme: 'shenlong',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#04050c',
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        'O microfone é usado para ouvir você chamar Shenlong e fazer seus desejos. O áudio não é guardado.',
      NSLocationWhenInUseUsageDescription: 'A localização guia o Radar do Dragão até as esferas escondidas ao seu redor.',
      NSCameraUsageDescription: 'A câmera mostra as Esferas do Dragão escondidas no ambiente.',
      NSMotionUsageDescription: 'O movimento do aparelho (passos e inclinação) ajuda o radar e a câmera a encontrar as esferas.',
    },
  },
  android: {
    package: BUNDLE_ID,
    permissions: ['RECORD_AUDIO', 'VIBRATE', 'CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    adaptiveIcon: { backgroundColor: '#03100b', foregroundImage: './assets/adaptive-icon.png' },
    predictiveBackGestureEnabled: false,
  },
  web: { bundler: 'metro', favicon: './assets/icon.png' },
  plugins: [
    'expo-router',
    'expo-asset',
    [
      'expo-audio',
      { microphonePermission: 'O microfone é usado para ouvir você chamar Shenlong e fazer seus desejos.' },
    ],
    ['expo-location', { locationWhenInUsePermission: 'A localização guia o Radar do Dragão até as esferas escondidas ao seu redor.' }],
    ['expo-camera', { cameraPermission: 'A câmera mostra as Esferas do Dragão escondidas no ambiente.', microphonePermission: false, recordAudioAndroid: false }],
    ['expo-sensors', { motionPermission: 'O movimento do aparelho ajuda o radar e a câmera a encontrar as esferas.' }],
    [
      'expo-splash-screen',
      { image: './assets/icon.png', imageWidth: 220, resizeMode: 'contain', backgroundColor: '#03100b' },
    ],
  ],
  experiments: { typedRoutes: true },
  // só com URL definida (null vira {} no manifesto e quebrava o endereço do servidor)
  extra: process.env.EXPO_PUBLIC_API_URL ? { apiUrl: String(process.env.EXPO_PUBLIC_API_URL) } : {},
});
