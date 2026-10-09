import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Máximo de desejos antes de Shenlong se despedir (o servidor também sabe disso). */
export const MAX_WISHES = 3;
/** Silêncio (ms) no turno de escuta antes de Shenlong perguntar se ainda está aí. */
export const IDLE_MS = 18000;
/** Toque longo nas esferas (ms) que invoca sem voz. */
export const LONG_PRESS_MS = 1200;

/** URL do backend: env > extra > IP LAN da máquina do Metro (zero config no Expo Go). */
export function apiUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const extra = (Constants.expoConfig?.extra as { apiUrl?: string | null } | undefined)?.apiUrl;
  if (extra) return extra.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8787`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787';
}
