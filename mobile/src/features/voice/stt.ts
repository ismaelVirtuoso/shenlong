import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { apiUrl } from '@/core/config';

/** Backend sem STT configurado (501) ou inacessível (rede): o app degrada com elegância. */
export class SttUnavailable extends Error {}

export async function transcribe(uri: string): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    form.append('audio', await (await fetch(uri)).blob(), 'clip.webm');
  } else {
    form.append('audio', { uri, name: 'clip.m4a', type: 'audio/mp4' } as unknown as Blob);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${apiUrl()}/api/stt`, { method: 'POST', body: form, signal: ctrl.signal });
    if (res.status === 501) throw new SttUnavailable('stt_unavailable');
    if (!res.ok) throw new Error(`stt ${res.status}`);
    return ((await res.json()) as { text: string }).text ?? '';
  } catch (e) {
    if (e instanceof SttUnavailable) throw e;
    throw new SttUnavailable(String(e)); // rede/timeout: trata igual (modo offline)
  } finally {
    clearTimeout(timer);
    deleteClip(uri);
  }
}

/** áudio da criança nunca fica no aparelho */
export function deleteClip(uri: string) {
  {
    if (Platform.OS !== 'web') {
      try { new File(uri).delete(); } catch {}
    }
  }
}

/** Whisper alucina frases como estas em silêncio/ruído. */
const HALLUCINATIONS = ['legendas', 'amara', 'inscreva', 'musica'];
export function looksLikeHallucination(text: string, voiceMs: number): boolean {
  const n = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim();
  if (n.length < 2) return true;
  if (n.length < 40 && HALLUCINATIONS.some((h) => n.includes(h))) return true;
  return n === 'obrigado' && voiceMs < 700; // "obrigado" curtinho em ruído é alucinação típica
}
