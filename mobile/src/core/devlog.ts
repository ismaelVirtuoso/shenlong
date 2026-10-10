import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';

const host = Constants.expoConfig?.hostUri?.split(':')[0];
const who = `${Platform.OS}/${Constants.deviceName ?? '?'}`.replace(/\s+/g, '_');
const base = host ? `http://${host}:8790` : null;

/**
 * Dev: registra um evento de diagnóstico no console e no coletor do PC (tools/devlog, porta 8790),
 * para ver o que acontece com a voz direto no aparelho. Em produção não faz nada.
 */
export function dlog(msg: string) {
  if (!__DEV__) return;
  console.log(msg);
  if (!base) return;
  fetch(`${base}/log`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: `${who} ${msg}` }).catch(() => {});
}

/** Dev: copia o clipe de fala para o coletor do PC (lido antes de o STT apagá-lo). */
export function dclip(uri: string) {
  if (!__DEV__ || !base || Platform.OS === 'web') return;
  try {
    const bytes = new File(uri).bytesSync();
    fetch(`${base}/clip?who=${encodeURIComponent(who)}`, { method: 'POST', body: bytes as unknown as BodyInit }).catch(() => {});
  } catch {}
}
