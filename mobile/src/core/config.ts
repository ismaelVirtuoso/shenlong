import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Desejos por invocação: concedido o desejo, Shenlong se despede e as esferas se espalham. */
export const MAX_WISHES = 1;
/** Silêncio (ms) no turno de escuta antes de Shenlong perguntar se ainda está aí. */
export const IDLE_MS = 18000;
/** Toque longo nas esferas (ms) que invoca sem voz. */
export const LONG_PRESS_MS = 1200;

/** Endereço que respondeu ao /health (ex.: emulador Android só alcança a máquina por 10.0.2.2). */
let working: string | null = null;
export const setWorkingApiUrl = (u: string) => {
  working = u;
};

/** Endereços a tentar: o principal e, no Android, o apelido do emulador para a máquina. */
export function apiCandidates(): string[] {
  const main = baseApiUrl();
  const alt = 'http://10.0.2.2:8787';
  return Platform.OS === 'android' && main !== alt ? [main, alt] : [main];
}

export const apiUrl = (): string => working ?? baseApiUrl();

/** URL do backend: env > extra > IP LAN da máquina do Metro (zero config no Expo Go). */
function baseApiUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const extra = (Constants.expoConfig?.extra as { apiUrl?: unknown } | undefined)?.apiUrl;
  if (typeof extra === 'string' && extra) return extra.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8787`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787';
}
