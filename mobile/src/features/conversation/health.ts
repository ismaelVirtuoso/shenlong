import { apiUrl } from '@/core/config';

export interface BackendStatus {
  /** o celular alcança o servidor */
  reachable: boolean;
  stt: boolean;
  tts: boolean;
  llm: boolean;
  ttsEngine?: string | null;
}

export const UNKNOWN: BackendStatus = { reachable: false, stt: false, tts: false, llm: false };

/** Pergunta ao servidor o que ele consegue fazer (chaves configuradas, voz local…). */
export async function checkBackend(attempts = 3): Promise<BackendStatus> {
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`${apiUrl()}/health`, { signal: ctrl.signal });
      const j = (await r.json()) as Partial<BackendStatus>;
      return { reachable: true, stt: !!j.stt, tts: !!j.tts, llm: !!j.llm, ttsEngine: j.ttsEngine ?? null };
    } catch {
      // tenta de novo (rede lenta / thread JS ocupado na inicialização)
    } finally {
      clearTimeout(timer);
    }
  }
  return UNKNOWN;
}
