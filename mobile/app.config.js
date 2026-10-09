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
    },
  },
  android: {
    package: BUNDLE_ID,
    permissions: ['RECORD_AUDIO', 'VIBRATE'],
    adaptiveIcon: { backgroundColor: '#04050c', foregroundImage: './assets/icon.png' },
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
    [
      'expo-splash-screen',
      { image: './assets/icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#04050c' },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null },
});
